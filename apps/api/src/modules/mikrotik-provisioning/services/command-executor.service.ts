import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DeviceStatus } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { MikrotikClientFactory } from '../../../core/mikrotik/mikrotik-client.factory';
import type { IMikrotikClient } from '../../../core/mikrotik/interfaces/mikrotik-client.interface';
import { isValidRouterOsId } from '../../../core/security/snapshot-integrity.util';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { DevicesService } from '../../devices/devices.service';
import type { StartAutoProvisioningDto } from '../dto/auto-provisioning.dto';
import type { AutoProvisioningPlan, PlannedCommandSpec } from '../interfaces/auto-provisioning.interface';
import { maskExecutionWords } from '../utils/secret-redactor.util';
import { resolveActiveDefaultRoutesEgress } from '../utils/topology-helpers.util';
import { ProvisioningBackupService } from './provisioning-backup.service';
import { ProvisioningLoggerService } from './provisioning-logger.service';
import { ProvisioningValidatorService } from './provisioning-validator.service';
import { RouterDiscoveryEngineService } from './router-discovery-engine.service';

const STALE_OPERATION_TIMEOUT_MS = 10 * 60 * 1000;
const ACTIVE_OPERATION_STATUSES = ['PENDING', 'BACKING_UP', 'RUNNING', 'VERIFYING'] as const;
const READONLY_ROUTEROS_ATTRS = new Set([
  '.id',
  'dynamic',
  'invalid',
  'running',
  'actual-mtu',
  'actual-interface',
  'default',
  'bytes',
  'packets',
  'packets-per-second',
  'slave',
  'inactive',
]);

interface TrackedCreatedResource {
  order: number;
  stage: string;
  rollbackWords: string[];
  createdId?: string;
  basePath?: string;
}

export interface RollbackExecutionReport {
  attempted: number;
  succeeded: number;
  failed: number;
  verified: boolean;
  allSucceeded: boolean;
  items: Array<{
    order: number;
    stage: string;
    commandMasked: string;
    status: 'ROLLED_BACK' | 'ROLLBACK_FAILED';
    error?: string;
  }>;
}

