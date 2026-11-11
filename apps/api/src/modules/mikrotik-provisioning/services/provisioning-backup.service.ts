import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../../core/database/prisma.service';
import { MikrotikClientFactory } from '../../../core/mikrotik/mikrotik-client.factory';
import { EncryptionService } from '../../../core/security/encryption.service';
import type { IMikrotikClient } from '../../../core/mikrotik/interfaces/mikrotik-client.interface';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { ProvisioningBackupStorageService } from './provisioning-backup-storage.service';

export interface BackupCreationBundle {
  binaryBackup?: {
    id: string;
    fileName: string;
    routerFileName: string;
    fileSizeBytes: number;
    checksumSha256?: string;
    cloudStored: boolean;
    status: string;
  };
  rscBackup?: {
    id: string;
    fileName: string;
    routerFileName: string;
    fileSizeBytes: number;
    checksumSha256?: string;
    cloudStored: boolean;
    status: string;
  };
  warnings: string[];
}

@Injectable()
export class ProvisioningBackupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientFactory: MikrotikClientFactory,
    private readonly encryptionService: EncryptionService,
    private readonly backupStorage: ProvisioningBackupStorageService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async createBackupBundle(params: {
    tenantId: string;
    deviceId: string;
    userId?: string;
    operationId?: string;
    backupName?: string;
    password?: string;
    includeRscExport?: boolean;
    requireOffRouterBackup?: boolean;
    existingClient?: IMikrotikClient;
  }): Promise<BackupCreationBundle> {
    const device = await this.prisma.mikroTikDevice.findFirst({
      where: { id: params.deviceId, tenantId: params.tenantId, deletedAt: null },
    });
    if (!device) {
      throw new NotFoundException({
        code: 'DEVICE_NOT_FOUND',
        message: `لم يتم العثور على الراوتر (${params.deviceId}).`,
      });
    }

    const client =
      params.existingClient ||
      (await this.clientFactory.getClient({
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
      }));

    // 1. Pre-change connectivity & disk headroom check
    const alive = await client.ping();
    if (!alive) {
      throw new BadGatewayException({
        code: 'ROUTER_UNREACHABLE',
        message: `تعذر التحقق من اتصال الراوتر (${device.host}) قبل أخذ النسخة الاحتياطية.`,
      });
    }

    const res = await client.getSystemResource();
    if (res.freeHdd > 0 && res.freeHdd < 128 * 1024) {
      throw new BadRequestException({
        code: 'INSUFFICIENT_ROUTER_DISK',
        message: `المساحة الحرة على ذاكرة الراوتر غير كافية (${Math.round(res.freeHdd / 1024)} KB) لحفظ نسخة احتياطية بأمان.`,
      });
    }

    const warnings: string[] = [];
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const baseName = (params.backupName || `sudafi-auto-${stamp}`)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 32);

    const effectivePassword =
      params.password && params.password.trim().length > 0
        ? params.password.trim()
        : this.encryptionService.deriveDeterministicSecret(
            `sudafi-router-backup:${params.tenantId}:${device.id}`,
            24,
          );

    // 2. Binary Backup creation + verification + download
    let binaryBackup: BackupCreationBundle['binaryBackup'];
    if (typeof client.createBackup === 'function') {
      const binRes = await client.createBackup(baseName, effectivePassword);
      const backupId = uuidv4();
      let buffer: Buffer | null = null;
      let downloadOk = false;

      const downloader = client.downloadFile
        ? (f: string) => client.downloadFile!(f)
        : client.downloadBackup
          ? (f: string) => client.downloadBackup!(f)
          : undefined;

      if (downloader) {
        try {
          buffer = await downloader(binRes.filename);
          if (buffer && buffer.length > 0) {
            downloadOk = true;
          }
        } catch (dlErr) {
          const msg = dlErr instanceof Error ? dlErr.message : String(dlErr);
          warnings.push(`تم حفظ النسخة الثنائية (${binRes.filename}) على الراوتر لكن تعذر تنزيلها سحابياً: ${msg}`);
        }
      } else {
        warnings.push('عميل الاتصال لا يدعم سحب ملف النسخة الثنائية عن بُعد؛ النسخة محفوظة على ذاكرة الراوتر.');
      }

      const fileSizeBytes = buffer?.length || binRes.size || 0;
      const checksumSha256 = buffer
        ? crypto.createHash('sha256').update(buffer).digest('hex')
        : undefined;

      let storageBucket: string | undefined;
      let storagePath: string | undefined;
      let cloudStored = false;
      if (buffer && buffer.length > 0) {
        const up = await this.backupStorage.uploadPrivateObject({
          tenantId: params.tenantId,
          deviceId: device.id,
          backupId,
          fileName: binRes.filename,
          content: buffer,
          contentType: 'application/octet-stream',
        });
        storageBucket = up.bucket;
        storagePath = up.storagePath;
        cloudStored = up.uploaded;
        if (!up.uploaded && up.error) {
          warnings.push(up.error);
        }
      }

      const record = await this.prisma.routerBackup.create({
        data: {
          id: backupId,
          tenantId: params.tenantId,
          deviceId: device.id,
          operationId: params.operationId ?? null,
          createdById: params.userId ?? null,
          backupType: 'BINARY',
          fileName: binRes.filename,
          routerFileName: binRes.filename,
          storageBucket: cloudStored ? storageBucket : null,
          storagePath: cloudStored ? storagePath : null,
          fileSizeBytes,
          checksumSha256: checksumSha256 ?? null,
          routerOsVersion: res.version,
          boardName: res.boardName || device.modelName || null,
          deviceModel: res.model || res.boardName || device.modelName || null,
          architecture: res.architecture || null,
          isEncrypted: true,
          status: cloudStored && checksumSha256 ? 'VERIFIED' : 'READY',
          metadata: {
            cloudStored,
            downloadedFromRouter: downloadOk,
            checksumVerified: Boolean(checksumSha256),
            portabilityNotice:
              'النسخة الثنائية (.backup) مخصصة لنفس الموديل وإصدار RouterOS وقد لا تعمل على جهاز مختلف.',
          },
        },
      });

      binaryBackup = {
        id: record.id,
        fileName: record.fileName,
        routerFileName: record.routerFileName,
        fileSizeBytes: record.fileSizeBytes,
        checksumSha256: record.checksumSha256 ?? undefined,
        cloudStored,
        status: record.status,
      };
    }

    if (
      params.requireOffRouterBackup &&
      (!binaryBackup || !binaryBackup.cloudStored || !binaryBackup.checksumSha256)
    ) {
      throw new BadGatewayException({
        code: 'OFF_ROUTER_BACKUP_REQUIRED',
        message:
          'يتطلب وضع الإعداد النظيف حفظ نسخة احتياطية مشفرة خارج الراوتر والتحقق من بصمتها (SHA-256)؛ تعذر التحقق من التخزين الخارجي.',
      });
    }

    // 3. RSC Export creation + verification + download
    let rscBackup: BackupCreationBundle['rscBackup'];
    if (params.includeRscExport !== false && typeof client.createRscExport === 'function') {
      try {
        const rscRes = await client.createRscExport(baseName, true);
        const rscId = uuidv4();
        let buffer: Buffer | null = null;
        if (typeof client.downloadFile === 'function') {
          try {
            buffer = await client.downloadFile(rscRes.filename);
          } catch (dlErr) {
            warnings.push(
              `تم إنشاء التصدير النصي (${rscRes.filename}) على الراوتر لكن تعذر تنزيله: ${dlErr instanceof Error ? dlErr.message : String(dlErr)}`,
            );
          }
        }

        const fileSizeBytes = buffer?.length || rscRes.size || 0;
        const checksumSha256 = buffer
          ? crypto.createHash('sha256').update(buffer).digest('hex')
          : undefined;

        let cloudStored = false;
        let storageBucket: string | undefined;
        let storagePath: string | undefined;
        if (buffer && buffer.length > 0) {
          const up = await this.backupStorage.uploadPrivateObject({
            tenantId: params.tenantId,
            deviceId: device.id,
            backupId: rscId,
            fileName: `${baseName}.rsc`,
            content: buffer,
            contentType: 'text/plain; charset=utf-8',
          });
          cloudStored = up.uploaded;
          storageBucket = up.bucket;
          storagePath = up.storagePath;
        }

        const rec = await this.prisma.routerBackup.create({
          data: {
            id: rscId,
            tenantId: params.tenantId,
            deviceId: device.id,
            operationId: params.operationId ?? null,
            createdById: params.userId ?? null,
            backupType: 'RSC_EXPORT',
            fileName: `${baseName}.rsc`,
            routerFileName: rscRes.filename,
            storageBucket: cloudStored ? storageBucket : null,
            storagePath: cloudStored ? storagePath : null,
            fileSizeBytes,
            checksumSha256: checksumSha256 ?? null,
            routerOsVersion: res.version,
            boardName: res.boardName || device.modelName || null,
            deviceModel: res.model || res.boardName || device.modelName || null,
            architecture: res.architecture || null,
            isEncrypted: false,
            status: cloudStored && checksumSha256 ? 'VERIFIED' : 'READY',
            metadata: {
              redactedSensitive: true,
              cloudStored,
              checksumVerified: Boolean(checksumSha256),
            },
          },
        });

        rscBackup = {
          id: rec.id,
          fileName: rec.fileName,
          routerFileName: rec.routerFileName,
          fileSizeBytes: rec.fileSizeBytes,
          checksumSha256: rec.checksumSha256 ?? undefined,
          cloudStored,
          status: rec.status,
        };
      } catch (rscErr) {
        const msg = rscErr instanceof Error ? rscErr.message : String(rscErr);
        warnings.push(`تعذر إنشاء ملف RSC Export إضافي: ${msg}`);
      }
    }

    await this.auditLogsService.log({
      tenantId: params.tenantId,
      userId: params.userId ?? null,
      action: 'PROVISIONING_BACKUP_CREATED',
      entity: 'router_backup',
      entityId: binaryBackup?.id || rscBackup?.id || device.id,
      newValues: {
        deviceId: device.id,
        operationId: params.operationId,
        binaryFile: binaryBackup?.fileName,
        rscFile: rscBackup?.fileName,
        warnings,
      },
    });

    return { binaryBackup, rscBackup, warnings };
  }

  async listDeviceBackups(tenantId: string, deviceId: string) {
    const dbBackups = await this.prisma.routerBackup.findMany({
      where: { tenantId, deviceId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return Promise.all(
      dbBackups.map(async (b) => ({
        ...b,
        signedUrl: b.storagePath
          ? await this.backupStorage.createSignedDownloadUrl(b.storagePath, 300)
          : undefined,
        portabilityNotice:
          b.backupType === 'BINARY'
            ? 'النسخة الثنائية (.backup) خاصة بهذا الموديل وهذا الإصدار ولا تصلح للنقل إلى جهاز مختلف.'
            : 'تصدير الإعدادات النصية (.rsc) قابل للمراجعة والمقارنة ولا يتضمن كلمات المرور الحساسة.',
      })),
    );
  }

  async downloadBackupById(
    tenantId: string,
    backupId: string,
    userId?: string,
  ): Promise<{ buffer: Buffer; fileName: string; contentType: string; size: number }> {
    const backup = await this.prisma.routerBackup.findFirst({
      where: { id: backupId, tenantId },
      include: { device: true },
    });

    if (!backup) {
      throw new NotFoundException({
        code: 'BACKUP_NOT_FOUND',
        message: 'لم يتم العثور على النسخة الاحتياطية المطلوبة ضمن حسابك.',
      });
    }

    let buffer: Buffer | null = null;
    if (backup.storagePath) {
      buffer = await this.backupStorage.downloadPrivateObject(backup.storagePath);
    }

    if (!buffer && backup.device) {
      const client = await this.clientFactory.getClient({
        id: backup.device.id,
        name: backup.device.name,
        host: backup.device.host,
        apiPort: backup.device.apiPort,
        restPort: backup.device.restPort,
        useSsl: backup.device.useSsl,
        username: backup.device.username,
        passwordEncrypted: backup.device.passwordEncrypted,
        iv: backup.device.iv,
        authTag: backup.device.authTag,
        rosVersion: backup.device.rosVersion,
      });

      if (typeof client.downloadFile === 'function') {
        buffer = await client.downloadFile(backup.routerFileName);
      } else if (backup.backupType === 'BINARY' && typeof client.downloadBackup === 'function') {
        buffer = await client.downloadBackup(backup.routerFileName);
      }
    }

    if (!buffer || buffer.length === 0) {
      throw new BadGatewayException({
        code: 'BACKUP_DOWNLOAD_UNAVAILABLE',
        message: `تعذر جلب محتوى النسخة (${backup.fileName}) من التخزين السحابي الخاص أو من الراوتر مباشرة.`,
      });
    }

    if (backup.checksumSha256) {
      const actualSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
      if (actualSha256 !== backup.checksumSha256) {
        throw new BadGatewayException({
          code: 'BACKUP_CHECKSUM_MISMATCH',
          message: `فشل التحقق من سلامة النسخة الاحتياطية (${backup.fileName}): بصمة SHA-256 غير متطابقة.`,
        });
      }
    }

    await this.auditLogsService.log({
      tenantId,
      userId: userId ?? null,
      action: 'PROVISIONING_BACKUP_DOWNLOADED',
      entity: 'router_backup',
      entityId: backup.id,
      newValues: { fileName: backup.fileName, sizeBytes: buffer.length },
    });

    return {
      buffer,
      fileName: backup.fileName,
      contentType:
        backup.backupType === 'RSC_EXPORT' ? 'text/plain; charset=utf-8' : 'application/octet-stream',
      size: buffer.length,
    };
  }
}
