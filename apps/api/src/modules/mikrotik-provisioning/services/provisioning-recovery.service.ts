import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../../core/database/prisma.service';
import { MikrotikClientFactory } from '../../../core/mikrotik/mikrotik-client.factory';
import { EncryptionService } from '../../../core/security/encryption.service';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { DevicesService } from '../../devices/devices.service';
import type { RestoreProvisionBackupDto } from '../dto/auto-provisioning.dto';
import { ProvisioningBackupStorageService } from './provisioning-backup-storage.service';

@Injectable()
export class ProvisioningRecoveryService {
  private readonly logger = new Logger(ProvisioningRecoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clientFactory: MikrotikClientFactory,
    private readonly encryptionService: EncryptionService,
    private readonly auditLogsService: AuditLogsService,
    @Optional() private readonly backupStorage?: ProvisioningBackupStorageService,
  ) {}

  async restoreBackup(
    tenantId: string,
    deviceId: string,
    dto: RestoreProvisionBackupDto,
    userId?: string,
  ): Promise<{
    recoveryId: string;
    success: boolean;
    status: string;
    rebootTriggered: boolean;
    message: string;
    compatibilityWarning?: string;
    postRebootNotice: string;
  }> {
    if (!dto.confirmed || !dto.acknowledgeReboot || !dto.acknowledgeDisconnect) {
      throw new BadRequestException({
        code: 'RECOVERY_CONFIRMATION_REQUIRED',
        message:
          'يلزم تأكيد جميع الإقرارات: استبدال الإعدادات، إعادة تشغيل الراوتر، وانقطاع الاتصال المؤقت أثناء الاستعادة.',
      });
    }

    if (DevicesService.activeDeviceOperations.has(deviceId)) {
      throw new ConflictException({
        code: 'DEVICE_OPERATION_IN_PROGRESS',
        message: 'توجد عملية برمجة أو استعادة نشطة حالياً على هذا الراوتر.',
      });
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

    let backupRecord: any = null;
    if (dto.backupId) {
      backupRecord = await this.prisma.routerBackup.findFirst({
        where: { id: dto.backupId, tenantId, deviceId },
      });
      if (!backupRecord) {
        throw new NotFoundException({
          code: 'BACKUP_NOT_FOUND',
          message: 'النسخة الاحتياطية المحددة غير موجودة لهذا الراوتر.',
        });
      }
      if (backupRecord.backupType === 'RSC_EXPORT') {
        throw new BadRequestException({
          code: 'RSC_MANUAL_REVIEW_REQUIRED',
          message:
            'ملف التصدير النصي (.rsc) مخصص للمراجعة والاستيراد الانتقائي عبر WinBox/Terminal ولا يُستعاد تلقائياً كـ Binary Backup.',
        });
      }
    }

    const targetFilename = backupRecord?.routerFileName || dto.routerFilename?.trim();
    if (!targetFilename || !targetFilename.toLowerCase().endsWith('.backup') || targetFilename.includes('..')) {
      throw new BadRequestException({
        code: 'INVALID_BACKUP_FILENAME',
        message: 'يجب تحديد نسخة ثنائية صالحة بامتداد .backup للاستعادة.',
      });
    }

    DevicesService.activeDeviceOperations.add(deviceId);
    const recoveryId = uuidv4();
    let recoveryRow: { id: string } | null = null;

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

      const liveResource = await client.getSystemResource().catch(() => null);
      let compatibilityWarning: string | undefined;

      if (backupRecord && liveResource) {
        const liveMajor = (liveResource.version || '').split('.')[0];
        const bkMajor = (backupRecord.routerOsVersion || '').split('.')[0];
        const bkBoardOrModel = backupRecord.boardName || backupRecord.deviceModel;
        const liveBoardOrModel = liveResource.boardName || liveResource.model;
        const boardMismatch =
          bkBoardOrModel &&
          liveBoardOrModel &&
          bkBoardOrModel !== liveBoardOrModel;
        const majorMismatch = liveMajor && bkMajor && liveMajor !== bkMajor;

        if (boardMismatch || majorMismatch) {
          compatibilityWarning = `تحذير توافق: النسخة أُنشئت على (${bkBoardOrModel || 'غير معروف'} / ROS ${backupRecord.routerOsVersion || '?'}) بينما الجهاز الحالي هو (${liveBoardOrModel || '?'} / ROS ${liveResource.version || '?'}). النسخ الثنائية ليست مضمونة عند اختلاف الموديل أو الإصدار.`;
          if (!dto.acknowledgeCompatibilityRisk) {
            throw new BadRequestException({
              code: 'BACKUP_COMPATIBILITY_ACK_REQUIRED',
              message: compatibilityWarning,
            });
          }
        }
      }

      if (typeof client.restoreBackup !== 'function') {
        throw new BadGatewayException({
          code: 'RESTORE_NOT_SUPPORTED',
          message: 'عميل الاتصال الحالي لا يدعم تنفيذ أمر الاستعادة عن بُعد.',
        });
      }

      recoveryRow = await this.prisma.recoveryOperation.create({
        data: {
          id: recoveryId,
          tenantId,
          deviceId,
          backupId: backupRecord?.id ?? null,
          operationId: backupRecord?.operationId ?? null,
          initiatedById: userId ?? null,
          status: 'EXECUTING',
          backupFileName: targetFilename,
          warningAcknowledged: true,
          compatibilityWarning: compatibilityWarning ?? null,
          preCheckSnapshot: (liveResource as any) ?? undefined,
          startedAt: new Date(),
        },
      });

      // Verify whether the backup file exists on the router; if missing and cloud-backed, verify SHA-256 and fetch via HTTPS
      let existsOnRouter = true;
      const listFn =
        typeof client.listFiles === 'function'
          ? () => client.listFiles!()
          : typeof client.listBackups === 'function'
            ? () => client.listBackups!()
            : undefined;
      if (listFn) {
        const files = await listFn().catch(() => null);
        if (Array.isArray(files)) {
          const baseTarget = targetFilename.replace(/^flash\//i, '');
          existsOnRouter = files.some(
            (f) => f.name === targetFilename || f.name?.replace(/^flash\//i, '') === baseTarget,
          );
        }
      }

      if (!existsOnRouter) {
        if (!backupRecord?.storagePath || !this.backupStorage) {
          throw new BadGatewayException({
            code: 'BACKUP_MISSING_ON_ROUTER',
            message: `ملف النسخة الاحتياطية (${targetFilename}) غير موجود على ذاكرة الراوتر ولا تتوفر نسخة سحابية بديلة للاسترداد.`,
          });
        }

        const cloudBuf = await this.backupStorage.downloadPrivateObject(backupRecord.storagePath);
        if (!cloudBuf || cloudBuf.length === 0) {
          throw new BadGatewayException({
            code: 'BACKUP_CLOUD_DOWNLOAD_FAILED',
            message: `تعذر جلب النسخة (${targetFilename}) من التخزين السحابي لنقلها إلى الراوتر.`,
          });
        }
        if (backupRecord.checksumSha256) {
          const actualSha = crypto.createHash('sha256').update(cloudBuf).digest('hex');
          if (actualSha !== backupRecord.checksumSha256) {
            throw new BadGatewayException({
              code: 'BACKUP_CHECKSUM_MISMATCH',
              message: `بصمة SHA-256 للنسخة السحابية (${targetFilename}) غير متطابقة؛ تم إيقاف الاستعادة حمايةً للراوتر.`,
            });
          }
        }

        const signedUrl = await this.backupStorage.createSignedDownloadUrl(backupRecord.storagePath, 180);
        if (!signedUrl || typeof client.fetchFileFromUrl !== 'function') {
          throw new BadGatewayException({
            code: 'BACKUP_ROUTER_TRANSFER_UNSUPPORTED',
            message: `الملف (${targetFilename}) مفقود من الراوتر وتعذر نقله آلياً عبر HTTPS /tool/fetch.`,
          });
        }
        await client.fetchFileFromUrl(signedUrl, targetFilename);
      }

      const effectivePassword =
        dto.password && dto.password.trim().length > 0
          ? dto.password.trim()
          : this.encryptionService.deriveDeterministicSecret(
              `sudafi-router-backup:${tenantId}:${deviceId}`,
              24,
            );

      const res = await client.restoreBackup(targetFilename, effectivePassword);

      await this.prisma.recoveryOperation.update({
        where: { id: recoveryRow.id },
        data: {
          status: res.rebootTriggered ? 'REBOOTING' : 'VERIFIED',
          rebootTriggered: Boolean(res.rebootTriggered),
          completedAt: new Date(),
        },
      });

      if (backupRecord?.id) {
        await this.prisma.routerBackup.update({
          where: { id: backupRecord.id },
          data: { status: 'RESTORED', restoredAt: new Date() },
        });
      }

      await this.auditLogsService.log({
        tenantId,
        userId: userId ?? null,
        action: 'PROVISIONING_BACKUP_RESTORED',
        entity: 'recovery_operation',
        entityId: recoveryId,
        newValues: {
          deviceId,
          backupFile: targetFilename,
          rebootTriggered: res.rebootTriggered,
          compatibilityWarning,
        },
      });

      return {
        recoveryId,
        success: true,
        status: res.rebootTriggered ? 'REBOOTING' : 'VERIFIED',
        rebootTriggered: Boolean(res.rebootTriggered),
        message: res.message,
        compatibilityWarning,
        postRebootNotice:
          'سيعيد الراوتر التشغيل وينقطع الاتصال مؤقتاً لمدة 30 إلى 90 ثانية. أعد فحص الاتصال بعد الإقلاع للتأكد من استرجاع الإعدادات.',
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (recoveryRow?.id) {
        await this.prisma.recoveryOperation
          .update({
            where: { id: recoveryRow.id },
            data: {
              status: 'FAILED',
              errorMessage: errMsg,
              completedAt: new Date(),
            },
          })
          .catch(() => {});
      }
      if (
        err instanceof BadRequestException ||
        err instanceof NotFoundException ||
        err instanceof ConflictException ||
        err instanceof BadGatewayException
      ) {
        throw err;
      }
      this.logger.error(`Recovery restore failed on ${deviceId}: ${errMsg}`);
      throw new BadGatewayException({
        code: 'RECOVERY_RESTORE_FAILED',
        message: `تعذر استعادة النسخة الاحتياطية: ${errMsg}`,
      });
    } finally {
      DevicesService.activeDeviceOperations.delete(deviceId);
    }
  }
}