@Injectable()
export class CommandExecutorService implements OnModuleInit {
  private readonly logger = new Logger(CommandExecutorService.name);
  private readonly activeCancellations = new Set<string>();
  private readonly defaultCommandTimeoutMs = 15000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clientFactory: MikrotikClientFactory,
    private readonly discoveryService: RouterDiscoveryEngineService,
    private readonly validatorService: ProvisioningValidatorService,
    private readonly backupService: ProvisioningBackupService,
    private readonly loggerService: ProvisioningLoggerService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.quarantineOrphanedOperations().catch((err) => {
      this.logger.warn(
        `Orphaned operation recovery scan skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  async quarantineOrphanedOperations(deviceId?: string): Promise<number> {
    if (typeof this.prisma.provisioningOperation?.findMany !== 'function') return 0;
    const cutoff = new Date(Date.now() - STALE_OPERATION_TIMEOUT_MS);
    const activeRows = await this.prisma.provisioningOperation.findMany({
      where: {
        ...(deviceId ? { deviceId } : {}),
        status: { in: [...ACTIVE_OPERATION_STATUSES] },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    let recovered = 0;
    for (const row of activeRows) {
      if (deviceId && row.deviceId !== deviceId) continue;
      if (!ACTIVE_OPERATION_STATUSES.includes(row.status as any)) continue;
      const lastTouch = row.updatedAt || row.startedAt || row.createdAt;
      if (!lastTouch || new Date(lastTouch) <= cutoff) {
        if (typeof this.prisma.provisioningOperation?.update === 'function') {
          await this.prisma.provisioningOperation.update({
            where: { id: row.id },
            data: {
              status: 'FAILED',
              failureReason:
                'تم حجر عملية برمجة متوقفة (يتيمة) بعد انقطاع أو إعادة تشغيل الخادم دون اكتمالها.',
              completedAt: new Date(),
            },
          });
          recovered++;
        }
      }
    }
    return recovered;
  }

  async requestCancellation(tenantId: string, operationId: string): Promise<{ cancelled: boolean; message: string }> {
    const op = await this.prisma.provisioningOperation.findFirst({
      where: { id: operationId, tenantId },
    });
    if (!op) {
      throw new NotFoundException({
        code: 'OPERATION_NOT_FOUND',
        message: 'لم يتم العثور على عملية البرمجة المطلوبة.',
      });
    }

    if (op.status === 'COMPLETED' || op.status === 'FAILED' || op.status === 'CANCELLED') {
      return {
        cancelled: op.status === 'CANCELLED',
        message: `العملية منتهية بالفعل بالحالة (${op.status}).`,
      };
    }

    this.activeCancellations.add(operationId);
    await this.prisma.provisioningOperation.update({
      where: { id: operationId },
      data: { cancelRequested: true },
    });

    return {
      cancelled: true,
      message: 'تم إرسال طلب إيقاف آمن؛ سيتوقف التنفيذ قبل الأمر التالي وتُطبق قواعد الأمان.',
    };
  }

  /**
   * Executes an approved Auto Provisioning Plan sequentially on the target device:
   * 1. Enforces explicit plan approval & concurrency lock.
   * 2. Re-verifies management path safety live (Stage 0).
   * 3. Creates & verifies pre-change Binary + RSC backups before modifying router state.
   * 4. Executes stages sequentially, validating dependencies, timeouts, cancellation & tracking rollbackStack.
   * 5. Runs independent multi-point post-provisioning verification.
   */
  async executePlan(params: {
    tenantId: string;
    deviceId: string;
    userId?: string;
    dto: StartAutoProvisioningDto;
    plan: AutoProvisioningPlan;
  }) {
    return this.startPlanExecution({ ...params, asyncExecution: false });
  }

  /**
   * Starts an approved Auto Provisioning Plan sequentially on the target device:
   * 1. Enforces explicit plan approval & concurrency lock synchronously.
   * 2. Creates persistent operation/step/command rows synchronously so UI polling starts immediately.
   * 3. When `asyncExecution=true`, returns PENDING operation immediately while running Stage 0,
   *    Pre-Backup, sequential commands, rollbackStack, and post-verification in the background.
   */
  async startPlanExecution(params: {
    tenantId: string;
    deviceId: string;
    userId?: string;
    dto: StartAutoProvisioningDto;
    plan: AutoProvisioningPlan;
    asyncExecution?: boolean;
  }) {
    const { tenantId, deviceId, userId, dto, plan, asyncExecution = true } = params;

    if (!dto.confirmPlan) {
      throw new BadRequestException({
        code: 'PLAN_CONFIRMATION_REQUIRED',
        message: 'يجب موافقة المستخدم الصريحة على خطة البرمجة بعد معاينتها قبل بدء التنفيذ.',
      });
    }

    if (!plan.canProceed) {
      throw new BadRequestException({
        code: 'PLAN_BLOCKED_BY_SAFETY_CHECKS',
        message: plan.blockedReasons[0] || 'الخطة محظورة بسبب فحوصات الأمان أو الاعتماديات.',
        blockedReasons: plan.blockedReasons,
      });
    }

    if (plan.wanConfirmationRequired && !dto.confirmWanChange) {
      throw new BadRequestException({
        code: 'WAN_CONFIRMATION_REQUIRED',
        message: plan.wanConfirmationReasons[0] || 'يلزم تأكيد واجهة الإنترنت WAN قبل التعديل.',
      });
    }

    if ((plan.template || dto.template || 'CLEAN_SETUP') === 'CLEAN_SETUP' && dto.createPreBackup === false) {
      throw new BadRequestException({
        code: 'PRE_BACKUP_REQUIRED_FOR_CLEAN_SETUP',
        message: 'وضع الإعداد النظيف (CLEAN_SETUP) يتطلب إنشاء نسخة احتياطية مشفرة والتحقق منها قبل أي تعديل.',
      });
    }

    if (DevicesService.activeDeviceOperations.has(deviceId)) {
      throw new ConflictException({
        code: 'DEVICE_OPERATION_IN_PROGRESS',
        message: 'توجد عملية برمجة أو نسخ احتياطي جارية حالياً على هذا الراوتر.',
      });
    }

    await this.quarantineOrphanedOperations(deviceId);
    if (typeof this.prisma.provisioningOperation?.findFirst === 'function') {
      const activeDbOp = await this.prisma.provisioningOperation.findFirst({
        where: {
          deviceId,
          status: { in: [...ACTIVE_OPERATION_STATUSES] },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (
        activeDbOp &&
        activeDbOp.deviceId === deviceId &&
        ACTIVE_OPERATION_STATUSES.includes(activeDbOp.status as any)
      ) {
        throw new ConflictException({
          code: 'DEVICE_OPERATION_IN_PROGRESS',
          message: 'توجد عملية برمجة نشطة مسجلة على هذا الراوتر في قاعدة البيانات؛ يرجى الانتظار لحين اكتمالها.',
        });
      }
    }

    const device = await this.prisma.mikroTikDevice.findFirst({
      where: { id: deviceId, tenantId, deletedAt: null },
    });
    if (!device) {
      throw new NotFoundException({
        code: 'DEVICE_NOT_FOUND',
        message: `لم يتم العثور على الراوتر (${deviceId}).`,
      });
    }

    const operationId = uuidv4();
    const startMs = Date.now();
    DevicesService.activeDeviceOperations.add(deviceId);

    let stepIdByStage: Map<string, string>;
    let commandLogIdByOrder: Map<number, string>;
    try {
      const created = await this.loggerService.createOperationRecord({
        operationId,
        tenantId,
        deviceId,
        userId,
        executionMode: dto.executionMode || 'CLOUD',
        plan,
        configSnapshot: dto as unknown as Record<string, unknown>,
      });
      stepIdByStage = created.stepIdByStage;
      commandLogIdByOrder = created.commandLogIdByOrder;
    } catch (createErr) {
      DevicesService.activeDeviceOperations.delete(deviceId);
      throw createErr;
    }

    const runPromise = this.runPreparedExecution({
      operationId,
      startMs,
      tenantId,
      deviceId,
      device,
      userId,
      dto,
      plan,
      stepIdByStage,
      commandLogIdByOrder,
    });

    if (asyncExecution) {
      runPromise.catch((err) => {
        this.logger.error(
          `Unhandled async execution failure (${operationId}): ${err instanceof Error ? err.message : String(err)}`,
        );
      });
      return this.loggerService.getOperationDetails(tenantId, operationId);
    }

    return runPromise;
  }

  private async runPreparedExecution(params: {
    operationId: string;
    startMs: number;
    tenantId: string;
    deviceId: string;
    device: any;
    userId?: string;
    dto: StartAutoProvisioningDto;
    plan: AutoProvisioningPlan;
    stepIdByStage: Map<string, string>;
    commandLogIdByOrder: Map<number, string>;
  }) {
    const {
      operationId,
      startMs,
      tenantId,
      deviceId,
      device,
      userId,
      dto,
      plan,
      stepIdByStage,
      commandLogIdByOrder,
    } = params;

    const rollbackStack: TrackedCreatedResource[] = [];
    let succeededCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let preBackupId: string | undefined;
    let rscBackupId: string | undefined;
    let activeClient: IMikrotikClient | undefined;

    try {
      const client = await this.clientFactory.getClient({
        id: device.id,
        name: device.name,
        host: device.host,
        apiPort: device.apiPort,
        restPort: device.restPort,
        useSsl: device.useSsl,
        username: device.username,
        passwordEncrypted: device.passwordEncrypted,
        iv: device.iv,
        authTag: device.authTag,
        rosVersion: device.rosVersion,
      });
      activeClient = client;

      // STAGE 0: Live Management & State Verification immediately before mutating anything
      const liveReport = await this.discoveryService.discoverWithClient(client, {
        id: device.id,
        name: device.name,
        host: device.host,
        rosVersion: device.rosVersion,
        useRest: device.rosVersion === 'V7' && Boolean(device.restPort),
      });
      const liveMgmt = this.validatorService.verifyManagementSafety(liveReport, dto);
      if (!liveMgmt.isDetermined || liveMgmt.isSevered) {
        const reason =
          liveMgmt.blockedReasons[0] ||
          'فشل فحص حماية مسار الإدارة المباشر قبل التنفيذ؛ تم إيقاف العملية لحماية الاتصال بالراوتر.';
        await this.prisma.provisioningOperation.update({
          where: { id: operationId },
          data: {
            status: 'FAILED',
            failureReason: reason,
            completedAt: new Date(),
            durationMs: Date.now() - startMs,
          },
        });
        return this.loggerService.getOperationDetails(tenantId, operationId);
      }

      // STAGE 1: Mandatory Pre-Provisioning Backups (Binary + RSC)
      const isCleanSetup = (plan.template || dto.template || 'CLEAN_SETUP') === 'CLEAN_SETUP';
      if (isCleanSetup || dto.createPreBackup !== false) {
        await this.prisma.provisioningOperation.update({
          where: { id: operationId },
          data: { status: 'BACKING_UP' },
        });
        const bundle = await this.backupService.createBackupBundle({
          tenantId,
          deviceId,
          userId,
          operationId,
          password: dto.backupPassword,
          includeRscExport: true,
          requireOffRouterBackup: isCleanSetup,
          existingClient: client,
        });
        preBackupId = bundle.binaryBackup?.id;
        rscBackupId = bundle.rscBackup?.id;
        await this.prisma.provisioningOperation.update({
          where: { id: operationId },
          data: { preBackupId: preBackupId ?? null, rscBackupId: rscBackupId ?? null },
        });
      }

      // STAGE 2: Sequential Execution
      await this.prisma.provisioningOperation.update({
        where: { id: operationId },
        data: { status: 'RUNNING' },
      });

      const failedOrSkippedStages = new Set<string>();
      const totalCmds = Math.max(plan.totalPlannedCommands, 1);

      for (const stage of plan.stages) {
        const stepId = stepIdByStage.get(stage.stage);

        if (await this.isCancelled(operationId)) {
          await this.handleCancellationRollback({
            client,
            operationId,
            rollbackStack,
            startMs,
            succeededCount,
            failedCount,
            skippedCount,
          });
          return this.loggerService.getOperationDetails(tenantId, operationId);
        }

        if (stage.status !== 'PLANNED' || stage.commands.length === 0) {
          skippedCount += stage.commands.length;
          if (stage.status === 'SKIPPED_UNSUPPORTED') {
            failedOrSkippedStages.add(stage.stage);
          }
          continue;
        }

        // Dependency verification
        const unmetDep = stage.dependsOn.find((dep) => {
          const depStage = plan.stages.find((s) => s.stage === dep);
          return depStage?.status === 'PLANNED' && failedOrSkippedStages.has(dep);
        });
        if (unmetDep) {
          if (stepId) {
            await this.prisma.provisioningStep.update({
              where: { id: stepId },
              data: {
                status: 'FAILED',
                errorMessage: `تم تخطي المرحلة لعدم اكتمال مرحلة (${unmetDep}) المعتمدة عليها.`,
                completedAt: new Date(),
              },
            });
          }
          failedOrSkippedStages.add(stage.stage);
          continue;
        }

        const stepStart = Date.now();
        if (stepId) {
          await this.prisma.provisioningStep.update({
            where: { id: stepId },
            data: { status: 'RUNNING', startedAt: new Date() },
          });
        }

        await this.prisma.provisioningOperation.update({
          where: { id: operationId },
          data: { currentStepOrder: stage.stepOrder },
        });

        let stageError: string | undefined;

        for (const cmd of stage.commands) {
          if (await this.isCancelled(operationId)) {
            await this.handleCancellationRollback({
              client,
              operationId,
              rollbackStack,
              startMs,
              succeededCount,
              failedCount,
              skippedCount,
            });
            return this.loggerService.getOperationDetails(tenantId, operationId);
          }

          this.assertCommandSafeToExecute(cmd);
          const cmdLogId = commandLogIdByOrder.get(cmd.order);
          if (cmdLogId) await this.loggerService.markCommandStarted(cmdLogId);

          const cmdStart = Date.now();
          try {
            const dynamicPreRollback = await this.captureDynamicPreChangeRollback(client, cmd);
            const rawResp = await this.executeSingleCommandWithTimeoutAndSafeRetry(client, cmd);
            const dur = Date.now() - cmdStart;
            const returnedId = this.extractCreatedResourceId(rawResp);
            const cmdPath = cmd.executionWords[0] || '';
            if (returnedId && isValidRouterOsId(returnedId) && cmdPath.endsWith('/add')) {
              const basePath = cmdPath.replace(/\/add$/, '');
              rollbackStack.push({
                order: cmd.order,
                stage: stage.stage,
                createdId: returnedId,
                basePath,
                rollbackWords: [`${basePath}/remove`, `=.id=${returnedId}`],
              });
            } else if (dynamicPreRollback && dynamicPreRollback.length > 0) {
              rollbackStack.push({
                order: cmd.order,
                stage: stage.stage,
                rollbackWords: dynamicPreRollback,
              });
            } else if (cmd.rollbackWords && cmd.rollbackWords.length > 0) {
              rollbackStack.push({
                order: cmd.order,
                stage: stage.stage,
                rollbackWords: cmd.rollbackWords,
              });
            }

            if (rollbackStack.length > 0) {
              await this.persistRollbackJournal(operationId, rollbackStack);
            }

            succeededCount++;
            if (cmdLogId) {
              await this.loggerService.markCommandFinished(
                cmdLogId,
                'SUCCESS',
                dur,
                rawResp ? JSON.stringify(rawResp) : 'DONE',
              );
            }
          } catch (cmdErr) {
            const dur = Date.now() - cmdStart;
            const errMsg = cmdErr instanceof Error ? cmdErr.message : String(cmdErr);

            // Idempotent safe acceptance if resource already exists on router
            if (/already exists|already have|failure: already/i.test(errMsg) && cmd.idempotent) {
              skippedCount++;
              if (cmdLogId) {
                await this.loggerService.markCommandFinished(
                  cmdLogId,
                  'SKIPPED',
                  dur,
                  'ALREADY_EXISTS',
                  errMsg,
                );
              }
              continue;
            }

            failedCount++;
            stageError = errMsg;
            if (cmdLogId) {
              await this.loggerService.markCommandFinished(cmdLogId, 'FAILED', dur, undefined, errMsg);
            }
            break;
          }

          const pct = Math.min(90, Math.round(((succeededCount + skippedCount) / totalCmds) * 85) + 5);
          await this.prisma.provisioningOperation.update({
            where: { id: operationId },
            data: {
              progressPercent: pct,
              succeededCommands: succeededCount,
              failedCommands: failedCount,
              skippedCommands: skippedCount,
            },
          });
        }

        if (stageError) {
          failedOrSkippedStages.add(stage.stage);
          if (stepId) {
            await this.prisma.provisioningStep.update({
              where: { id: stepId },
              data: {
                status: 'FAILED',
                errorMessage: stageError,
                completedAt: new Date(),
                durationMs: Date.now() - stepStart,
              },
            });
          }

          // Rollback SudaFi-created and modified resources on failure and record real rollback status
          const rollbackReport = await this.runTrackedRollback(client, operationId, rollbackStack);
          const finalStatus =
            rollbackReport.attempted > 0 && rollbackReport.allSucceeded ? 'ROLLED_BACK' : 'FAILED';
          const rollbackSummaryNote =
            rollbackReport.attempted === 0
              ? ''
              : rollbackReport.allSucceeded
                ? ` — تم التراجع والتحقق عن (${rollbackReport.succeeded}) إجراء`
                : ` — فشل التراجع عن (${rollbackReport.failed}/${rollbackReport.attempted}) إجراء`;

          await this.prisma.provisioningOperation.update({
            where: { id: operationId },
            data: {
              status: finalStatus,
              failureReason: `فشل في مرحلة (${stage.title}): ${stageError}${rollbackSummaryNote}`,
              verificationResult: { rollbackReport } as any,
              succeededCommands: succeededCount,
              failedCommands: failedCount,
              skippedCommands: skippedCount,
              completedAt: new Date(),
              durationMs: Date.now() - startMs,
            },
          });
          return this.loggerService.getOperationDetails(tenantId, operationId);
        }

        if (stepId) {
          await this.prisma.provisioningStep.update({
            where: { id: stepId },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
              durationMs: Date.now() - stepStart,
            },
          });
        }
      }

      // STAGE 3: Independent Post-Provisioning Verification
      await this.prisma.provisioningOperation.update({
        where: { id: operationId },
        data: { status: 'VERIFYING', progressPercent: 95 },
      });

      const verification = await this.verifyPostProvisioning(client, dto);
      if (verification.overallStatus === 'VERIFICATION_FAILED') {
        const rollbackReport = await this.runTrackedRollback(client, operationId, rollbackStack);
        const finalStatus =
          rollbackReport.attempted > 0 && rollbackReport.allSucceeded ? 'ROLLED_BACK' : 'FAILED';
        await this.prisma.provisioningOperation.update({
          where: { id: operationId },
          data: {
            status: finalStatus,
            failureReason: `${verification.diagnosticsMessage}${rollbackReport.attempted > 0 && !rollbackReport.allSucceeded ? ` (تعذر التراجع الكامل: ${rollbackReport.failed} فشل)` : ''}`,
            verificationResult: { ...verification, rollbackReport } as any,
            succeededCommands: succeededCount,
            failedCommands: failedCount,
            skippedCommands: skippedCount,
            completedAt: new Date(),
            durationMs: Date.now() - startMs,
          },
        });
        return this.loggerService.getOperationDetails(tenantId, operationId);
      }

      // STAGE 4: Persist Active Configuration & Sync HotspotProfile
      await this.persistSuccessState(
        tenantId,
        deviceId,
        operationId,
        userId,
        dto,
        verification.overallStatus === 'VERIFIED_READY',
      );
      this.discoveryService.clearCache(tenantId, deviceId);

      await this.prisma.provisioningOperation.update({
        where: { id: operationId },
        data: {
          status: 'COMPLETED',
          progressPercent: 100,
          verificationResult: verification as any,
          succeededCommands: succeededCount,
          failedCommands: failedCount,
          skippedCommands: skippedCount,
          completedAt: new Date(),
          durationMs: Date.now() - startMs,
        },
      });

      await this.auditLogsService.log({
        tenantId,
        userId: userId ?? null,
        action: 'AUTO_PROVISIONING_COMPLETED',
        entity: 'provisioning_operation',
        entityId: operationId,
        newValues: {
          deviceId,
          template: plan.template,
          overallVerificationStatus: verification.overallStatus,
          succeededCommands: succeededCount,
          skippedCommands: skippedCount,
          preBackupId,
        },
      });

      return this.loggerService.getOperationDetails(tenantId, operationId);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Auto provisioning failed for device ${deviceId}: ${errMsg}`);

      let rollbackReport: RollbackExecutionReport | undefined;
      if (activeClient && rollbackStack.length > 0) {
        rollbackReport = await this.runTrackedRollback(activeClient, operationId, rollbackStack);
      }

      const finalStatus =
        rollbackReport && rollbackReport.attempted > 0 && rollbackReport.allSucceeded
          ? 'ROLLED_BACK'
          : 'FAILED';
      await this.prisma.provisioningOperation.update({
        where: { id: operationId },
        data: {
          status: finalStatus,
          failureReason: `${errMsg}${rollbackReport && rollbackReport.attempted > 0 ? (rollbackReport.allSucceeded ? ' — تم التراجع عن التغييرات' : ` — فشل التراجع عن ${rollbackReport.failed} خطوة`) : ''}`,
          ...(rollbackReport ? { verificationResult: { rollbackReport } as any } : {}),
          succeededCommands: succeededCount,
          failedCommands: failedCount,
          skippedCommands: skippedCount,
          completedAt: new Date(),
          durationMs: Date.now() - startMs,
        },
      });
      return this.loggerService.getOperationDetails(tenantId, operationId);
    } finally {
      this.activeCancellations.delete(operationId);
      DevicesService.activeDeviceOperations.delete(deviceId);
    }
  }

