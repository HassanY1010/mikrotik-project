import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { RequestUser } from '../../core/decorators/current-user.decorator';
import { PrismaService } from '../../core/database/prisma.service';
import { PlanSigningService } from '../../core/security/signing.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { DevicesService } from '../devices/devices.service';
import type {
  AutoProvisionConfigDto,
  CreateProvisionBackupDto,
  RestoreProvisionBackupDto,
  StartAutoProvisioningDto,
} from './dto/auto-provisioning.dto';
import { CommandExecutorService } from './services/command-executor.service';
import { ConfigurationPlannerService } from './services/configuration-planner.service';
import { ProvisioningBackupService } from './services/provisioning-backup.service';
import { ProvisioningLoggerService } from './services/provisioning-logger.service';
import { ProvisioningRecoveryService } from './services/provisioning-recovery.service';
import { RouterCompatibilityService } from './services/router-compatibility.service';
import { RouterDiscoveryEngineService } from './services/router-discovery-engine.service';

@Injectable()
export class MikrotikProvisioningService {
  private readonly consumedPlanNonces = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly devicesService: DevicesService,
    private readonly discoveryService: RouterDiscoveryEngineService,
    private readonly compatibilityService: RouterCompatibilityService,
    private readonly plannerService: ConfigurationPlannerService,
    private readonly backupService: ProvisioningBackupService,
    private readonly recoveryService: ProvisioningRecoveryService,
    private readonly loggerService: ProvisioningLoggerService,
    private readonly commandExecutor: CommandExecutorService,
    private readonly planSigningService: PlanSigningService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  private async withTenantDb<T>(
    tenantId: string,
    fn: (db: PrismaService) => Promise<T>,
  ): Promise<T> {
    if (typeof (this.prisma as any).withTenantRls === 'function') {
      return (this.prisma as any).withTenantRls(tenantId, (tx: PrismaService) => fn(tx));
    }
    return fn(this.prisma);
  }

  private async assertDeviceAccess(
    tenantId: string,
    deviceId: string,
    currentUser?: RequestUser,
  ): Promise<void> {
    if (currentUser) {
      await this.devicesService.assertUserDeviceAccess(tenantId, deviceId, currentUser);
      return;
    }

    const device = await this.withTenantDb(tenantId, (db) =>
      db.mikroTikDevice.findFirst({
        where: { id: deviceId, tenantId, deletedAt: null },
        select: { id: true },
      }),
    );

    if (!device) {
      throw new NotFoundException({
        code: 'DEVICE_NOT_FOUND',
        message: `لم يتم العثور على الراوتر (${deviceId}) ضمن حساب المستأجر الحالي.`,
      });
    }
  }

  async discoverDevice(
    tenantId: string,
    deviceId: string,
    currentUser?: RequestUser,
    forceRefresh = false,
  ) {
    await this.assertDeviceAccess(tenantId, deviceId, currentUser);
    const report = await this.discoveryService.discover(tenantId, deviceId, { forceRefresh });

    try {
      await this.auditLogsService.log({
        tenantId,
        userId: currentUser?.id ?? null,
        action: 'AUTO_PROVISIONING_DISCOVERED',
        entity: 'mikrotik_device',
        entityId: deviceId,
        newValues: {
          boardName: report.device.boardName,
          model: report.device.model,
          rosVersion: report.device.version,
          osFamily: report.capabilities.osFamily,
          wirelessStack: report.capabilities.wirelessStack,
          suggestedWanInterface: report.suggestedWanInterface,
          wanRoleAmbiguous: report.wanRoleAmbiguous,
        },
      });
    } catch {
      // Audit logging should not abort discovery
    }

    return report;
  }

  async getDeviceCapabilities(
    tenantId: string,
    deviceId: string,
    currentUser?: RequestUser,
    forceRefresh = false,
  ) {
    await this.assertDeviceAccess(tenantId, deviceId, currentUser);
    const report = await this.discoveryService.discover(tenantId, deviceId, { forceRefresh });
    const adapter = this.compatibilityService.resolveAdapter(report.capabilities);

    return {
      device: report.device,
      capabilities: report.capabilities,
      compatibility: {
        adapterFamily: adapter.family,
        osFamily: report.capabilities.osFamily,
        majorVersion: report.capabilities.majorVersion,
        wirelessStack: report.capabilities.wirelessStack,
        ntpStack: report.capabilities.ntpStack,
        supportsSafeModeInCurrentSession: report.capabilities.supportsSafeModeInCurrentSession,
        safeModeNotice: report.capabilities.safeModeReason,
        warnings: report.capabilities.warnings,
      },
      interfacesAssessment: report.interfacesAssessment,
      suggestedWanInterface: report.suggestedWanInterface,
      suggestedLanInterfaces: report.suggestedLanInterfaces,
      wanRoleAmbiguous: report.wanRoleAmbiguous,
      discoveredAt: report.discoveredAt,
    };
  }

