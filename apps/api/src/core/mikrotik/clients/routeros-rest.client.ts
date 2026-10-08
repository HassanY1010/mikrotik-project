import type {
  IMikrotikClient,
  RouterResource,
  HotspotProfileItem,
  HotspotUserItem,
  HotspotActiveSessionItem,
} from '../interfaces/mikrotik-client.interface';

export interface RouterOsRestConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  useSsl?: boolean;
  timeoutMs?: number;
}

export class RouterOsRestClient implements IMikrotikClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly timeoutMs: number;
  private connected = false;

  constructor(private readonly config: RouterOsRestConfig) {
    const protocol = config.useSsl ? 'https' : 'http';
    this.baseUrl = `${protocol}://${config.host}:${config.port}/rest`;
    const credentials = Buffer.from(`${config.username}:${config.password ?? ''}`, 'utf8').toString(
      'base64',
    );
    this.authHeader = `Basic ${credentials}`;
    this.timeoutMs = config.timeoutMs ?? 10000;
  }

  async connect(): Promise<void> {
    const isOk = await this.ping();
    if (!isOk) {
      throw new Error(
        `Failed to reach MikroTik REST API at ${this.config.host}:${this.config.port}`,
      );
    }
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  private async request<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          Authorization: this.authHeader,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(options.headers ?? {}),
        },
      });

      clearTimeout(timer);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `MikroTik REST error (${response.status} ${response.statusText}): ${errorText}`,
        );
      }

      if (response.status === 204) {
        return undefined as unknown as T;
      }

      return (await response.json()) as T;
    } catch (err) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`MikroTik REST request to ${endpoint} failed: ${msg}`);
    }
  }

  // ===========================================================================
  // IMikrotikClient Implementation
  // ===========================================================================

  async ping(): Promise<boolean> {
    try {
      const res = await this.request<Record<string, unknown>>('/system/resource', {
        method: 'GET',
      });
      return res !== null && typeof res === 'object';
    } catch {
      return false;
    }
  }

  async getSystemResource(): Promise<RouterResource> {
    const res = await this.request<Record<string, string>>('/system/resource', {
      method: 'GET',
    });

    return {
      uptime: res['uptime'] ?? '0s',
      version: res['version'] ?? 'unknown',
      cpuLoad: parseInt(res['cpu-load'] ?? '0', 10),
      freeMemory: parseInt(res['free-memory'] ?? '0', 10),
      totalMemory: parseInt(res['total-memory'] ?? '0', 10),
      freeHdd: parseInt(res['free-hdd-space'] ?? '0', 10),
      totalHdd: parseInt(res['total-hdd-space'] ?? '0', 10),
      boardName: res['board-name'],
      architecture: res['architecture-name'],
    };
  }

  async listHotspotProfiles(): Promise<HotspotProfileItem[]> {
    const list = await this.request<Record<string, string>[]>('/ip/hotspot/user/profile', {
      method: 'GET',
    });

    return list.map((item) => ({
      id: item['.id'],
      name: item['name'],
      rateLimit: item['rate-limit'],
      sessionTimeout: item['session-timeout'],
      idleTimeout: item['idle-timeout'],
      keepaliveTimeout: item['keepalive-timeout'],
      sharedUsers: item['shared-users'] ? parseInt(item['shared-users'], 10) : 1,
      addressPool: item['address-pool'],
    }));
  }

  async createHotspotProfile(profile: HotspotProfileItem): Promise<string> {
    const payload: Record<string, unknown> = {
      name: profile.name,
    };
    if (profile.rateLimit) payload['rate-limit'] = profile.rateLimit;
    if (profile.sessionTimeout) payload['session-timeout'] = profile.sessionTimeout;
    if (profile.idleTimeout) payload['idle-timeout'] = profile.idleTimeout;
    if (profile.sharedUsers !== undefined) payload['shared-users'] = String(profile.sharedUsers);

    const res = await this.request<Record<string, string>>('/ip/hotspot/user/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });

    return res['ret'] ?? profile.name;
  }

  async updateHotspotProfile(name: string, profile: Partial<HotspotProfileItem>): Promise<void> {
    const payload: Record<string, unknown> = {};
    if (profile.rateLimit !== undefined) payload['rate-limit'] = profile.rateLimit;
    if (profile.sessionTimeout !== undefined) payload['session-timeout'] = profile.sessionTimeout;
    if (profile.sharedUsers !== undefined) payload['shared-users'] = String(profile.sharedUsers);

    await this.request(`/ip/hotspot/user/profile/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async deleteHotspotProfile(name: string): Promise<void> {
    await this.request(`/ip/hotspot/user/profile/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
  }

  async listHotspotUsers(): Promise<HotspotUserItem[]> {
    const list = await this.request<Record<string, string>[]>('/ip/hotspot/user', {
      method: 'GET',
    });

    return list.map((item) => ({
      id: item['.id'],
      name: item['name'],
      profile: item['profile'],
      limitUptime: item['limit-uptime'],
      limitBytesTotal: item['limit-bytes-total']
        ? parseInt(item['limit-bytes-total'], 10)
        : undefined,
      comment: item['comment'],
      disabled: item['disabled'] === 'true',
    }));
  }

  async createHotspotUser(user: HotspotUserItem): Promise<string> {
    const payload: Record<string, unknown> = {
      name: user.name,
    };
    if (user.password) payload['password'] = user.password;
    if (user.profile) payload['profile'] = user.profile;
    if (user.limitUptime) payload['limit-uptime'] = user.limitUptime;
    if (user.limitBytesTotal !== undefined)
      payload['limit-bytes-total'] = String(user.limitBytesTotal);
    if (user.comment) payload['comment'] = user.comment;

    const res = await this.request<Record<string, string>>('/ip/hotspot/user', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });

    return res['ret'] ?? user.name;
  }

  async updateHotspotUser(name: string, user: Partial<HotspotUserItem>): Promise<void> {
    const payload: Record<string, unknown> = {};
    if (user.password !== undefined) payload['password'] = user.password;
    if (user.profile !== undefined) payload['profile'] = user.profile;
    if (user.limitUptime !== undefined) payload['limit-uptime'] = user.limitUptime;
    if (user.comment !== undefined) payload['comment'] = user.comment;

    await this.request(`/ip/hotspot/user/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async disableHotspotUser(name: string): Promise<void> {
    await this.request(`/ip/hotspot/user/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      body: JSON.stringify({ disabled: 'true' }),
    });
  }

  async enableHotspotUser(name: string): Promise<void> {
    await this.request(`/ip/hotspot/user/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      body: JSON.stringify({ disabled: 'false' }),
    });
  }

  async deleteHotspotUser(name: string): Promise<void> {
    await this.request(`/ip/hotspot/user/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
  }

  async listActiveSessions(): Promise<HotspotActiveSessionItem[]> {
    const list = await this.request<Record<string, string>[]>('/ip/hotspot/active', {
      method: 'GET',
    });

    return list.map((item) => ({
      id: item['.id'],
      user: item['user'],
      address: item['address'],
      macAddress: item['mac-address'],
      uptime: item['uptime'] ?? '0s',
      bytesIn: parseInt(item['bytes-in'] ?? '0', 10),
      bytesOut: parseInt(item['bytes-out'] ?? '0', 10),
      sessionId: item['session-id'],
    }));
  }

  async removeActiveSession(sessionOrUserId: string): Promise<void> {
    await this.request(`/ip/hotspot/active/${encodeURIComponent(sessionOrUserId)}`, {
      method: 'DELETE',
    });
  }

  async reboot(): Promise<void> {
    await this.request('/system/reboot', {
      method: 'POST',
    });
  }

  async setAntiTethering(enabled: boolean): Promise<void> {
    const list = await this.request<Record<string, string>[]>('/ip/firewall/mangle', {
      method: 'GET',
    });
    const target = list.find((item) => item['comment'] === 'SudaFi_Anti_Tethering_TTL');

    if (enabled) {
      if (target?.['.id']) {
        await this.request(`/ip/firewall/mangle/${encodeURIComponent(target['.id'])}`, {
          method: 'PATCH',
          body: JSON.stringify({ disabled: 'false' }),
        });
      } else {
        await this.request('/ip/firewall/mangle', {
          method: 'PUT',
          body: JSON.stringify({
            chain: 'prerouting',
            action: 'change-ttl',
            'new-ttl': 'set:1',
            comment: 'SudaFi_Anti_Tethering_TTL',
            disabled: 'false',
          }),
        });
      }
    } else {
      if (target?.['.id']) {
        await this.request(`/ip/firewall/mangle/${encodeURIComponent(target['.id'])}`, {
          method: 'PATCH',
          body: JSON.stringify({ disabled: 'true' }),
        });
      }
    }
  }

  async setEmergencyLock(locked: boolean): Promise<void> {
    const list = await this.request<Record<string, string>[]>('/ip/firewall/filter', {
      method: 'GET',
    });
    const target = list.find((item) => item['comment'] === 'SudaFi_Emergency_Lock');

    if (locked) {
      if (target?.['.id']) {
        await this.request(`/ip/firewall/filter/${encodeURIComponent(target['.id'])}`, {
          method: 'PATCH',
          body: JSON.stringify({ disabled: 'false' }),
        });
      } else {
        await this.request('/ip/firewall/filter', {
          method: 'PUT',
          body: JSON.stringify({
            chain: 'forward',
            action: 'drop',
            comment: 'SudaFi_Emergency_Lock',
            disabled: 'false',
          }),
        });
      }
    } else {
      if (target?.['.id']) {
        await this.request(`/ip/firewall/filter/${encodeURIComponent(target['.id'])}`, {
          method: 'PATCH',
          body: JSON.stringify({ disabled: 'true' }),
        });
      }
    }
  }
}