  private async isCancelled(operationId: string): Promise<boolean> {
    if (this.activeCancellations.has(operationId)) return true;
    if (typeof this.prisma.provisioningOperation?.findFirst === 'function') {
      const row = await this.prisma.provisioningOperation
        .findFirst({
          where: { id: operationId },
          select: { id: true, cancelRequested: true },
        })
        .catch(() => null);
      if (row && (!row.id || row.id === operationId) && row.cancelRequested === true) {
        this.activeCancellations.add(operationId);
        return true;
      }
    }
    return false;
  }

  private assertCommandSafeToExecute(cmd: PlannedCommandSpec): void {
    const mainCmd = cmd.executionWords[0] || '';
    if (mainCmd.endsWith('/remove')) {
      for (const w of cmd.executionWords.slice(1)) {
        if (/\[find/i.test(w) || /^find\s*=/i.test(w)) {
          throw new BadRequestException({
            code: 'UNSAFE_WILDCARD_COMMAND_BLOCKED',
            message: 'تم حظر أمر غير آمن يستخدم [find] بدلاً من تحديد الملكية بالمعرف (.id).',
          });
        }
      }
    }
    for (const w of cmd.executionWords) {
      if (
        !w.startsWith('=on-login=') &&
        !w.startsWith('=on-logout=') &&
        !w.startsWith('=on-event=') &&
        !w.startsWith('=source=') &&
        !w.startsWith('=script=')
      ) {
        if (/remove\s+\[find/i.test(w) || /\[find/i.test(w)) {
          throw new BadRequestException({
            code: 'UNSAFE_WILDCARD_COMMAND_BLOCKED',
            message: 'تم حظر أمر غير آمن يستخدم [find] بدلاً من تحديد الملكية بالمعرف (.id).',
          });
        }
      }
    }
  }

  private async persistRollbackJournal(
    operationId: string,
    rollbackStack: TrackedCreatedResource[],
  ): Promise<void> {
    if (typeof this.prisma.provisioningOperation?.update !== 'function') return;
    const journal = rollbackStack.map((item) => ({
      order: item.order,
      stage: item.stage,
      createdId: item.createdId,
      basePath: item.basePath,
      rollbackCommandMasked: maskExecutionWords(item.rollbackWords).join(' '),
    }));
    await this.prisma.provisioningOperation
      .update({
        where: { id: operationId },
        data: {
          verificationResult: { rollbackJournal: journal } as any,
        },
      })
      .catch(() => {});
  }

  private normalizeRawPrintRows(raw: any): Array<Record<string, any>> {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item) => item && typeof item === 'object')
      .map((item) => (item.attributes && typeof item.attributes === 'object' ? item.attributes : item));
  }

  private async captureDynamicPreChangeRollback(
    client: IMikrotikClient,
    cmd: PlannedCommandSpec,
  ): Promise<string[] | undefined> {
    const cmdPath = cmd.executionWords[0] || '';
    const isSet = cmdPath.endsWith('/set');
    const isRemove = cmdPath.endsWith('/remove');
    if ((!isSet && !isRemove) || typeof client.runRawCommand !== 'function') {
      return undefined;
    }

    const basePath = cmdPath.replace(/\/(set|remove)$/, '');
    try {
      const printPromise = client.runRawCommand([`${basePath}/print`]);
      const rawRows = await Promise.race([
        printPromise,
        new Promise<null>((resolve) => {
          const t = setTimeout(() => resolve(null), 4000);
          t.unref?.();
        }),
      ]);
      const rows = this.normalizeRawPrintRows(rawRows);
      if (rows.length === 0) return undefined;

      const idArg = cmd.executionWords.find((w) => w.startsWith('=.id='))?.slice(5);
      const numbersArg = cmd.executionWords.find((w) => w.startsWith('=numbers='))?.slice(9);
      const isSingleton =
        !idArg &&
        !numbersArg &&
        [
          '/ip/dns',
          '/system/identity',
          '/system/clock',
          '/system/ntp/client',
          '/system/note',
        ].includes(basePath);

      const targetRow = idArg
        ? rows.find((r) => r['.id'] === idArg)
        : numbersArg
          ? rows.find((r) => r.name === numbersArg || r['default-name'] === numbersArg || r['.id'] === numbersArg)
          : isSingleton
            ? rows[0]
            : undefined;

      if (!targetRow) return undefined;

      if (isRemove) {
        const addWords = [`${basePath}/add`];
        for (const [k, v] of Object.entries(targetRow)) {
          if (READONLY_ROUTEROS_ATTRS.has(k) || v === undefined || v === null) continue;
          const strVal = typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v);
          addWords.push(`=${k}=${strVal}`);
        }
        return addWords.length > 1 ? addWords : undefined;
      }

      // For /set: restore exact previous attribute values for every field being changed
      const setWords = [cmdPath];
      if (!isSingleton) {
        if (targetRow['.id']) {
          setWords.push(`=.id=${targetRow['.id']}`);
        } else if (idArg) {
          setWords.push(`=.id=${idArg}`);
        } else if (numbersArg) {
          setWords.push(`=numbers=${numbersArg}`);
        }
      }

      let capturedAttr = 0;
      for (const word of cmd.executionWords.slice(1)) {
        if (!word.startsWith('=')) continue;
        const eqIdx = word.indexOf('=', 1);
        if (eqIdx <= 1) continue;
        const key = word.slice(1, eqIdx);
        if (key === '.id' || key === 'numbers') continue;
        if (Object.prototype.hasOwnProperty.call(targetRow, key)) {
          const prevVal = targetRow[key];
          const strVal =
            prevVal === undefined || prevVal === null
              ? ''
              : typeof prevVal === 'boolean'
                ? prevVal
                  ? 'yes'
                  : 'no'
                : String(prevVal);
          setWords.push(`=${key}=${strVal}`);
          capturedAttr++;
        }
      }

      return capturedAttr > 0 ? setWords : undefined;
    } catch {
      return undefined;
    }
  }