  async buildPlan(
    tenantId: string,
    deviceId: string,
    dto: AutoProvisionConfigDto,
    currentUser?: RequestUser,
    forceRefresh = false,
  ) {
    await this.assertDeviceAccess(tenantId, deviceId, currentUser);
    const discovery = await this.discoveryService.discover(tenantId, deviceId, { forceRefresh });
    return this.plannerService.buildPlan(dto, discovery, tenantId);
  }

  async buildPreview(
    tenantId: string,
    deviceId: string,
    dto: AutoProvisionConfigDto,
    currentUser?: RequestUser,
  ) {
    // Always inspect live router state when generating a signed preview
    const plan = await this.buildPlan(tenantId, deviceId, dto, currentUser, true);
    return {
      ...plan,
      previewSummary: {
        totalStages: plan.stages.length,
        plannedStages: plan.stages.filter((s) => s.status === 'PLANNED').length,
        skippedStages: plan.stages.filter(
          (s) => s.status === 'SKIPPED_UNSUPPORTED' || s.status === 'SKIPPED_EXISTING',
        ).length,
        totalPlannedCommands: plan.totalPlannedCommands,
        canProceed: plan.canProceed,
        blockedReasons: plan.blockedReasons,
        warnings: plan.warnings,
        wanConfirmationRequired: plan.wanConfirmationRequired,
        wanConfirmationReasons: plan.wanConfirmationReasons,
        requiresBackupBeforeApply: plan.requiresBackup,
      },
    };
  }

