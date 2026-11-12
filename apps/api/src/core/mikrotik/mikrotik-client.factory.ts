import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as crypto from 'crypto';
import { RouterOsVersion } from '@prisma/client';
import { EncryptionService } from '../security/encryption.service';
import { RouterOsApiClient } from './clients/routeros-api.client';
import { RouterOsRestClient } from './clients/routeros-rest.client';
import type { IMikrotikClient } from './interfaces/mikrotik-client.interface';

export interface DeviceConnectionConfig {
  id: string;
  name: string;
  host: string;
  apiPort: number;
  restPort?: number;
  useSsl: boolean;
  username: string;
  passwordEncrypted: string;
  iv: string;
  authTag: string;
  rosVersion: RouterOsVersion;
}

@Injectable()
export class MikrotikClientFactory implements OnModuleDestroy {
  private readonly logger = new Logger(MikrotikClientFactory.name);
  private readonly clientCache = new Map<string, { client: IMikrotikClient; lastUsed: number }>();
  private readonly IDLE_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes idle connection timeout
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor(private readonly encryptionService: EncryptionService) {
    // Periodic idle cleanup
    this.cleanupTimer = setInterval(() => {
      void this.cleanupIdleConnections();
    }, 60 * 1000);
    this.cleanupTimer.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupTimer);
    void this.invalidateAll();
  }

  private buildCacheKey(device: DeviceConnectionConfig): string {
    const credFingerprint = crypto
      .createHash('sha256')
      .update(`${device.passwordEncrypted}:${device.iv}:${device.authTag}`)
      .digest('hex')
      .slice(0, 12);

    return [
      device.id,
      device.host.trim().toLowerCase(),
      device.apiPort,
      device.restPort ?? '',
      device.useSsl ? 'ssl' : 'plain',
      device.username.trim(),
      device.rosVersion,
      credFingerprint,
    ].join(':');
  }

  /**
   * Disconnects and removes any cached pooled client(s) belonging to a device ID.
   */
  async invalidateClient(deviceId: string): Promise<void> {
    const prefix = `${deviceId}:`;
    const entries = Array.from(this.clientCache.entries());
    for (const [key, entry] of entries) {
      if (key.startsWith(prefix)) {
        this.clientCache.delete(key);
        try {
          await entry.client.disconnect();
        } catch {
          // ignore disconnect cleanup error
        }
      }
    }
  }

  async invalidateAll(): Promise<void> {
    const entries = Array.from(this.clientCache.entries());
    this.clientCache.clear();
    for (const [, entry] of entries) {
      try {
        await entry.client.disconnect();
      } catch {
        // ignore disconnect cleanup error
      }
    }
  }

  /**
   * Creates or returns an active pooled client for the specified device.
   */
  async getClient(device: DeviceConnectionConfig): Promise<IMikrotikClient> {
    const cacheKey = this.buildCacheKey(device);

    const cached = this.clientCache.get(cacheKey);
    if (cached && cached.client.isConnected()) {
      cached.lastUsed = Date.now();
      return cached.client;
    }

    // Evict any stale entries for this device before dialing with updated config/credentials.
    await this.invalidateClient(device.id);

    // Decrypt router password
    const password = this.encryptionService.decrypt(
      device.passwordEncrypted,
      device.iv,
      device.authTag,
    );

    const timeoutMs = 7000;
    const isV7 = device.rosVersion === RouterOsVersion.V7;
    const prefersRest =
      isV7 &&
      (device.apiPort === 80 ||
        device.apiPort === 443 ||
        Boolean(device.restPort && device.apiPort !== 8728 && device.apiPort !== 8729));

    // Resolve target ports
    const restPort =
      device.restPort ??
      (device.apiPort === 80 || device.apiPort === 443
        ? device.apiPort
        : device.useSsl
          ? 443
          : 80);
    const socketPort =
      device.apiPort && device.apiPort !== 80 && device.apiPort !== 443
        ? device.apiPort
        : device.useSsl
          ? 8729
          : 8728;

    if (prefersRest) {
      // 1. Try REST first
      try {
        const restClient = new RouterOsRestClient({
          host: device.host,
          port: restPort,
          username: device.username,
          password,
          useSsl: device.useSsl,
          timeoutMs,
        });
        await restClient.connect();
        this.clientCache.set(cacheKey, { client: restClient, lastUsed: Date.now() });
        return restClient;
      } catch (restErr) {
        const msg = restErr instanceof Error ? restErr.message : String(restErr);
        this.logger.warn(
          `REST connection failed on port ${restPort} for ${device.host}: ${msg}. Falling back to socket...`,
        );

        // Fallback to socket
        try {
          const socketClient = new RouterOsApiClient({
            host: device.host,
            port: socketPort,
            username: device.username,
            password,
            useSsl: device.useSsl,
            timeoutMs,
          });
          await socketClient.connect();
          this.clientCache.set(cacheKey, { client: socketClient, lastUsed: Date.now() });
          return socketClient;
        } catch (_) {
          throw restErr; // preserve primary REST error
        }
      }
    } else {
      // 2. Try Socket first
      try {
        const socketClient = new RouterOsApiClient({
          host: device.host,
          port: socketPort,
          username: device.username,
          password,
          useSsl: device.useSsl,
          timeoutMs,
        });
        await socketClient.connect();
        this.clientCache.set(cacheKey, { client: socketClient, lastUsed: Date.now() });
        return socketClient;
      } catch (socketErr) {
        const msg = socketErr instanceof Error ? socketErr.message : String(socketErr);
        this.logger.warn(`Socket connection failed on port ${socketPort} for ${device.host}: ${msg}`);

        // If RouterOS v7, fallback to REST
        if (isV7) {
          this.logger.log(`Attempting ROS v7 REST fallback on port ${restPort}...`);
          try {
            const restClient = new RouterOsRestClient({
              host: device.host,
              port: restPort,
              username: device.username,
              password,
              useSsl: device.useSsl,
              timeoutMs,
            });
            await restClient.connect();
            this.clientCache.set(cacheKey, { client: restClient, lastUsed: Date.now() });
            return restClient;
          } catch (restErr) {
            // Secondary fallback: if non-SSL port 80 failed on v7, try 443 with SSL or vice-versa
            const altRestPort = restPort === 80 ? 443 : restPort === 443 ? 80 : null;
            if (altRestPort) {
              try {
                this.logger.log(`Attempting ROS v7 secondary REST fallback on port ${altRestPort}...`);
                const altRestClient = new RouterOsRestClient({
                  host: device.host,
                  port: altRestPort,
                  username: device.username,
                  password,
                  useSsl: altRestPort === 443,
                  timeoutMs,
                });
                await altRestClient.connect();
                this.clientCache.set(cacheKey, { client: altRestClient, lastUsed: Date.now() });
                return altRestClient;
              } catch (_) {
                // Ignore secondary fallback error
              }
            }
            throw restErr;
          }
        }

        throw socketErr;
      }
    }
  }

  /**
   * Creates an un-pooled direct client for testing connectivity on demand.
   */
  createDirectClient(config: {
    host: string;
    apiPort?: number;
    restPort?: number;
    username: string;
    password?: string;
    useSsl?: boolean;
    rosVersion?: RouterOsVersion;
    timeoutMs?: number;
  }): { client: IMikrotikClient; isRest: boolean; targetPort: number } {
    const isRest =
      config.rosVersion === RouterOsVersion.V7 &&
      Boolean(config.restPort || config.apiPort === 443 || config.apiPort === 80);

    const timeoutMs = config.timeoutMs ?? 7000;

    if (isRest) {
      // Auto-resolve port based on SSL setting
      let targetPort = config.restPort ?? (config.useSsl ? 443 : 80);
      if (!config.useSsl && targetPort === 443) {
        targetPort = 80; // 443 requires SSL; if SSL is off, default to 80 (standard www)
      } else if (config.useSsl && targetPort === 80) {
        targetPort = 443;
      }

      const client = new RouterOsRestClient({
        host: config.host,
        port: targetPort,
        username: config.username,
        password: config.password,
        useSsl: config.useSsl,
        timeoutMs,
      });
      return { client, isRest: true, targetPort };
    } else {
      let targetPort = config.apiPort ?? (config.useSsl ? 8729 : 8728);
      if (!config.useSsl && targetPort === 8729) {
        targetPort = 8728;
      } else if (config.useSsl && targetPort === 8728) {
        targetPort = 8729;
      }
      const client = new RouterOsApiClient({
        host: config.host,
        port: targetPort,
        username: config.username,
        password: config.password,
        useSsl: config.useSsl,
        timeoutMs,
      });
      return { client, isRest: false, targetPort };
    }
  }

  private async cleanupIdleConnections(): Promise<void> {
    const now = Date.now();
    for (const [key, entry] of this.clientCache.entries()) {
      if (now - entry.lastUsed > this.IDLE_TIMEOUT_MS) {
        try {
          await entry.client.disconnect();
        } catch {
          // ignore disconnect error
        }
        this.clientCache.delete(key);
      }
    }
  }
}
