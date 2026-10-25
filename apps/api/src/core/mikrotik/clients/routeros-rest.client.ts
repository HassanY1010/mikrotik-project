import type {
  IMikrotikClient,
  RouterResource,
  HotspotProfileItem,
  HotspotUserItem,
  HotspotActiveSessionItem,
  RouterBackupItem,
  RouterInterfaceItem,
  RouterBridgeItem,
  RouterBridgePortItem,
  RouterIpAddressItem,
  RouterDhcpClientItem,
  RouterDhcpServerItem,
  RouterDhcpLeaseItem,
  RouterArpItem,
  RouterNeighborItem,
  RouterNatRuleItem,
  RouterRouteItem,
  RouterHotspotServerItem,
  RouterPingResult,
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

      const text = await response.text();
      if (!text || text.trim() === '') {
        return undefined as unknown as T;
      }

      try {
        return JSON.parse(text) as T;
      } catch {
        return text as unknown as T;
      }
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
    if (profile.keepaliveTimeout) payload['keepalive-timeout'] = profile.keepaliveTimeout;
    if (profile.sharedUsers !== undefined) payload['shared-users'] = Number(profile.sharedUsers);
    if (profile.addressPool) payload['address-pool'] = profile.addressPool;

    try {
      const res = await this.request<Record<string, string>>('/ip/hotspot/user/profile', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      return (res && res['ret']) ? res['ret'] : profile.name;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/already have profile with (such|this) name/i.test(msg) || /409|already exists/i.test(msg)) {
        await this.updateHotspotProfile(profile.name, profile);
        return profile.name;
      }
      throw err;
    }
  }

  async updateHotspotProfile(name: string, profile: Partial<HotspotProfileItem>): Promise<void> {
    const payload: Record<string, unknown> = {};
    if (profile.rateLimit !== undefined) payload['rate-limit'] = profile.rateLimit;
    if (profile.sessionTimeout !== undefined) payload['session-timeout'] = profile.sessionTimeout;
    if (profile.idleTimeout !== undefined) payload['idle-timeout'] = profile.idleTimeout;
    if (profile.keepaliveTimeout !== undefined) payload['keepalive-timeout'] = profile.keepaliveTimeout;
    if (profile.sharedUsers !== undefined) payload['shared-users'] = Number(profile.sharedUsers);
    if (profile.addressPool !== undefined) payload['address-pool'] = profile.addressPool;

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
      uptime: item['uptime'],
      bytesIn: item['bytes-in'] ? parseInt(item['bytes-in'], 10) : 0,
      bytesOut: item['bytes-out'] ? parseInt(item['bytes-out'], 10) : 0,
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
    if (user.disabled !== undefined) payload['disabled'] = user.disabled ? 'true' : 'false';

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
    if (user.limitBytesTotal !== undefined) {
      payload['limit-bytes-total'] = user.limitBytesTotal ? String(user.limitBytesTotal) : '0';
    }

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
      server: item['server'],
      loginBy: item['login-by'],
      sessionTimeLeft: item['session-time-left'],
      idleTime: item['idle-time'],
      limitBytesTotal: item['limit-bytes-total']
        ? parseInt(item['limit-bytes-total'], 10)
        : undefined,
    }));
  }

  async removeActiveSession(sessionOrUserId: string): Promise<void> {
    try {
      await this.request(`/ip/hotspot/active/${encodeURIComponent(sessionOrUserId)}`, {
        method: 'DELETE',
      });
      return;
    } catch (directErr) {
      // If direct delete by ID failed (e.g. sessionOrUserId is username, IP, or session-id), search active list
      const activeList = await this.listActiveSessions();
      const match = activeList.find(
        (s) =>
          s.id === sessionOrUserId ||
          s.user === sessionOrUserId ||
          s.address === sessionOrUserId ||
          s.sessionId === sessionOrUserId ||
          s.macAddress.toLowerCase() === sessionOrUserId.toLowerCase(),
      );
      if (match && match.id && match.id !== sessionOrUserId) {
        await this.request(`/ip/hotspot/active/${encodeURIComponent(match.id)}`, {
          method: 'DELETE',
        });
        return;
      }
      throw directErr;
    }
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
            chain: 'postrouting',
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

  async createBackup(
    name?: string,
    password?: string,
  ): Promise<{ filename: string; size?: number; creationTime?: string }> {
    const safeName = (name || `sudafi_backup_${Date.now()}`)
      .replace(/\.backup$/i, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    if (!password || password.trim().length === 0) {
      throw new Error(
        'النسخ الاحتياطي غير المشفر غير مسموح به. يجب توفير كلمة مرور لتشفير النسخة الاحتياطية (AES) وحمايتها.',
      );
    }

    const payload: Record<string, string> = {
      name: safeName,
      password: password.trim(),
    };

    await this.request('/system/backup/save', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const expectedFilename = `${safeName}.backup`;
    let target: Record<string, string> | undefined;

    // Verify actual file creation on router flash (retry up to 4 attempts)
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      try {
        const files = await this.request<Record<string, string>[]>('/file', { method: 'GET' });
        if (Array.isArray(files)) {
          target = files.find(
            (f) => f['name'] === expectedFilename || f['name'] === safeName,
          );
          if (target) {
            break;
          }
        }
      } catch {
        // Retry
      }
    }

    if (!target) {
      throw new Error(
        `فشل التحقق من إنشاء ملف النسخة الاحتياطية (${expectedFilename}) على ذاكرة الراوتر عبر REST API. تحقق من مساحة التخزين وصلاحيات الحساب.`,
      );
    }

    const size = target['size'] ? parseInt(target['size'], 10) : undefined;
    const creationTime = target['creation-time'] || new Date().toISOString();

    return {
      filename: expectedFilename,
      size,
      creationTime,
    };
  }

  async listBackups(): Promise<RouterBackupItem[]> {
    const files = await this.request<Record<string, string>[]>('/file', { method: 'GET' });
    if (!Array.isArray(files)) {
      return [];
    }
    return files
      .filter(
        (f) =>
          f['type'] === 'backup' ||
          (f['name'] && f['name'].toLowerCase().endsWith('.backup')),
      )
      .map((f) => ({
        name: f['name'] ?? '',
        size: f['size'] ? parseInt(f['size'], 10) : undefined,
        type: f['type'] ?? 'backup',
        creationTime: f['creation-time'] ?? '',
      }));
  }

  async downloadBackup(filename: string): Promise<Buffer> {
    const safeFilename = filename.replace(/[^a-zA-Z0-9_.-]/g, '');

    // Disallow cleartext HTTP credential transmission over non-loopback connections
    const isLoopback =
      this.config.host === 'localhost' ||
      this.config.host === '127.0.0.1' ||
      this.config.host === '::1';

    if (!this.config.useSsl && !isLoopback) {
      throw new Error(
        `لا يُسمح بإرسال بيانات اعتماد الراوتر عبر بروتوكول HTTP غير مشفر (${this.config.host}). يلزم تفعيل الاتصال المشفر (useSsl: true / HTTPS) لحماية بيانات الاعتماد من التنصت.`,
      );
    }

    const protocol = this.config.useSsl ? 'https' : 'http';
    const baseHttpUrl = `${protocol}://${this.config.host}:${this.config.port}`;
    const url = `${baseHttpUrl}/${encodeURIComponent(safeFilename)}`;

    try {
      let response = await fetch(url, {
        headers: {
          Authorization: this.authHeader,
        },
        signal: AbortSignal.timeout(15000),
      });

      // If file is stored under flash/ directory on some RouterBOARD models
      if (response.status === 404 && !safeFilename.startsWith('flash')) {
        const flashUrl = `${baseHttpUrl}/flash/${encodeURIComponent(safeFilename)}`;
        const flashResponse = await fetch(flashUrl, {
          headers: {
            Authorization: this.authHeader,
          },
          signal: AbortSignal.timeout(15000),
        });
        if (flashResponse.ok) {
          response = flashResponse;
        }
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('text/html') || contentType.includes('application/json')) {
        throw new Error(`استجاب الراوتر بنوع محتوى غير متوقع (${contentType}) بدلاً من ملف ثنائي.`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const contentLengthHeader = response.headers.get('content-length');
      if (contentLengthHeader) {
        const expectedLen = parseInt(contentLengthHeader, 10);
        if (!isNaN(expectedLen) && expectedLen > 0 && buffer.length !== expectedLen) {
          throw new Error(
            `حجم بايتات الملف المستلم (${buffer.length}) لا يطابق Content-Length (${expectedLen}). انقطع الاتصال أثناء النقل.`,
          );
        }
      }

      // Verify the buffer is binary and not an HTML error page or JSON error
      const headerSample = buffer.subarray(0, 50).toString('utf8').toLowerCase();
      if (headerSample.includes('<!doctype') || headerSample.includes('<html') || headerSample.startsWith('{')) {
        throw new Error('Router returned an HTML error page or JSON instead of a binary backup file');
      }

      return buffer;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `تعذر تنزيل ملف النسخة الاحتياطية (${safeFilename}) من الراوتر (${this.config.host}): ${errMsg}. النسخة محفوظة في قائمة Files على الراوتر.`,
      );
    }
  }

  async restoreBackup(
    filename: string,
    password?: string,
  ): Promise<{ success: boolean; message: string; rebootTriggered: boolean; targetFileName?: string }> {
    const safeFilename = filename
      .replace(/[^a-zA-Z0-9_.\-\/]/g, '')
      .replace(/\.{2,}/g, '')
      .replace(/^\/+/, '');

    // 1. Verify file exists on router
    const files = await this.request<Record<string, string>[]>('/file', { method: 'GET' });
    const target = Array.isArray(files)
      ? files.find(
          (f) =>
            f['name'] === safeFilename ||
            f['name'] === safeFilename.replace(/\.backup$/i, '') ||
            f['name'] === `flash/${safeFilename}` ||
            f['name'] === `flash/${safeFilename.replace(/\.backup$/i, '')}`,
        )
      : undefined;

    if (!target) {
      throw new Error(`ملف النسخة الاحتياطية (${safeFilename}) غير موجود على ذاكرة الراوتر.`);
    }

    const matchedFullName = target['name'] ?? safeFilename;
    const nameWithoutExt = matchedFullName.replace(/\.backup$/i, '');
    const candidateNames = [nameWithoutExt, matchedFullName];

    let commandDispatched = false;
    let lastError: Error | null = null;

    for (const loadName of candidateNames) {
      const payload: Record<string, string> = { name: loadName };
      if (password && password.trim().length > 0) {
        payload['password'] = password.trim();
      }

      try {
        await this.request('/system/backup/load', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        commandDispatched = true;
        break;
      } catch (loadErr) {
        const errMsg = loadErr instanceof Error ? loadErr.message : String(loadErr);

        // HTTP 4xx / 5xx errors from RouterOS REST (e.g. wrong password, bad request) MUST be thrown as fatal errors!
        const isRestApiError =
          errMsg.includes('HTTP 400') ||
          errMsg.includes('HTTP 401') ||
          errMsg.includes('HTTP 403') ||
          errMsg.includes('wrong password') ||
          errMsg.includes('corrupted') ||
          errMsg.includes('detail');

        if (isRestApiError && !errMsg.includes('file not found')) {
          throw new Error(`فشل تنفيذ استعادة النسخة عبر REST: ${errMsg}`);
        }

        if (errMsg.includes('file not found')) {
          lastError = loadErr instanceof Error ? loadErr : new Error(errMsg);
          continue;
        }

        // Connection terminated as router initiates kernel reboot
        const isRebootSignal =
          errMsg.toLowerCase().includes('closed') ||
          errMsg.toLowerCase().includes('reset') ||
          errMsg.toLowerCase().includes('end of stream') ||
          errMsg.toLowerCase().includes('socket') ||
          errMsg.toLowerCase().includes('econnreset') ||
          errMsg.toLowerCase().includes('timeout') ||
          errMsg.toLowerCase().includes('networkerror') ||
          errMsg.toLowerCase().includes('fetch failed');

        if (isRebootSignal) {
          commandDispatched = true;
          break;
        }

        throw loadErr;
      }
    }

    if (!commandDispatched) {
      throw lastError || new Error(`تعذر تحميل النسخة الاحتياطية (${safeFilename}) على الراوتر`);
    }

    return {
      success: true,
      message: `تم إرسال أمر استعادة النسخة الاحتياطية (${safeFilename}) وبدأت إعادة تشغيل الراوتر. لا تكتمل الاستعادة إلا بعد عودة الراوتر للعمل ومطابقة إعداداته.`,
      rebootTriggered: true,
      targetFileName: matchedFullName,
    };
  }

  async listInterfaces(): Promise<RouterInterfaceItem[]> {
    await this.connect();
    const items = await this.request<any[]>('/interface');
    if (!Array.isArray(items)) return [];
    return items.map((r) => ({
      id: r['.id'],
      name: r['name'] ?? '',
      type: r['type'] ?? 'unknown',
      running: r['running'] === 'true' || r['running'] === true,
      disabled: r['disabled'] === 'true' || r['disabled'] === true,
      macAddress: r['mac-address'],
      comment: r['comment'],
      mtu: r['mtu'] ? parseInt(String(r['mtu']), 10) : undefined,
    }));
  }

  async listBridges(): Promise<RouterBridgeItem[]> {
    await this.connect();
    const items = await this.request<any[]>('/interface/bridge');
    if (!Array.isArray(items)) return [];
    return items.map((r) => ({
      id: r['.id'],
      name: r['name'] ?? '',
      disabled: r['disabled'] === 'true' || r['disabled'] === true,
      comment: r['comment'],
    }));
  }

  async listBridgePorts(): Promise<RouterBridgePortItem[]> {
    await this.connect();
    const items = await this.request<any[]>('/interface/bridge/port');
    if (!Array.isArray(items)) return [];
    return items.map((r) => ({
      id: r['.id'],
      bridge: r['bridge'] ?? '',
      interface: r['interface'] ?? '',
      horizon: r['horizon'] ? parseInt(String(r['horizon']), 10) : undefined,
      disabled: r['disabled'] === 'true' || r['disabled'] === true,
    }));
  }

  async listIpAddresses(): Promise<RouterIpAddressItem[]> {
    await this.connect();
    const items = await this.request<any[]>('/ip/address');
    if (!Array.isArray(items)) return [];
    return items.map((r) => ({
      id: r['.id'],
      address: r['address'] ?? '',
      network: r['network'] ?? '',
      interface: r['interface'] ?? '',
      disabled: r['disabled'] === 'true' || r['disabled'] === true,
      comment: r['comment'],
    }));
  }

  async listDhcpClients(): Promise<RouterDhcpClientItem[]> {
    await this.connect();
    const items = await this.request<any[]>('/ip/dhcp-client');
    if (!Array.isArray(items)) return [];
    return items.map((r) => ({
      id: r['.id'],
      interface: r['interface'] ?? '',
      status: r['status'],
      address: r['address'],
      disabled: r['disabled'] === 'true' || r['disabled'] === true,
      addDefaultRoute: r['add-default-route'] === 'yes' || r['add-default-route'] === true,
      usePeerDns: r['use-peer-dns'] === 'yes' || r['use-peer-dns'] === true,
      comment: r['comment'],
    }));
  }

  async listDhcpServers(): Promise<RouterDhcpServerItem[]> {
    await this.connect();
    const items = await this.request<any[]>('/ip/dhcp-server');
    if (!Array.isArray(items)) return [];
    return items.map((r) => ({
      id: r['.id'],
      name: r['name'] ?? '',
      interface: r['interface'] ?? '',
      addressPool: r['address-pool'],
      disabled: r['disabled'] === 'true' || r['disabled'] === true,
      comment: r['comment'],
    }));
  }

  async listDhcpLeases(): Promise<RouterDhcpLeaseItem[]> {
    await this.connect();
    const items = await this.request<any[]>('/ip/dhcp-server/lease');
    if (!Array.isArray(items)) return [];
    return items.map((r) => ({
      id: r['.id'],
      address: r['active-address'] || r['address'] || '',
      macAddress: r['active-mac-address'] || r['mac-address'] || '',
      hostName: r['host-name'],
      server: r['server'],
      status: r['status'],
      expiresAfter: r['expires-after'],
      lastSeen: r['last-seen'],
      activeAddress: r['active-address'],
      activeMacAddress: r['active-mac-address'],
      comment: r['comment'],
      disabled: r['disabled'] === 'true' || r['disabled'] === true,
      dynamic: r['dynamic'] === 'true' || r['dynamic'] === true,
    }));
  }

  async listArpTable(): Promise<RouterArpItem[]> {
    await this.connect();
    const items = await this.request<any[]>('/ip/arp');
    if (!Array.isArray(items)) return [];
    return items.map((r) => ({
      id: r['.id'],
      address: r['address'] ?? '',
      macAddress: r['mac-address'] ?? '',
      interface: r['interface'],
      complete: r['complete'] === 'true' || r['complete'] === true,
      disabled: r['disabled'] === 'true' || r['disabled'] === true,
      dynamic: r['dynamic'] === 'true' || r['dynamic'] === true,
      comment: r['comment'],
    }));
  }

  async listNeighbors(): Promise<RouterNeighborItem[]> {
    await this.connect();
    const items = await this.request<any[]>('/ip/neighbor');
    if (!Array.isArray(items)) return [];
    return items.map((r) => ({
      id: r['.id'],
      interface: r['interface'],
      address: r['address4'] || r['address'],
      macAddress: r['mac-address'],
      identity: r['identity'],
      platform: r['platform'],
      version: r['version'],
      board: r['board'],
      uptime: r['uptime'],
      age: r['age'],
    }));
  }

  async listNatRules(): Promise<RouterNatRuleItem[]> {
    await this.connect();
    const items = await this.request<any[]>('/ip/firewall/nat');
    if (!Array.isArray(items)) return [];
    return items.map((r) => ({
      id: r['.id'],
      chain: r['chain'] ?? '',
      action: r['action'] ?? '',
      outInterface: r['out-interface'],
      disabled: r['disabled'] === 'true' || r['disabled'] === true,
      comment: r['comment'],
    }));
  }

  async listMangleRules(): Promise<Array<{ id?: string; chain?: string; action?: string; comment?: string; disabled?: boolean }>> {
    await this.connect();
    const items = await this.request<any[]>('/ip/firewall/mangle');
    if (!Array.isArray(items)) return [];
    return items.map((r) => ({
      id: r['.id'],
      chain: r['chain'] ?? '',
      action: r['action'] ?? '',
      comment: r['comment'],
      disabled: r['disabled'] === 'true' || r['disabled'] === true,
    }));
  }

  async listFilterRules(): Promise<Array<{ id?: string; chain?: string; action?: string; comment?: string; disabled?: boolean }>> {
    await this.connect();
    const items = await this.request<any[]>('/ip/firewall/filter');
    if (!Array.isArray(items)) return [];
    return items.map((r) => ({
      id: r['.id'],
      chain: r['chain'] ?? '',
      action: r['action'] ?? '',
      comment: r['comment'],
      disabled: r['disabled'] === 'true' || r['disabled'] === true,
    }));
  }

  async listRoutes(): Promise<RouterRouteItem[]> {
    await this.connect();
    const items = await this.request<any[]>('/ip/route');
    if (!Array.isArray(items)) return [];
    return items.map((r) => ({
      id: r['.id'],
      dstAddress: r['dst-address'] ?? '',
      gateway: r['gateway'],
      active: r['active'] === 'true' || r['active'] === true,
      disabled: r['disabled'] === 'true' || r['disabled'] === true,
      comment: r['comment'],
    }));
  }

  async listHotspotServers(): Promise<RouterHotspotServerItem[]> {
    await this.connect();
    const items = await this.request<any[]>('/ip/hotspot');
    if (!Array.isArray(items)) return [];
    return items.map((r) => ({
      id: r['.id'],
      name: r['name'] ?? '',
      interface: r['interface'] ?? '',
      profile: r['profile'],
      addressPool: r['address-pool'],
      disabled: r['disabled'] === 'true' || r['disabled'] === true,
      invalid: r['invalid'] === 'true' || r['invalid'] === true,
      comment: r['comment'],
    }));
  }

  async pingHost(host: string, count = 3): Promise<RouterPingResult> {
    await this.connect();
    try {
      const res = await this.request<any>('/ping', {
        method: 'POST',
        body: JSON.stringify({ address: host, count }),
      });
      const results = Array.isArray(res) ? res : [res];
      const received = results.filter((r) => {
        const rec = parseInt(r?.['received'] ?? '0', 10);
        return rec > 0 || r?.['status'] === undefined;
      }).length;
      const loss = count > 0 ? Math.round(((count - received) / count) * 100) : 100;
      return {
        host,
        packetsSent: count,
        packetsReceived: received,
        packetLossPercent: loss,
        isReachable: received > 0,
      };
    } catch {
      return {
        host,
        packetsSent: count,
        packetsReceived: 0,
        packetLossPercent: 100,
        isReachable: false,
      };
    }
  }

  async runRawCommand(words: string[]): Promise<any> {
    await this.connect();
    // Maps raw words into REST path & payload
    const rawCmd = words[0];
    let path = rawCmd.startsWith('/') ? rawCmd : `/${rawCmd}`;
    let method: 'PUT' | 'POST' | 'PATCH' = 'PUT';

    if (path.endsWith('/add')) {
      path = path.slice(0, -4);
      method = 'PUT';
    } else if (path.endsWith('/set')) {
      method = 'POST';
    }

    const payload: Record<string, any> = {};
    for (let i = 1; i < words.length; i++) {
      const w = words[i];
      if (w.startsWith('=')) {
        const parts = w.substring(1).split('=');
        const k = parts[0];
        const v = parts.slice(1).join('=');
        payload[k] = v;
      }
    }
    return this.request(path, {
      method,
      body: JSON.stringify(payload),
    });
  }
}