  private async assertAndConsumePlanToken(
    dto: StartAutoProvisioningDto,
    tenantId: string,
    deviceId: string,
    liveSnapshotHash: string,
    rebuiltPlan: ReturnType<ConfigurationPlannerService['buildPlan']>,
  ): Promise<string> {
    if (!dto.planToken || typeof dto.planToken !== 'object' || Array.isArray(dto.planToken)) {
      throw new BadRequestException({
        code: 'PLAN_TOKEN_REQUIRED',
        message: 'توقيع معاينة الخطة (planToken) إلزامي قبل التنفيذ؛ يرجى توليد المعاينة أولاً.',
      });
    }

    const token = dto.planToken as Record<string, unknown>;
    const tokenTenantId = typeof token.tenantId === 'string' ? token.tenantId.trim() : '';
    const tokenDeviceId = typeof token.deviceId === 'string' ? token.deviceId.trim() : '';
    const sessionId = typeof token.sessionId === 'string' ? token.sessionId.trim() : '';
    const nonce = typeof token.nonce === 'string' ? token.nonce.trim() : '';
    const tokenSnapshotHash = typeof token.snapshotHash === 'string' ? token.snapshotHash.trim() : '';
    const canonicalPayload =
      typeof token.canonicalPayload === 'string' ? token.canonicalPayload.trim() : '';
    const signature = typeof token.signature === 'string' ? token.signature.trim() : '';
    const publicKey = typeof token.publicKey === 'string' ? token.publicKey.trim() : '';
    const expiresAt = typeof token.expiresAt === 'string' ? token.expiresAt.trim() : '';

    if (
      !tokenTenantId ||
      !tokenDeviceId ||
      !sessionId ||
      !nonce ||
      !tokenSnapshotHash ||
      !canonicalPayload ||
      !signature ||
      !publicKey ||
      !expiresAt
    ) {
      throw new BadRequestException({
        code: 'INVALID_PLAN_TOKEN',
        message: 'رمز توقيع الخطة غير مكتمل أو يفتقر لحقل أمني إلزامي؛ يرجى إعادة المعاينة أولاً.',
      });
    }

    if (tokenTenantId !== tenantId || tokenDeviceId !== deviceId) {
      throw new BadRequestException({
        code: 'PLAN_TOKEN_SCOPE_MISMATCH',
        message: 'رمز الخطة الموقع لا يخص هذا المستأجر أو هذا الراوتر.',
      });
    }

    if (typeof token.planHash === 'string' && token.planHash.trim() !== rebuiltPlan.planHash) {
      throw new BadRequestException({
        code: 'PLAN_DRIFT_DETECTED',
        message: 'تجزئة خطة البرمجة (planHash) لا تطابق المعاينة الموقعة.',
      });
    }

    if (!canonicalPayload.startsWith(`SUDAFI-PLAN-V1:${tenantId}:${deviceId}:`)) {
      throw new BadRequestException({
        code: 'PLAN_TOKEN_SCOPE_MISMATCH',
        message: 'حمولة الخطة الموقعة لا تطابق هوية المستأجر أو الراوتر.',
      });
    }

    const expiresMs = Date.parse(expiresAt);
    if (!Number.isFinite(expiresMs) || Date.now() > expiresMs) {
      throw new BadRequestException({
        code: 'PLAN_TOKEN_EXPIRED',
        message: 'انتهت صلاحية معاينة الخطة؛ يرجى إعادة توليد المعاينة لضمان سلامة التنفيذ.',
      });
    }

    if (tokenSnapshotHash !== liveSnapshotHash) {
      throw new BadRequestException({
        code: 'ROUTER_STATE_DRIFT_DETECTED',
        message:
          'تغيرت إعدادات أو طوبولوجيا الراوتر بعد توليد المعاينة؛ يرجى إعادة الفحص والمعاينة قبل التنفيذ.',
      });
    }

    const rebuiltCommands = rebuiltPlan.stages.flatMap((s) =>
      s.commands.map((c) => ({ stage: s.stage, command: c.commandMasked.trim() })),
    );
    const { canonicalPayload: expectedCanonical } = this.planSigningService.buildCanonicalPayload({
      tenantId,
      deviceId,
      sessionId,
      nonce,
      fencingToken: '0',
      snapshotHash: tokenSnapshotHash,
      expiresAt,
      commands: rebuiltCommands,
    });

    if (canonicalPayload !== expectedCanonical) {
      throw new BadRequestException({
        code: 'PLAN_DRIFT_DETECTED',
        message:
          'تغيرت الأوامر المخططة عن المعاينة المعتمدة (بسبب تعديل الإعدادات أو تغير حالة الراوتر). يرجى إعادة المعاينة قبل التطبيق.',
      });
    }

    const signatureOk = this.planSigningService.verifyPlan(
      canonicalPayload,
      signature,
      publicKey,
    );
    if (!signatureOk) {
      throw new BadRequestException({
        code: 'PLAN_TOKEN_SIGNATURE_INVALID',
        message: 'فشل التحقق التشفيري من توقيع خطة البرمجة.',
      });
    }

    // Purge expired in-memory nonces
    const now = Date.now();
    for (const [k, exp] of this.consumedPlanNonces.entries()) {
      if (exp <= now) this.consumedPlanNonces.delete(k);
    }

    const replayKey = `${tenantId}:${deviceId}:${nonce}`;
    if (this.consumedPlanNonces.has(replayKey)) {
      throw new BadRequestException({
        code: 'PLAN_TOKEN_REPLAY_DETECTED',
        message: 'تم استخدام هذه الخطة الموقعة مسبقاً (محاولة إعادة تشغيل مرفوضة). يرجى إنشاء معاينة جديدة.',
      });
    }

    if (typeof this.prisma.provisioningOperation?.findMany === 'function') {
      const priorOps = await this.withTenantDb(tenantId, (db) =>
        db.provisioningOperation.findMany({
          where: { tenantId, deviceId },
          orderBy: { createdAt: 'desc' },
          take: 100,
          select: { id: true, configSnapshot: true },
        }),
      );
      const alreadyUsed = priorOps.some(
        (op) => (op.configSnapshot as Record<string, unknown> | null)?._planNonceId === nonce,
      );
      if (alreadyUsed) {
        this.consumedPlanNonces.set(replayKey, expiresMs);
        throw new BadRequestException({
          code: 'PLAN_TOKEN_REPLAY_DETECTED',
          message: 'تم استخدام هذه الخطة الموقعة مسبقاً في عملية سابقة. يرجى إنشاء معاينة جديدة.',
        });
      }
    }

    this.consumedPlanNonces.set(replayKey, expiresMs);
    return nonce;
  }

  async applyProvisioning(
    tenantId: string,
    deviceId: string,
    dto: StartAutoProvisioningDto,
    currentUser?: RequestUser,
    options?: { asyncExecution?: boolean },
  ) {
    await this.assertDeviceAccess(tenantId, deviceId, currentUser);

    // Always inspect live router state before building executable plan
    const liveDiscovery = await this.discoveryService.discover(tenantId, deviceId, {
      forceRefresh: true,
    });
    const plan = this.plannerService.buildPlan(dto, liveDiscovery, tenantId);

    const consumedNonce = await this.assertAndConsumePlanToken(
      dto,
      tenantId,
      deviceId,
      liveDiscovery.snapshotHash,
      plan,
    );
    (dto as unknown as Record<string, unknown>)._planNonceId = consumedNonce;

    return this.commandExecutor.startPlanExecution({
      tenantId,
      deviceId,
      userId: currentUser?.id,
      dto,
      plan,
      asyncExecution: options?.asyncExecution ?? true,
    });
  }

