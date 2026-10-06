import * as net from 'net';
import * as tls from 'tls';
import * as crypto from 'crypto';
import { RouterOsSocketProtocol } from '../protocols/routeros-socket-protocol';
import type {
  IMikrotikClient,
  RouterResource,
  HotspotProfileItem,
  HotspotUserItem,
  HotspotActiveSessionItem,
} from '../interfaces/mikrotik-client.interface';

export interface RouterOsApiConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  useSsl?: boolean;
  timeoutMs?: number;
}

interface CommandResponse {
  type: '!re' | '!done' | '!trap' | '!fatal';
  attributes: Record<string, string>;
}

export class RouterOsApiClient implements IMikrotikClient {
  private socket: net.Socket | tls.TLSSocket | null = null;
  private buffer = Buffer.alloc(0);
  private currentSentence: string[] = [];
  private pendingResolver: ((responses: CommandResponse[]) => void) | null = null;
  private pendingRejecter: ((error: Error) => void) | null = null;
  private currentResponses: CommandResponse[] = [];
  private connected = false;

  constructor(private readonly config: RouterOsApiConfig) {}

  isConnected(): boolean {
    return this.connected && this.socket !== null && !this.socket.destroyed;
  }

  async connect(): Promise<void> {
    if (this.isConnected()) return;

    const timeout = this.config.timeoutMs ?? 10000;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.disconnect();
        reject(
          new Error(
            `Connection to MikroTik (${this.config.host}:${this.config.port}) timed out after ${timeout}ms`,
          ),
        );
      }, timeout);

      const onConnect = async (): Promise<void> => {
        clearTimeout(timer);
        try {
          await this.performLogin();
          this.connected = true;
          resolve();
        } catch (err) {
          this.disconnect();
          reject(err);
        }
      };

      const onError = (err: Error): void => {
        clearTimeout(timer);
        this.disconnect();
        reject(
          new Error(
            `Failed to connect to MikroTik (${this.config.host}:${this.config.port}): ${err.message}`,
          ),
        );
      };

      if (this.config.useSsl) {
        this.socket = tls.connect(
          {
            host: this.config.host,
            port: this.config.port,
            rejectUnauthorized: false, // Self-signed certs common on routers
          },
          onConnect,
        );
      } else {
        this.socket = net.createConnection(
          {
            host: this.config.host,
            port: this.config.port,
          },
          onConnect,
        );
      }

      this.socket.on('data', (data: Buffer) => this.onData(data));
      this.socket.on('error', onError);
      this.socket.on('close', () => {
        this.connected = false;
      });
    });
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }
    this.buffer = Buffer.alloc(0);
    this.currentSentence = [];
    if (this.pendingRejecter) {
      this.pendingRejecter(new Error('Connection closed'));
      this.pendingResolver = null;
      this.pendingRejecter = null;
    }
  }

  private async performLogin(): Promise<void> {
    const password = this.config.password ?? '';

    // Step 1: Initial login command
    const step1 = await this.executeCommand([
      '/login',
      `=name=${this.config.username}`,
      `=password=${password}`,
    ]);

    // Check if challenge is requested (ROS < 6.43)
    const doneResponse = step1.find((r) => r.type === '!done');
    if (doneResponse && doneResponse.attributes['ret']) {
      const challengeHex = doneResponse.attributes['ret'];
      const challengeBuffer = Buffer.from(challengeHex, 'hex');

      // MD5: 0x00 + password + challenge
      const md5 = crypto.createHash('md5');
      md5.update(Buffer.from([0x00]));
      md5.update(Buffer.from(password, 'utf8'));
      md5.update(challengeBuffer);
      const responseHex = '00' + md5.digest('hex');

      await this.executeCommand([
        '/login',
        `=name=${this.config.username}`,
        `=response=${responseHex}`,
      ]);
    }
  }

  private onData(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data]);

    while (this.buffer.length > 0) {
      const decoded = RouterOsSocketProtocol.decodeLength(this.buffer, 0);
      if (!decoded) break;

      const [length, lengthBytes] = decoded;
      const totalWordBytes = lengthBytes + length;

      if (this.buffer.length < totalWordBytes) break;

      const word = this.buffer.subarray(lengthBytes, totalWordBytes).toString('utf8');
      this.buffer = this.buffer.subarray(totalWordBytes);

      if (word.length === 0) {
        // Sentence complete
        this.onSentenceComplete(this.currentSentence);
        this.currentSentence = [];
      } else {
        this.currentSentence.push(word);
      }
    }
  }

  private onSentenceComplete(words: string[]): void {
    if (words.length === 0) return;

    const type = words[0] as CommandResponse['type'];
    const attributes: Record<string, string> = {};

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      if (word.startsWith('=')) {
        const eqIdx = word.indexOf('=', 1);
        if (eqIdx !== -1) {
          const key = word.substring(1, eqIdx);
          const val = word.substring(eqIdx + 1);
          attributes[key] = val;
        }
      }
    }

    const response: CommandResponse = { type, attributes };
    this.currentResponses.push(response);

    if (type === '!done') {
      if (this.pendingResolver) {
        const res = this.currentResponses;
        this.currentResponses = [];
        const resolver = this.pendingResolver;
        this.pendingResolver = null;
        this.pendingRejecter = null;
        resolver(res);
      }
    } else if (type === '!trap' || type === '!fatal') {
      const errorMsg = attributes['message'] ?? 'RouterOS command failed';
      if (this.pendingRejecter) {
        this.currentResponses = [];
        const rejecter = this.pendingRejecter;
        this.pendingResolver = null;
        this.pendingRejecter = null;
        rejecter(new Error(errorMsg));
      }
    }
  }

  private async executeCommand(words: string[]): Promise<CommandResponse[]> {
    if (!this.socket) {
      throw new Error('Socket not initialized');
    }

    return new Promise<CommandResponse[]>((resolve, reject) => {
      this.pendingResolver = resolve;
      this.pendingRejecter = reject;
      this.currentResponses = [];

      const encoded = RouterOsSocketProtocol.encodeSentence(words);
      this.socket!.write(encoded);
    });
  }

  // ===========================================================================
  // IMikrotikClient Implementation
  // ===========================================================================

  async ping(): Promise<boolean> {
    try {
      await this.connect();
      const res = await this.executeCommand(['/system/resource/print']);
      return res.some((r) => r.type === '!re' || r.type === '!done');
    } catch {
      return false;
    }
  }

  async getSystemResource(): Promise<RouterResource> {
    await this.connect();
    const responses = await this.executeCommand(['/system/resource/print']);
    const record = responses.find((r) => r.type === '!re')?.attributes ?? {};

    return {
      uptime: record['uptime'] ?? '0s',
      version: record['version'] ?? 'unknown',
      cpuLoad: parseInt(record['cpu-load'] ?? '0', 10),
      freeMemory: parseInt(record['free-memory'] ?? '0', 10),
      totalMemory: parseInt(record['total-memory'] ?? '0', 10),
      freeHdd: parseInt(record['free-hdd-space'] ?? '0', 10),
      totalHdd: parseInt(record['total-hdd-space'] ?? '0', 10),
      boardName: record['board-name'],
      architecture: record['architecture-name'],
    };
  }

  async listHotspotProfiles(): Promise<HotspotProfileItem[]> {
    await this.connect();
    const responses = await this.executeCommand(['/ip/hotspot/user/profile/print']);
    return responses
      .filter((r) => r.type === '!re')
      .map((r) => ({
        id: r.attributes['.id'],
        name: r.attributes['name'] ?? '',
        rateLimit: r.attributes['rate-limit'],
        sessionTimeout: r.attributes['session-timeout'],
        idleTimeout: r.attributes['idle-timeout'],
        keepaliveTimeout: r.attributes['keepalive-timeout'],
        sharedUsers: r.attributes['shared-users'] ? parseInt(r.attributes['shared-users'], 10) : 1,
        addressPool: r.attributes['address-pool'],
      }));
  }

  async createHotspotProfile(profile: HotspotProfileItem): Promise<string> {
    await this.connect();
    const words = ['/ip/hotspot/user/profile/add', `=name=${profile.name}`];
    if (profile.rateLimit) words.push(`=rate-limit=${profile.rateLimit}`);
    if (profile.sessionTimeout) words.push(`=session-timeout=${profile.sessionTimeout}`);
    if (profile.idleTimeout) words.push(`=idle-timeout=${profile.idleTimeout}`);
    if (profile.sharedUsers !== undefined) words.push(`=shared-users=${profile.sharedUsers}`);

    const res = await this.executeCommand(words);
    const done = res.find((r) => r.type === '!done');
    return done?.attributes['ret'] ?? profile.name;
  }

  async updateHotspotProfile(name: string, profile: Partial<HotspotProfileItem>): Promise<void> {
    await this.connect();
    // Find profile ID by name
    const profiles = await this.listHotspotProfiles();
    const target = profiles.find((p) => p.name === name);
    if (!target?.id) throw new Error(`Profile '${name}' not found on router`);

    const words = ['/ip/hotspot/user/profile/set', `numbers=${target.id}`];
    if (profile.rateLimit !== undefined) words.push(`=rate-limit=${profile.rateLimit}`);
    if (profile.sessionTimeout !== undefined)
      words.push(`=session-timeout=${profile.sessionTimeout}`);
    if (profile.sharedUsers !== undefined) words.push(`=shared-users=${profile.sharedUsers}`);

    await this.executeCommand(words);
  }

  async deleteHotspotProfile(name: string): Promise<void> {
    await this.connect();
    const profiles = await this.listHotspotProfiles();
    const target = profiles.find((p) => p.name === name);
    if (!target?.id) return;

    await this.executeCommand(['/ip/hotspot/user/profile/remove', `numbers=${target.id}`]);
  }

  async listHotspotUsers(): Promise<HotspotUserItem[]> {
    await this.connect();
    const responses = await this.executeCommand(['/ip/hotspot/user/print']);
    return responses
      .filter((r) => r.type === '!re')
      .map((r) => ({
        id: r.attributes['.id'],
        name: r.attributes['name'] ?? '',
        profile: r.attributes['profile'],
        limitUptime: r.attributes['limit-uptime'],
        limitBytesTotal: r.attributes['limit-bytes-total']
          ? parseInt(r.attributes['limit-bytes-total'], 10)
          : undefined,
        comment: r.attributes['comment'],
        disabled: r.attributes['disabled'] === 'true',
      }));
  }

  async createHotspotUser(user: HotspotUserItem): Promise<string> {
    await this.connect();
    const words = ['/ip/hotspot/user/add', `=name=${user.name}`];
    if (user.password) words.push(`=password=${user.password}`);
    if (user.profile) words.push(`=profile=${user.profile}`);
    if (user.limitUptime) words.push(`=limit-uptime=${user.limitUptime}`);
    if (user.limitBytesTotal !== undefined)
      words.push(`=limit-bytes-total=${user.limitBytesTotal}`);
    if (user.comment) words.push(`=comment=${user.comment}`);

    const res = await this.executeCommand(words);
    const done = res.find((r) => r.type === '!done');
    return done?.attributes['ret'] ?? user.name;
  }

  async updateHotspotUser(name: string, user: Partial<HotspotUserItem>): Promise<void> {
    await this.connect();
    const users = await this.listHotspotUsers();
    const target = users.find((u) => u.name === name);
    if (!target?.id) throw new Error(`Hotspot user '${name}' not found on router`);

    const words = ['/ip/hotspot/user/set', `numbers=${target.id}`];
    if (user.profile) words.push(`=profile=${user.profile}`);
    if (user.limitUptime) words.push(`=limit-uptime=${user.limitUptime}`);
    if (user.comment) words.push(`=comment=${user.comment}`);

    await this.executeCommand(words);
  }

  async disableHotspotUser(name: string): Promise<void> {
    await this.connect();
    const users = await this.listHotspotUsers();
    const target = users.find((u) => u.name === name);
    if (target?.id) {
      await this.executeCommand(['/ip/hotspot/user/set', `numbers=${target.id}`, '=disabled=yes']);
    }
  }

  async enableHotspotUser(name: string): Promise<void> {
    await this.connect();
    const users = await this.listHotspotUsers();
    const target = users.find((u) => u.name === name);
    if (target?.id) {
      await this.executeCommand(['/ip/hotspot/user/set', `numbers=${target.id}`, '=disabled=no']);
    }
  }

  async deleteHotspotUser(name: string): Promise<void> {
    await this.connect();
    const users = await this.listHotspotUsers();
    const target = users.find((u) => u.name === name);
    if (target?.id) {
      await this.executeCommand(['/ip/hotspot/user/remove', `numbers=${target.id}`]);
    }
  }

  async listActiveSessions(): Promise<HotspotActiveSessionItem[]> {
    await this.connect();
    const responses = await this.executeCommand(['/ip/hotspot/active/print']);
    return responses
      .filter((r) => r.type === '!re')
      .map((r) => ({
        id: r.attributes['.id'] ?? '',
        user: r.attributes['user'] ?? '',
        address: r.attributes['address'] ?? '',
        macAddress: r.attributes['mac-address'] ?? '',
        uptime: r.attributes['uptime'] ?? '0s',
        bytesIn: parseInt(r.attributes['bytes-in'] ?? '0', 10),
        bytesOut: parseInt(r.attributes['bytes-out'] ?? '0', 10),
        sessionId: r.attributes['session-id'],
      }));
  }

  async removeActiveSession(sessionOrUserId: string): Promise<void> {
    await this.connect();
    await this.executeCommand(['/ip/hotspot/active/remove', `numbers=${sessionOrUserId}`]);
  }

  async reboot(): Promise<void> {
    await this.connect();
    await this.executeCommand(['/system/reboot']);
  }
}
