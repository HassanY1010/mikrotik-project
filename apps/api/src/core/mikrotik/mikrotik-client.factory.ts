import { Injectable, Logger } from '@nestjs/common';
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
export class MikrotikClientFactory {
  private readonly logger = new Logger(MikrotikClientFactory.name);
  private readonly clientCache = new Map<string, { client: IMikrotikClient; lastUsed: number }>();
  private readonly IDLE_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes idle connection timeout

  constructor(private readonly encryptionService: EncryptionService) {
    // Periodic idle cleanup
    setInterval(() => this.cleanupIdleConnections(), 60 * 1000);
  }

  /**
   * Creates or returns an active pooled client for the specified device.
   */
  async getClient(device: DeviceConnectionConfig): Promise<IMikrotikClient> {
    const cacheKey = `${device.id}:${device.host}:${device.apiPort}`;

    const cached = this.clientCache.get(cacheKey);
    if (cached && cached.client.isConnected()) {
      cached.lastUsed = Date.now();
      return cached.client;
    }

    // Decrypt router password
    const password = this.encryptionService.decrypt(
      device.passwordEncrypted,
      device.iv,
      device.authTag,
    );

    // Use RouterOsApiClient (Socket API is fast, universal, and works for both v6 and v7)
    const client = new RouterOsApiClient({
      host: device.host,
      port: device.apiPort,
      username: device.username,
      password,
      useSsl: device.useSsl,
      timeoutMs: 10000,
    });

    try {
      await client.connect();
      this.clientCache.set(cacheKey, { client, lastUsed: Date.now() });
      return client;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed socket connection to ${device.host}:${device.apiPort}: ${msg}`);

      // If ROS v7 and REST port available, fallback to REST client
      if (device.rosVersion === RouterOsVersion.V7 && device.restPort) {
        this.logger.log(`Attempting ROS v7 REST fallback on port ${device.restPort}...`);
        const restClient = new RouterOsRestClient({
          host: device.host,
          port: device.restPort,
          username: device.username,
          password,
          useSsl: device.useSsl,
          timeoutMs: 10000,
        });

        await restClient.connect();
        this.clientCache.set(cacheKey, { client: restClient, lastUsed: Date.now() });
        return restClient;
      }

      throw err;
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
      const targetPort = config.restPort ?? (config.useSsl ? 443 : 80);
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
      const targetPort = config.apiPort ?? (config.useSsl ? 8729 : 8728);
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