  async createBackup(
    tenantId: string,
    deviceId: string,
    dto: CreateProvisionBackupDto,
    currentUser?: RequestUser,
  ) {
    await this.assertDeviceAccess(tenantId, deviceId, currentUser);

    if (DevicesService.activeDeviceOperations.has(deviceId)) {
      throw new ConflictException({
        code: 'DEVICE_OPERATION_IN_PROGRESS',
        message: 'توجد عملية برمجة أو نسخ احتياطي جارية حالياً على هذا الراوتر.',
      });
    }

    DevicesService.activeDeviceOperations.add(deviceId);
    try {
      return await this.backupService.createBackupBundle({
        tenantId,
        deviceId,
        userId: currentUser?.id,
        backupName: dto.backupName,
        password: dto.password,
        includeRscExport: dto.includeRscExport,
      });
    } finally {
      DevicesService.activeDeviceOperations.delete(deviceId);
    }
  }

  async listBackups(
    tenantId: string,
    deviceId: string,
    currentUser?: RequestUser,
  ) {
    await this.assertDeviceAccess(tenantId, deviceId, currentUser);
    return this.backupService.listDeviceBackups(tenantId, deviceId);
  }

  async downloadBackup(
    tenantId: string,
    backupId: string,
    currentUser?: RequestUser,
  ) {
    const backup = await this.withTenantDb(tenantId, (db) =>
      db.routerBackup.findFirst({
        where: { id: backupId, tenantId },
        select: { id: true, deviceId: true },
      }),
    );

    if (!backup) {
      throw new NotFoundException({
        code: 'BACKUP_NOT_FOUND',
        message: 'لم يتم العثور على النسخة الاحتياطية المطلوبة ضمن حسابك.',
      });
    }

    if (backup.deviceId) {
      await this.assertDeviceAccess(tenantId, backup.deviceId, currentUser);
    }

    return this.backupService.downloadBackupById(tenantId, backupId, currentUser?.id);
  }

  async restoreBackup(
    tenantId: string,
    deviceId: string,
    dto: RestoreProvisionBackupDto,
    currentUser?: RequestUser,
  ) {
    await this.assertDeviceAccess(tenantId, deviceId, currentUser);
    return this.recoveryService.restoreBackup(tenantId, deviceId, dto, currentUser?.id);
  }

  async listOperations(
    tenantId: string,
    deviceId: string,
    currentUser?: RequestUser,
  ) {
    await this.assertDeviceAccess(tenantId, deviceId, currentUser);
    return this.loggerService.listDeviceOperations(tenantId, deviceId);
  }

  async getOperationDetails(
    tenantId: string,
    operationId: string,
    currentUser?: RequestUser,
  ) {
    const op = await this.loggerService.getOperationDetails(tenantId, operationId);
    await this.assertDeviceAccess(tenantId, op.deviceId, currentUser);
    return op;
  }

  async cancelOperation(
    tenantId: string,
    operationId: string,
    currentUser?: RequestUser,
  ) {
    const op = await this.loggerService.getOperationDetails(tenantId, operationId);
    await this.assertDeviceAccess(tenantId, op.deviceId, currentUser);

    const res = await this.commandExecutor.requestCancellation(tenantId, operationId);
    try {
      await this.auditLogsService.log({
        tenantId,
        userId: currentUser?.id ?? null,
        action: 'AUTO_PROVISIONING_CANCEL_REQUESTED',
        entity: 'provisioning_operation',
        entityId: operationId,
        newValues: { deviceId: op.deviceId, cancelled: res.cancelled },
      });
    } catch {
      // Non-fatal
    }
    return res;
  }

  async getOperationCommands(
    tenantId: string,
    operationId: string,
    currentUser?: RequestUser,
  ) {
    const op = await this.getOperationDetails(tenantId, operationId, currentUser);
    return {
      operationId: op.id,
      deviceId: op.deviceId,
      status: op.status,
      totalCommands: op.totalCommands,
      succeededCommands: op.succeededCommands,
      failedCommands: op.failedCommands,
      skippedCommands: op.skippedCommands,
      commands: op.commandLogs,
    };
  }

  async getOperationLogs(
    tenantId: string,
    operationId: string,
    currentUser?: RequestUser,
  ) {
    const op = await this.getOperationDetails(tenantId, operationId, currentUser);
    const currentStep = op.steps.find((s) => s.status === 'RUNNING');
    return {
      operationId: op.id,
      deviceId: op.deviceId,
      status: op.status,
      template: op.template,
      progressPercent: op.progressPercent,
      currentStepOrder: op.currentStepOrder,
      currentStage: currentStep?.stage ?? null,
      failureReason: op.failureReason,
      verificationResult: op.verificationResult,
      preBackupId: op.preBackupId,
      rscBackupId: op.rscBackupId,
      startedAt: op.startedAt,
      completedAt: op.completedAt,
      durationMs: op.durationMs,
      steps: op.steps,
      commandLogs: op.commandLogs,
      backups: op.backups,
    };
  }
}
