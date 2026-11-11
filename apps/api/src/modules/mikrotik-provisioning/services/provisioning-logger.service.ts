import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import type { AutoProvisioningPlan } from '../interfaces/auto-provisioning.interface';
import { maskSecretsInText, sanitizeStructuredSecrets } from '../utils/secret-redactor.util';

@Injectable()
export class ProvisioningLoggerService {
  constructor(private readonly prisma: PrismaService) {}

  maskSecrets(raw?: string | null): string | null {
    return maskSecretsInText(raw);
  }

  async createOperationRecord(params: {
    operationId: string;
    tenantId: string;
    deviceId: string;
    userId?: string;
    executionMode: 'CLOUD' | 'LOCAL';
    plan: AutoProvisioningPlan;
    configSnapshot: Record<string, unknown>;
  }): Promise<{
    stepIdByStage: Map<string, string>;
    commandLogIdByOrder: Map<number, string>;
  }> {
    const { operationId, tenantId, deviceId, userId, executionMode, plan, configSnapshot } = params;

    await this.prisma.provisioningOperation.create({
      data: {
        id: operationId,
        tenantId,
        deviceId,
        initiatedById: userId ?? null,
        status: 'PENDING',
        template: plan.template,
        executionMode,
        routerOsVersion: plan.rosVersion,
        routerMajorVersion: plan.capabilities.majorVersion || null,
        boardName: plan.boardName,
        modelName: plan.model,
        architecture: plan.capabilities.architecture,
        totalSteps: plan.stages.length,
        totalCommands: plan.totalPlannedCommands,
        planHash: plan.planHash,
        capabilitiesSnapshot: plan.capabilities as any,
        configSnapshot: sanitizeStructuredSecrets(this.sanitizeConfigSnapshot(configSnapshot)) as any,
        startedAt: new Date(),
      },
    });

    const stepIdByStage = new Map<string, string>();
    const commandLogIdByOrder = new Map<number, string>();

    for (const stage of plan.stages) {
      const initialStepStatus =
        stage.status === 'SKIPPED_UNSUPPORTED' || stage.status === 'SKIPPED_EXISTING'
          ? 'SKIPPED'
          : 'PENDING';

      const stepRow = await this.prisma.provisioningStep.create({
        data: {
          operationId,
          tenantId,
          stepOrder: stage.stepOrder,
          stage: stage.stage,
          title: stage.title,
          description: stage.description,
          status: initialStepStatus,
          dependsOn: stage.dependsOn as any,
          preconditions: stage.preconditions as any,
          requiredCapabilities: stage.requiredCapabilities as any,
          expectedResult: stage.expectedResult,
          validationRule: stage.validationRule,
          rollbackAction: stage.rollbackAction,
          errorMessage: stage.skipReason ?? null,
        },
      });

      stepIdByStage.set(stage.stage, stepRow.id);

      for (const cmd of stage.commands) {
        const logRow = await this.prisma.provisioningCommandLog.create({
          data: {
            operationId,
            stepId: stepRow.id,
            tenantId,
            commandOrder: cmd.order,
            stage: stage.stage,
            description: cmd.description,
            commandMasked: this.maskSecrets(cmd.commandMasked) || cmd.commandMasked,
            status: 'PENDING',
          },
        });
        commandLogIdByOrder.set(cmd.order, logRow.id);
      }
    }

    return { stepIdByStage, commandLogIdByOrder };
  }

  async markCommandStarted(commandLogId: string): Promise<void> {
    await this.prisma.provisioningCommandLog.update({
      where: { id: commandLogId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
  }

  async markCommandFinished(
    commandLogId: string,
    status: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'ROLLED_BACK',
    durationMs: number,
    routerResponse?: string,
    errorMessage?: string,
  ): Promise<void> {
    await this.prisma.provisioningCommandLog.update({
      where: { id: commandLogId },
      data: {
        status,
        durationMs,
        completedAt: new Date(),
        routerResponse: this.maskSecrets(routerResponse)?.slice(0, 1000) ?? null,
        errorMessage: this.maskSecrets(errorMessage)?.slice(0, 1000) ?? null,
      },
    });
  }

  async getOperationDetails(tenantId: string, operationId: string) {
    const op = await this.prisma.provisioningOperation.findFirst({
      where: { id: operationId, tenantId },
      include: {
        device: { select: { id: true, name: true, host: true, modelName: true, rosVersion: true } },
        steps: { orderBy: { stepOrder: 'asc' } },
        commandLogs: { orderBy: { commandOrder: 'asc' } },
        backups: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!op) {
      throw new NotFoundException({
        code: 'OPERATION_NOT_FOUND',
        message: 'لم يتم العثور على عملية البرمجة المطلوبة.',
      });
    }
    return op;
  }

  async listDeviceOperations(tenantId: string, deviceId: string) {
    return this.prisma.provisioningOperation.findMany({
      where: { tenantId, deviceId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: {
        backups: {
          select: {
            id: true,
            backupType: true,
            fileName: true,
            fileSizeBytes: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });
  }

  sanitizeConfigSnapshot(snapshot: Record<string, unknown>): Record<string, unknown> {
    const cloned = JSON.parse(JSON.stringify(snapshot || {}));
    delete cloned.backupPassword;
    delete cloned.planToken;
    if (cloned.wan && typeof cloned.wan === 'object') {
      if (cloned.wan.pppoePassword) cloned.wan.pppoePassword = '********';
    }
    if (cloned.wireless && typeof cloned.wireless === 'object') {
      if (cloned.wireless.password) cloned.wireless.password = '********';
    }
    return cloned;
  }
}