  private async verifyIfAddAlreadyApplied(
    client: IMikrotikClient,
    cmd: PlannedCommandSpec,
  ): Promise<{ ret: string } | undefined> {
    const cmdPath = cmd.executionWords[0] || '';
    if (!cmdPath.endsWith('/add') || typeof client.runRawCommand !== 'function') {
      return undefined;
    }

    const basePath = cmdPath.replace(/\/add$/, '');
    const attrs = new Map<string, string>();
    for (const w of cmd.executionWords.slice(1)) {
      if (!w.startsWith('=')) continue;
      const idx = w.indexOf('=', 1);
      if (idx > 1) attrs.set(w.slice(1, idx), w.slice(idx + 1));
    }

    const matchKeys = ['name', 'address', 'comment', 'host'].filter((k) => attrs.has(k));
    if (matchKeys.length === 0 && !(attrs.has('bridge') && attrs.has('interface'))) {
      return undefined;
    }

    try {
      const rows = this.normalizeRawPrintRows(await client.runRawCommand([`${basePath}/print`]));
      const found = rows.find((row) => {
        if (attrs.has('name')) return row.name === attrs.get('name');
        if (attrs.has('bridge') && attrs.has('interface')) {
          return row.bridge === attrs.get('bridge') && row.interface === attrs.get('interface');
        }
        if (attrs.has('address') && attrs.has('interface')) {
          return row.address === attrs.get('address') && row.interface === attrs.get('interface');
        }
        if (attrs.has('host')) return row.host === attrs.get('host');
        if (attrs.has('comment')) return row.comment === attrs.get('comment');
        return false;
      });
      if (found && typeof found['.id'] === 'string' && isValidRouterOsId(found['.id'])) {
        return { ret: found['.id'] };
      }
    } catch {}
    return undefined;
  }

