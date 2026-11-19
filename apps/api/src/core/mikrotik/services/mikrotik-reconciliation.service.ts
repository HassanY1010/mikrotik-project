import {
  Injectable,
  Logger,
  NotFoundException,
  BadGatewayException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { EncryptionService } from '../../security/encryption.service';
import { MikrotikClientFactory } from '../mikrotik-client.factory';
import { IMikrotikClient } from '../interfaces/mikrotik-client.interface';
import { CardStatus, SyncStatus, CardBatchStatus, PppoeAccountStatus } from '@prisma/client';

export interface ReconciliationSummary {
  deviceId: string;
  deviceName: string;
  timestamp: string;
  durationMs: number;
  status: 'COMPLETED' | 'SKIPPED' | 'FAILED';
  skipReason?: string;
  hotspot: {
    profiles: {
      added: number;
      updated: number;
      unchanged: number;
    };
    users: {
      imported: number;
      updated: number;
      missingOnRouter: number;
      unchanged: number;
    };
  };
  pppoe: {
    profiles: {
      added: number;
      updated: number;
      unchanged: number;
    };
    secrets: {
      imported: number;
      updated: number;
      missingOnRouter: number;
      unchanged: number;
    };
  };
  errors: string[];
}

@Injectable()
export class MikrotikReconciliationService {
  private readonly logger = new Logger(MikrotikReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly mikrotikClientFactory: MikrotikClientFactory,
  ) {}

  private isPrivateHost(host?: string): boolean {
    if (!host) return false;
    const clean = host.trim().toLowerCase();
    if (clean === 'localhost' || clean === '127.0.0.1' || clean === '::1') return true;
    if (clean.startsWith('10.') || clean.startsWith('192.168.')) return true;
    if (clean.startsWith('172.')) {
      const parts = clean.split('.');
      const second = parseInt(parts[1], 10);
      if (second >= 16 && second <= 31) return true;
    }
    return false;
  }

  /**
   * Reconciles external changes from MikroTik (WinBox, WebFig, Terminal) into the SudaFi database.
   * Guarantees:
   * 1. MikroTik is the Source of Truth.
   * 2. External creations are imported without duplicates.
   * 3. External modifications (disables, rate limits, limits) are synced.
   * 4. External deletions are marked without destroying historical accounting/sales data.
   * 5. If router query fails, local data is NEVER deleted.
   */
  async reconcileRouter(
    tenantId: string,
    deviceId: string,
  ): Promise<ReconciliationSummary> {
    const startTime = Date.now();

    const device = await this.prisma.mikroTikDevice.findFirst({
      where: { id: deviceId, tenantId, deletedAt: null },
    });

    if (!device) {
      throw new NotFoundException(`جهاز الراوتر [${deviceId}] غير موجود أو تم حذفه`);
    }

    const summary: ReconciliationSummary = {
      deviceId: device.id,
      deviceName: device.name,
      timestamp: new Date().toISOString(),
      durationMs: 0,
      status: 'COMPLETED',
      hotspot: {
        profiles: { added: 0, updated: 0, unchanged: 0 },
        users: { imported: 0, updated: 0, missingOnRouter: 0, unchanged: 0 },
      },
      pppoe: {
        profiles: { added: 0, updated: 0, unchanged: 0 },
        secrets: { imported: 0, updated: 0, missingOnRouter: 0, unchanged: 0 },
      },
      errors: [],
    };

    // Private LAN or missing credentials check
    if (this.isPrivateHost(device.host)) {
      summary.status = 'SKIPPED';
      summary.skipReason = 'الراوتر متصل بشبكة محلية خاصة (Private LAN)؛ يلزم تشغيل المزامنة عبر وكيل Agent أو تطبيق الموبايل المحلي';
      summary.durationMs = Date.now() - startTime;
      return summary;
    }

    if (!device.passwordEncrypted) {
      summary.status = 'SKIPPED';
      summary.skipReason = 'بيانات اعتماد الاتصال بالراوتر غير متوفرة أو غير مشفرة';
      summary.durationMs = Date.now() - startTime;
      return summary;
    }

    // Connect to router
    let client: IMikrotikClient;
    try {
      client = await this.mikrotikClientFactory.getClient({
        id: device.id,
        name: device.name,
        host: device.host,
        apiPort: device.apiPort,
        restPort: device.restPort,
        username: device.username,
        passwordEncrypted: device.passwordEncrypted,
        iv: device.iv,
        authTag: device.authTag,
        useSsl: device.useSsl,
        rosVersion: device.rosVersion,
      });
      await client.connect();
    } catch (connErr: any) {
      this.logger.warn(`Could not connect to router ${device.name} for reconciliation: ${connErr}`);
      summary.status = 'FAILED';
      summary.errors.push(`فشل الاتصال بالراوتر: ${connErr?.message || connErr}`);
      summary.durationMs = Date.now() - startTime;
      return summary;
    }

    // 1. RECONCILE HOTSPOT PROFILES
    try {
      await this.reconcileHotspotProfiles(tenantId, device.id, client, summary);
    } catch (profErr: any) {
      this.logger.error(`HotSpot profiles reconciliation error on ${device.name}: ${profErr}`);
      summary.errors.push(`فشل مزامنة بروفايلات الهوتسبوت: ${profErr?.message || profErr}`);
    }

    // 2. RECONCILE HOTSPOT USERS / CARDS
    try {
      await this.reconcileHotspotUsers(tenantId, device.id, client, summary);
    } catch (userErr: any) {
      this.logger.error(`HotSpot users reconciliation error on ${device.name}: ${userErr}`);
      summary.errors.push(`فشل مزامنة كروت الهوتسبوت: ${userErr?.message || userErr}`);
    }

    // 3. RECONCILE PPPOE PROFILES
    try {
      await this.reconcilePppoeProfiles(tenantId, device.id, client, summary);
    } catch (pppProfErr: any) {
      this.logger.debug(`PPPoE profiles skipped or not supported on ${device.name}: ${pppProfErr}`);
    }

    // 4. RECONCILE PPPOE SECRETS / SUBSCRIBERS
    try {
      await this.reconcilePppoeSecrets(tenantId, device.id, client, summary);
    } catch (pppSecErr: any) {
      this.logger.debug(`PPPoE secrets skipped or not supported on ${device.name}: ${pppSecErr}`);
    }

    // Update last sync timestamp on device
    await this.prisma.mikroTikDevice.update({
      where: { id: device.id },
      data: {
        lastSyncAt: new Date(),
        isOnline: true,
      },
    }).catch(() => {});

    summary.durationMs = Date.now() - startTime;
    return summary;
  }

  // =========================================================================
  // HOTSPOT PROFILES RECONCILIATION
  // =========================================================================

  private async reconcileHotspotProfiles(
    tenantId: string,
    deviceId: string,
    client: IMikrotikClient,
    summary: ReconciliationSummary,
  ): Promise<void> {
    const routerProfiles = await client.listHotspotProfiles();
    const localProfiles = await this.prisma.hotspotProfile.findMany({
      where: { tenantId, deviceId },
    });

    const localMap = new Map(localProfiles.map((p) => [p.name, p]));

    for (const rp of routerProfiles) {
      if (!rp.name || rp.name === 'default') continue;

      const existing = localMap.get(rp.name);

      if (!existing) {
        // Created in WinBox -> Import to SudaFi
        await this.prisma.hotspotProfile.create({
          data: {
            tenantId,
            deviceId,
            name: rp.name,
            displayName: rp.name,
            rateLimit: rp.rateLimit || null,
            sessionTimeout: rp.sessionTimeout || null,
            idleTimeout: rp.idleTimeout || null,
            keepaliveTimeout: rp.keepaliveTimeout || null,
            sharedUsers: rp.sharedUsers || 1,
            addressPool: rp.addressPool || null,
          },
        });
        summary.hotspot.profiles.added++;
      } else {
        // Check for modifications made in WinBox
        const needsUpdate =
          (rp.rateLimit && rp.rateLimit !== existing.rateLimit) ||
          (rp.sessionTimeout && rp.sessionTimeout !== existing.sessionTimeout) ||
          (rp.sharedUsers && rp.sharedUsers !== existing.sharedUsers);

        if (needsUpdate) {
          await this.prisma.hotspotProfile.update({
            where: { id: existing.id },
            data: {
              rateLimit: rp.rateLimit ?? existing.rateLimit,
              sessionTimeout: rp.sessionTimeout ?? existing.sessionTimeout,
              sharedUsers: rp.sharedUsers ?? existing.sharedUsers,
            },
          });
          summary.hotspot.profiles.updated++;
        } else {
          summary.hotspot.profiles.unchanged++;
        }
      }
    }
  }

  // =========================================================================
  // HOTSPOT USERS RECONCILIATION
  // =========================================================================

  private async reconcileHotspotUsers(
    tenantId: string,
    deviceId: string,
    client: IMikrotikClient,
    summary: ReconciliationSummary,
  ): Promise<void> {
    // 1. Fetch router users - If this throws, execution halts before touching local cards
    const routerUsers = await client.listHotspotUsers();

    // 2. Fetch local cards
    const localCards = await this.prisma.card.findMany({
      where: { tenantId, deviceId },
      include: { profile: true },
    });

    const localMap = new Map(localCards.map((c) => [c.username, c]));
    const matchedCardIds = new Set<string>();

    // Cache local profiles for mapping
    const localProfiles = await this.prisma.hotspotProfile.findMany({
      where: { tenantId, deviceId },
    });
    const profileMap = new Map(localProfiles.map((p) => [p.name, p.id]));
    const defaultProfileId = localProfiles[0]?.id;

    // Resolve or create dedicated import batch
    let importBatchId: string | null = null;

    for (const ru of routerUsers) {
      if (!ru.name) continue;

      const card = localMap.get(ru.name);

      if (card) {
        matchedCardIds.add(card.id);

        // Check status synchronization (WinBox disable/enable)
        const isRouterDisabled = ru.disabled === true || (ru.disabled as any) === 'true';
        let statusUpdate: CardStatus | undefined = undefined;

        if (isRouterDisabled && card.status === CardStatus.ACTIVE) {
          statusUpdate = CardStatus.DISABLED;
        } else if (!isRouterDisabled && card.status === CardStatus.DISABLED) {
          // If enabled on router, restore to ACTIVE
          statusUpdate = CardStatus.ACTIVE;
        }

        if (statusUpdate) {
          await this.prisma.card.update({
            where: { id: card.id },
            data: {
              status: statusUpdate,
              syncStatus: SyncStatus.SYNCED,
            },
          });
          summary.hotspot.users.updated++;
        } else {
          summary.hotspot.users.unchanged++;
        }
      } else {
        // User created externally in WinBox -> Import to SudaFi
        if (!importBatchId) {
          importBatchId = await this.getOrCreateWinboxImportBatch(tenantId, deviceId, defaultProfileId);
        }

        const targetProfileId = (ru.profile && profileMap.get(ru.profile)) || defaultProfileId;
        if (!targetProfileId) continue;

        const clearPass = ru.password || ru.name;
        const encrypted = this.encryptionService.encrypt(clearPass);
        const serialNumber = `WBX-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

        await this.prisma.card.create({
          data: {
            tenantId,
            deviceId,
            batchId: importBatchId,
            profileId: targetProfileId,
            username: ru.name,
            passwordEncrypted: encrypted.ciphertext,
            iv: encrypted.iv,
            authTag: encrypted.authTag,
            serialNumber,
            price: 0,
            status: (ru.disabled === true || (ru.disabled as any) === 'true') ? CardStatus.DISABLED : CardStatus.AVAILABLE,
            timeLimit: ru.limitUptime || null,
            dataLimitBytes: ru.limitBytesTotal ? BigInt(ru.limitBytesTotal) : null,
            syncStatus: SyncStatus.SYNCED,
          },
        });
        summary.hotspot.users.imported++;
      }
    }

    // 3. Check for cards that exist in SudaFi but were removed on MikroTik
    for (const card of localCards) {
      if (!matchedCardIds.has(card.id)) {
        // Only consider ACTIVE or AVAILABLE cards that were previously synced
        if (
          (card.status === CardStatus.ACTIVE || card.status === CardStatus.AVAILABLE) &&
          card.syncStatus === SyncStatus.SYNCED
        ) {
          // Mark as DISABLED with sync note; NEVER delete local accounting records!
          await this.prisma.card.update({
            where: { id: card.id },
            data: {
              status: CardStatus.DISABLED,
              syncError: 'تم حذف المستخدم من راوتر MikroTik عبر WinBox/Terminal',
            },
          });
          summary.hotspot.users.missingOnRouter++;
        }
      }
    }
  }

  // =========================================================================
  // PPPOE PROFILES & SECRETS RECONCILIATION
  // =========================================================================

  private async reconcilePppoeProfiles(
    tenantId: string,
    deviceId: string,
    client: IMikrotikClient,
    summary: ReconciliationSummary,
  ): Promise<void> {
    if (!client.listPppProfiles) return;

    const routerProfiles = await client.listPppProfiles();
    const localProfiles = await this.prisma.pppoeProfile.findMany({
      where: { tenantId, deviceId },
    });

    const localMap = new Map(localProfiles.map((p) => [p.name, p]));

    for (const rp of routerProfiles) {
      if (!rp.name || rp.name === 'default' || rp.name === 'default-encryption') continue;

      const existing = localMap.get(rp.name);

      if (!existing) {
        await this.prisma.pppoeProfile.create({
          data: {
            tenantId,
            deviceId,
            name: rp.name,
            rateLimit: rp.rateLimit || null,
            localAddress: rp.localAddress || null,
            remoteAddress: rp.remoteAddress || null,
            dnsServers: rp.dnsServer || null,
            onlyOne: rp.onlyOne === 'yes',
            price: 0,
            description: 'Imported from MikroTik',
          },
        });
        summary.pppoe.profiles.added++;
      } else {
        const needsUpdate =
          (rp.rateLimit && rp.rateLimit !== existing.rateLimit) ||
          (rp.remoteAddress && rp.remoteAddress !== existing.remoteAddress);

        if (needsUpdate) {
          await this.prisma.pppoeProfile.update({
            where: { id: existing.id },
            data: {
              rateLimit: rp.rateLimit ?? existing.rateLimit,
              remoteAddress: rp.remoteAddress ?? existing.remoteAddress,
            },
          });
          summary.pppoe.profiles.updated++;
        } else {
          summary.pppoe.profiles.unchanged++;
        }
      }
    }
  }

  private async reconcilePppoeSecrets(
    tenantId: string,
    deviceId: string,
    client: IMikrotikClient,
    summary: ReconciliationSummary,
  ): Promise<void> {
    if (!client.listPppSecrets) return;

    const routerSecrets = await client.listPppSecrets();
    const localAccounts = await this.prisma.pppoeAccount.findMany({
      where: { tenantId, deviceId },
    });

    const localMap = new Map(localAccounts.map((a) => [a.username, a]));
    const localProfiles = await this.prisma.pppoeProfile.findMany({
      where: { tenantId, deviceId },
    });
    const profileMap = new Map(localProfiles.map((p) => [p.name, p.id]));
    const defaultProfileId = localProfiles[0]?.id;

    const matchedAccountIds = new Set<string>();

    for (const rs of routerSecrets) {
      if (!rs.name) continue;

      const acc = localMap.get(rs.name);

      if (acc) {
        matchedAccountIds.add(acc.id);

        const isRouterDisabled = rs.disabled === true;
        let statusUpdate: PppoeAccountStatus | undefined = undefined;

        if (isRouterDisabled && acc.status === PppoeAccountStatus.ACTIVE) {
          statusUpdate = PppoeAccountStatus.DISABLED;
        } else if (!isRouterDisabled && acc.status === PppoeAccountStatus.DISABLED) {
          statusUpdate = PppoeAccountStatus.ACTIVE;
        }

        if (statusUpdate) {
          await this.prisma.pppoeAccount.update({
            where: { id: acc.id },
            data: {
              status: statusUpdate,
              syncStatus: SyncStatus.SYNCED,
            },
          });
          summary.pppoe.secrets.updated++;
        } else {
          summary.pppoe.secrets.unchanged++;
        }
      } else {
        // Created in WinBox -> Import to SudaFi
        if (!defaultProfileId) continue;
        const targetProfId = (rs.profile && profileMap.get(rs.profile)) || defaultProfileId;

        const clearPass = rs.password || rs.name;
        const encrypted = this.encryptionService.encrypt(clearPass);

        await this.prisma.pppoeAccount.create({
          data: {
            tenantId,
            deviceId,
            profileId: targetProfId,
            username: rs.name,
            passwordEncrypted: encrypted.ciphertext,
            iv: encrypted.iv,
            authTag: encrypted.authTag,
            status: rs.disabled ? PppoeAccountStatus.DISABLED : PppoeAccountStatus.ACTIVE,
            staticIp: rs.remoteAddress || null,
            customerName: rs.comment || null,
            price: 0,
            syncStatus: SyncStatus.SYNCED,
          },
        });
        summary.pppoe.secrets.imported++;
      }
    }

    // Check secrets missing on router
    for (const acc of localAccounts) {
      if (!matchedAccountIds.has(acc.id) && acc.status === PppoeAccountStatus.ACTIVE) {
        await this.prisma.pppoeAccount.update({
          where: { id: acc.id },
          data: {
            status: PppoeAccountStatus.DISABLED,
            syncError: 'تم حذف الحساب من راوتر MikroTik عبر WinBox/Terminal',
          },
        });
        summary.pppoe.secrets.missingOnRouter++;
      }
    }
  }

  // =========================================================================
  // HELPER: GET OR CREATE WINBOX IMPORT BATCH
  // =========================================================================

  private async getOrCreateWinboxImportBatch(
    tenantId: string,
    deviceId: string,
    profileId?: string,
  ): Promise<string> {
    const existing = await this.prisma.cardBatch.findFirst({
      where: {
        tenantId,
        deviceId,
        themePreset: 'WINBOX_IMPORT',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      return existing.id;
    }

    // Resolve an owner/admin user for createdById relation
    const adminUser = await this.prisma.user.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });

    let targetProfileId = profileId;
    if (!targetProfileId) {
      const prof = await this.prisma.hotspotProfile.findFirst({
        where: { tenantId, deviceId },
      });
      targetProfileId = prof?.id;
    }

    if (!targetProfileId || !adminUser) {
      throw new BadGatewayException('لا يمكن إنشاء دفعة استيراد: يلزم وجود بروفايل ومستخدم مسؤول في النظام');
    }

    const batch = await this.prisma.cardBatch.create({
      data: {
        tenantId,
        deviceId,
        profileId: targetProfileId,
        batchNumber: `WBX-${deviceId.slice(0, 4)}-${Date.now()}`,
        totalCards: 0,
        price: 0,
        status: CardBatchStatus.COMPLETED,
        themePreset: 'WINBOX_IMPORT',
        createdById: adminUser.id,
      },
    });

    return batch.id;
  }
}