  private async executeSingleCommandWithTimeoutAndSafeRetry(
    client: IMikrotikClient,
    cmd: PlannedCommandSpec,
  ): Promise<any> {
    if (!client.runRawCommand) {
      throw new Error('عميل الاتصال لا يدعم تنفيذ أوامر RouterOS.');
    }

    const runOnce = async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          client.runRawCommand!(cmd.executionWords),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error(`انتهت مهلة تنفيذ الأمر (${this.defaultCommandTimeoutMs}ms)`)),
              this.defaultCommandTimeoutMs,
            );
            timer.unref?.();
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };

    try {
      return await runOnce();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient = /timeout|انتهت مهلة|ECONNRESET|ETIMEDOUT|socket|disconnect|Not connected/i.test(msg);
      if (isTransient) {
        if (typeof client.connect === 'function') {
          await client.connect().catch(() => {});
        }
        const alreadyApplied = await this.verifyIfAddAlreadyApplied(client, cmd);
        if (alreadyApplied) {
          return alreadyApplied;
        }
      }
      // Policy: ONLY retry commands explicitly marked safeToRetry after confirming reconnection/absence
      if (isTransient && cmd.safeToRetry) {
        return await runOnce();
      }
      throw err;
    }
  }

  private extractCreatedResourceId(rawResp: any): string | undefined {
    if (Array.isArray(rawResp)) {
      const done = rawResp.find((r) => r?.type === '!done');
      if (done?.attributes?.ret && isValidRouterOsId(done.attributes.ret)) {
        return done.attributes.ret;
      }
    } else if (rawResp && typeof rawResp === 'object') {
      const candidate = rawResp.ret || rawResp['.id'];
      if (typeof candidate === 'string' && isValidRouterOsId(candidate)) {
        return candidate;
      }
    }
    return undefined;
  }

  private async runTrackedRollback(
    client: IMikrotikClient,
    operationId: string,
    rollbackStack: TrackedCreatedResource[],
  ): Promise<RollbackExecutionReport> {
    const items: RollbackExecutionReport['items'] = [];
    if (!client.runRawCommand || rollbackStack.length === 0) {
      return { attempted: 0, succeeded: 0, failed: 0, verified: true, allSucceeded: true, items };
    }

    if (typeof client.connect === 'function') {
      await client.connect().catch(() => {});
    }

    let succeeded = 0;
    let failed = 0;

    for (const item of [...rollbackStack].reverse()) {
      const runRb = async () => {
        let rbTimer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            client.runRawCommand!(item.rollbackWords),
            new Promise((_, reject) => {
              rbTimer = setTimeout(() => reject(new Error('Rollback timeout')), 8000);
              rbTimer.unref?.();
            }),
          ]);
        } finally {
          if (rbTimer) clearTimeout(rbTimer);
        }
      };

      const masked = maskExecutionWords(item.rollbackWords).join(' ');
      try {
        await runRb();
        succeeded++;
        items.push({ order: item.order, stage: item.stage, commandMasked: masked, status: 'ROLLED_BACK' });
      } catch (rbErr) {
        const msg1 = rbErr instanceof Error ? rbErr.message : String(rbErr);
        // Attempt reconnect & single retry if transient connection drop occurred during rollback
        if (/timeout|ECONNRESET|ETIMEDOUT|socket|disconnect|Not connected/i.test(msg1) && typeof client.connect === 'function') {
          try {
            await client.connect();
            await runRb();
            succeeded++;
            items.push({ order: item.order, stage: item.stage, commandMasked: masked, status: 'ROLLED_BACK' });
            continue;
          } catch (retryErr) {
            const msg2 = retryErr instanceof Error ? retryErr.message : String(retryErr);
            failed++;
            items.push({ order: item.order, stage: item.stage, commandMasked: masked, status: 'ROLLBACK_FAILED', error: msg2 });
            this.logger.warn(`[Rollback Failure] Op=${operationId} order=${item.order}: ${msg2}`);
            continue;
          }
        }
        failed++;
        items.push({ order: item.order, stage: item.stage, commandMasked: masked, status: 'ROLLBACK_FAILED', error: msg1 });
        this.logger.warn(`[Rollback Failure] Op=${operationId} order=${item.order}: ${msg1}`);
      }
    }

    // Post-rollback router verification
    let verified = failed === 0;
    if (verified && typeof client.ping === 'function') {
      const aliveAfter = await client.ping().catch(() => false);
      if (!aliveAfter) verified = false;
    }
    if (verified) {
      for (const created of rollbackStack) {
        if (!created.createdId || !created.basePath) continue;
        try {
          const rows = this.normalizeRawPrintRows(await client.runRawCommand([`${created.basePath}/print`]));
          if (rows.some((r) => r['.id'] === created.createdId)) {
            verified = false;
            failed++;
            items.push({
              order: created.order,
              stage: created.stage,
              commandMasked: `${created.basePath}/print verify gone ${created.createdId}`,
              status: 'ROLLBACK_FAILED',
              error: 'المورد المستحدث لا يزال ظاهراً على الراوتر بعد التراجع',
            });
          }
        } catch {}
      }
    }

    return {
      attempted: rollbackStack.length,
      succeeded,
      failed,
      verified,
      allSucceeded: failed === 0 && verified,
      items,
    };
  }

  private async handleCancellationRollback(params: {
    client: IMikrotikClient;
    operationId: string;
    rollbackStack: TrackedCreatedResource[];
    startMs: number;
    succeededCount: number;
    failedCount: number;
    skippedCount: number;
  }): Promise<void> {
    const rollbackReport = await this.runTrackedRollback(
      params.client,
      params.operationId,
      params.rollbackStack,
    );
    const reason =
      rollbackReport.attempted === 0 || rollbackReport.allSucceeded
        ? 'تم إيقاف عملية البرمجة بناءً على طلب المستخدم والتراجع عن الموارد المستحدثة.'
        : `تم إيقاف العملية بطلب المستخدم لكن فشل التراجع عن (${rollbackReport.failed}/${rollbackReport.attempted}) إجراء.`;

    await this.prisma.provisioningOperation.update({
      where: { id: params.operationId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        completedAt: new Date(),
        failureReason: reason,
        verificationResult: { rollbackReport } as any,
        succeededCommands: params.succeededCount,
        failedCommands: params.failedCount,
        skippedCommands: params.skippedCount,
        durationMs: Date.now() - params.startMs,
      },
    });
  }

  async verifyPostProvisioning(client: IMikrotikClient, dto: StartAutoProvisioningDto) {
    let wanConfigured = false;
    let defaultRouteActive = false;
    let defaultRouteEgressValid = false;
    let internetReachable = false;
    let hotspotOperational = false;
    let pingPacketsReceived = 0;

    const wanIface = (dto.wan.renameInterfaceTo || dto.wan.interface).trim();
    const origWan = dto.wan.interface.trim();

    let ips: any[] = [];
    let ifaces: any[] = [];
    let pppoeClients: any[] = [];
    try {
      ips = client.listIpAddresses ? await client.listIpAddresses() : [];
      ifaces = client.listInterfaces ? await client.listInterfaces() : [];
      if (ips.some((ip) => (ip.interface === wanIface || ip.interface === origWan) && !ip.disabled)) {
        wanConfigured = true;
      }
      if (!wanConfigured && dto.wan.mode === 'DHCP' && client.listDhcpClients) {
        const dhs = await client.listDhcpClients();
        if (dhs.some((d) => (d.interface === wanIface || d.interface === origWan) && !d.disabled)) {
          wanConfigured = true;
        }
      }
      if (dto.wan.mode === 'PPPOE' && client.listPppoeClients) {
        pppoeClients = await client.listPppoeClients();
        if (
          pppoeClients.some(
            (p) => (p.interface === wanIface || p.interface === origWan) && !p.disabled,
          )
        ) {
          wanConfigured = true;
        }
      }
    } catch {}

    let conflictingRouteEgress = false;
    try {
      const routes = client.listRoutes ? await client.listRoutes() : [];
      const routeSummary = resolveActiveDefaultRoutesEgress(routes, ifaces, ips);
      defaultRouteActive = routeSummary.activeDefaultRoutes.length > 0;

      const allowedWanIfaces = new Set<string>([
        wanIface,
        origWan,
        ...pppoeClients
          .filter((p) => (p.interface === wanIface || p.interface === origWan) && !p.disabled)
          .map((p) => p.name),
      ]);

      if (defaultRouteActive) {
        if (
          !routeSummary.hasAmbiguousEgress &&
          routeSummary.egressInterfaces.length > 0 &&
          routeSummary.egressInterfaces.every((e) => allowedWanIfaces.has(e))
        ) {
          defaultRouteEgressValid = true;
        } else if (
          routeSummary.egressInterfaces.some((e) => !allowedWanIfaces.has(e))
        ) {
          conflictingRouteEgress = true;
        }
      }
    } catch {}

    // Real Firewall NAT / Mangle / Filter verification (never hardcode true!)
    let masqueradeVerified = dto.wan.enableNat === false;
    let natVerified = masqueradeVerified && dto.securityPolicies?.forceRouterDns === false;
    let mangleVerified = dto.securityPolicies?.antiTethering === false;
    let filterVerified =
      dto.securityPolicies?.protectWanAccess !== true &&
      dto.securityPolicies?.protectManagementAccess === false;

    try {
      if (dto.wan.enableNat !== false || dto.securityPolicies?.forceRouterDns !== false) {
        if (typeof client.listNatRules !== 'function') {
          masqueradeVerified = dto.wan.enableNat === false;
          natVerified = false;
        } else {
          const natRules = await client.listNatRules();
          masqueradeVerified =
            dto.wan.enableNat === false ||
            natRules.some(
              (r) =>
                !r.disabled &&
                r.action === 'masquerade' &&
                (!r.outInterface ||
                  r.outInterface === wanIface ||
                  r.outInterface === origWan ||
                  pppoeClients.some((p) => p.name === r.outInterface)),
            );
          const hasForceDns =
            dto.securityPolicies?.forceRouterDns === false ||
            natRules.some(
              (r) =>
                !r.disabled &&
                (r.comment === 'SudaFi_Force_DNS_UDP' ||
                  r.comment === 'SudaFi_Force_DNS_TCP' ||
                  r.action === 'redirect'),
            );
          natVerified = masqueradeVerified && hasForceDns;
        }
      }
    } catch {
      masqueradeVerified = dto.wan.enableNat === false ? true : false;
      natVerified = false;
    }

    try {
      if (dto.securityPolicies?.antiTethering !== false) {
        if (typeof client.listMangleRules !== 'function') {
          mangleVerified = false;
        } else {
          const mangles = await client.listMangleRules();
          mangleVerified = mangles.some(
            (m) => !m.disabled && (m.action === 'change-ttl' || (m.comment || '').includes('SudaFi')),
          );
        }
      }
    } catch {
      mangleVerified = false;
    }

    try {
      if (
        dto.securityPolicies?.protectWanAccess === true ||
        dto.securityPolicies?.protectManagementAccess !== false
      ) {
        if (typeof client.listFilterRules !== 'function') {
          filterVerified = false;
        } else {
          const filters = await client.listFilterRules();
          const hasWanDrop =
            dto.securityPolicies?.protectWanAccess !== true ||
            filters.some(
              (f) =>
                !f.disabled &&
                f.action === 'drop' &&
                (f.inInterface === wanIface ||
                  f.inInterface === origWan ||
                  f.comment === 'SudaFi_Drop_WAN_Admin_Ports' ||
                  (f.comment || '').includes('SudaFi')),
            );
          const hasMgmtDrop =
            dto.securityPolicies?.protectManagementAccess === false ||
            filters.some(
              (f) =>
                !f.disabled &&
                f.action === 'drop' &&
                (f.comment === 'SudaFi_Drop_Subscriber_Admin_Ports' ||
                  (f.comment || '').includes('SudaFi')),
            );
          filterVerified = hasWanDrop && hasMgmtDrop;
        }
      }
    } catch {
      filterVerified = false;
    }

    const securityPoliciesVerified = Boolean(natVerified && mangleVerified && filterVerified);

    try {
      if (client.pingHost) {
        const pingRes = await client.pingHost('8.8.8.8', 3);
        pingPacketsReceived = pingRes.packetsReceived;
        internetReachable = pingRes.isReachable;
        if (!internetReachable) {
          const cfRes = await client.pingHost('1.1.1.1', 2);
          pingPacketsReceived += cfRes.packetsReceived;
          internetReachable = cfRes.isReachable;
        }
      }
    } catch {}

    try {
      const servers = client.listHotspotServers ? await client.listHotspotServers() : [];
      const targetName = dto.hotspot?.serverName?.trim() || 'hs-sudafi';
      const bridgeName = dto.lan.bridgeName?.trim() || 'bridge-hotspot';
      const match = servers.find((s) => s.name === targetName || s.interface === bridgeName);
      if (match && !match.disabled && !match.invalid) {
        hotspotOperational = true;
      }
    } catch {}

    let overallStatus: 'VERIFIED_READY' | 'PARTIALLY_VERIFIED' | 'DEGRADED' | 'VERIFICATION_FAILED' =
      'VERIFICATION_FAILED';
    if (!hotspotOperational || !wanConfigured || conflictingRouteEgress || (dto.wan.enableNat !== false && !masqueradeVerified)) {
      overallStatus = 'VERIFICATION_FAILED';
    } else if (internetReachable && defaultRouteEgressValid && securityPoliciesVerified) {
      overallStatus = 'VERIFIED_READY';
    } else if (!internetReachable || !defaultRouteEgressValid) {
      overallStatus = 'DEGRADED';
    } else {
      overallStatus = 'PARTIALLY_VERIFIED';
    }

    const diagnosticsMessage =
      overallStatus === 'VERIFIED_READY'
        ? 'تم التحقق الفعلي من جاهزية الراوتر وعمل خادم الهوتسبوت واتصال WAN وسياسات الجدار الناري.'
        : overallStatus === 'DEGRADED'
          ? 'خادم الهوتسبوت وواجهة WAN مفعّلان لكن الوصول الخارجي للإنترنت أو المسار الافتراضي متدهور أو غير مكتمل.'
          : overallStatus === 'PARTIALLY_VERIFIED'
            ? 'الخدمات الأساسية تعمل لكن بعض قواعد الحماية أو الجدار الناري لم يتم إثباتها بالكامل.'
            : conflictingRouteEgress
              ? 'فشل التحقق: المسار الافتراضي النشط يخرج عبر واجهة مختلفة عن منفذ WAN المحدد.'
              : 'فشل التحقق المستقل بعد التنفيذ: خادم الهوتسبوت أو إعداد WAN أو NAT غير عامل.';

    return {
      internetReachable,
      wanConfigured,
      defaultRouteActive,
      defaultRouteEgressValid,
      hotspotOperational,
      securityPoliciesVerified,
      firewallChecks: {
        natVerified,
        mangleVerified,
        filterVerified,
      },
      pingPacketsReceived,
      overallStatus,
      diagnosticsMessage,
    };
  }

  private async persistSuccessState(
    tenantId: string,
    deviceId: string,
    operationId: string,
    userId: string | undefined,
    dto: StartAutoProvisioningDto,
    isVerifiedOnline = false,
  ): Promise<void> {
    const profileName = dto.hotspot?.userProfileName?.trim() || 'hsp-sudafi';
    await this.prisma.hotspotProfile.upsert({
      where: {
        tenantId_deviceId_name: { tenantId, deviceId, name: profileName },
      },
      create: {
        tenantId,
        deviceId,
        name: profileName,
        rateLimit: dto.hotspot?.defaultRateLimit?.trim() || '2M/5M',
        sessionTimeout: dto.hotspot?.sessionTimeout?.trim() || '1d',
        sharedUsers: dto.hotspot?.sharedUsers || 1,
      },
      update: {
        rateLimit: dto.hotspot?.defaultRateLimit?.trim() || '2M/5M',
        sessionTimeout: dto.hotspot?.sessionTimeout?.trim() || '1d',
      },
    });

    await this.prisma.provisioningConfiguration.create({
      data: {
        tenantId,
        deviceId,
        operationId,
        createdById: userId ?? null,
        wanConfig: {
          interface: dto.wan.interface,
          mode: dto.wan.mode,
          enableNat: dto.wan.enableNat !== false,
        },
        lanConfig: dto.lan as any,
        wirelessConfig: dto.wireless ? { ...dto.wireless, password: dto.wireless.password ? '********' : undefined } : undefined,
        hotspotConfig: (dto.hotspot || {}) as any,
        systemConfig: (dto.system || {}) as any,
        securityConfig: (dto.securityPolicies || {}) as any,
        schedulerConfig: (dto.scheduler || {}) as any,
      },
    });

    const syncedAt = new Date();
    await this.prisma.mikroTikDevice.update({
      where: { id: deviceId },
      data: {
        isOnline: isVerifiedOnline,
        status: isVerifiedOnline ? DeviceStatus.ONLINE : DeviceStatus.ERROR,
        lastSyncAt: syncedAt,
        ...(isVerifiedOnline ? { lastError: null } : {}),
      },
    });
    DevicesService.updateChannelState(deviceId, {
      cloudStatus: isVerifiedOnline ? 'ONLINE' : 'ERROR',
      cloudCheckedAt: syncedAt,
      ...(isVerifiedOnline
        ? {
            lastVerifiedSource: 'PROVISIONING',
            lastVerifiedAt: syncedAt,
          }
        : {}),
    });
  }
}
