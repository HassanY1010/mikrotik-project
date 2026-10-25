import * as net from 'net';
import * as tls from 'tls';
import * as crypto from 'crypto';
import * as fs from 'fs';
import { IRouterWorker } from './interfaces/router-worker.interface';
import { RouterOsSocketProtocol } from './protocols/routeros-socket-protocol';
import {
  RouterConfig,
  RouterHealthResult,
  HotspotBatchAddUser,
  HotspotBatchAddResult,
  HotspotUserRemoveResult,
  HotspotVerifyBatchResult,
  HotspotSessionListResult,
  HotspotActiveSession,
  PppoeProfileSyncPayload,
  PppoeProfileSyncResult,
  PppoeSecretAddPayload,
  PppoeSecretAddResult,
  PppoeSecretUpdatePayload,
  PppoeSecretUpdateResult,
  PppoeSecretStatusPayload,
  PppoeSecretStatusResult,
  PppoeSecretRemovePayload,
  PppoeSecretRemoveResult,
  PppoeSessionListResult,
  PppoeSessionDisconnectPayload,
  PppoeSessionDisconnectResult,
  PppoeActiveSession,
  HotspotPortalPublishPayload,
  HotspotPortalPublishResult,
} from '../types';

interface CommandResponse {
  type: '!re' | '!done' | '!trap' | '!fatal';
  attributes: Record<string, string>;
}

export class RouterOsWorker implements IRouterWorker {
  private socket: net.Socket | tls.TLSSocket | null = null;
  private buffer = Buffer.alloc(0);
  private currentSentence: string[] = [];
  private pendingResolver: ((responses: CommandResponse[]) => void) | null = null;
  private pendingRejecter: ((error: Error) => void) | null = null;
  private currentResponses: CommandResponse[] = [];
  private connected = false;

  constructor(private readonly config: RouterConfig) {}

  isConnected(): boolean {
    return this.connected && this.socket !== null && !this.socket.destroyed;
  }

  async connect(): Promise<void> {
    if (this.isConnected()) return;

    const timeout = this.config.timeoutMs ?? 10000;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.disconnect();
        reject(new Error(`RouterOS connection to ${this.config.host}:${this.config.port} timed out after ${timeout}ms`));
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

      try {
        if (this.config.useSsl) {
          const tlsOptions: tls.ConnectionOptions = {
            host: this.config.host,
            port: this.config.port,
            rejectUnauthorized: this.config.rejectUnauthorized !== false,
          };

          if (this.config.caCertPath && fs.existsSync(this.config.caCertPath)) {
            tlsOptions.ca = fs.readFileSync(this.config.caCertPath);
          }

          if (this.config.rejectUnauthorized === false) {
            console.warn(
              '[RouterOsWorker] WARNING: TLS certificate verification is explicitly disabled. Insecure for untrusted networks.',
            );
          }

          this.socket = tls.connect(tlsOptions, onConnect);
        } else {
          this.socket = net.createConnection(
            {
              host: this.config.host,
              port: this.config.port,
            },
            onConnect,
          );
        }

        this.socket.on('data', (chunk: Buffer) => this.handleData(chunk));
        this.socket.on('error', (err: Error) => {
          this.connected = false;
          if (this.pendingRejecter) {
            this.pendingRejecter(err);
            this.pendingResolver = null;
            this.pendingRejecter = null;
          }
        });
        this.socket.on('close', () => {
          this.connected = false;
        });
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  private handleData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length > 0) {
      const res = RouterOsSocketProtocol.decodeLength(this.buffer, 0);
      if (!res) break;

      const [wordLen, prefixLen] = res;
      const totalLen = prefixLen + wordLen;

      if (this.buffer.length < totalLen) break;

      const wordBuffer = this.buffer.subarray(prefixLen, totalLen);
      const word = wordBuffer.toString('utf8');
      this.buffer = this.buffer.subarray(totalLen);

      if (word.length === 0) {
        // End of sentence
        this.handleSentence(this.currentSentence);
        this.currentSentence = [];
      } else {
        this.currentSentence.push(word);
      }
    }
  }

  private handleSentence(sentence: string[]): void {
    if (sentence.length === 0) return;

    const sentenceType = sentence[0] as '!re' | '!done' | '!trap' | '!fatal';
    const attributes: Record<string, string> = {};

    for (let i = 1; i < sentence.length; i++) {
      const w = sentence[i];
      if (w.startsWith('=')) {
        const eqIdx = w.indexOf('=', 1);
        if (eqIdx !== -1) {
          const key = w.substring(1, eqIdx);
          const val = w.substring(eqIdx + 1);
          attributes[key] = val;
        } else {
          attributes[w.substring(1)] = '';
        }
      }
    }

    const response: CommandResponse = { type: sentenceType, attributes };
    this.currentResponses.push(response);

    if (sentenceType === '!done' || sentenceType === '!fatal') {
      const responses = [...this.currentResponses];
      this.currentResponses = [];

      if (this.pendingResolver) {
        const resolve = this.pendingResolver;
        this.pendingResolver = null;
        this.pendingRejecter = null;
        resolve(responses);
      }
    }
  }

  private async executeCommand(words: (string | Buffer)[]): Promise<CommandResponse[]> {
    if (!this.isConnected()) {
      await this.connect();
    }

    const commandTimeoutMs = this.config.timeoutMs ?? 15000;

    return new Promise<CommandResponse[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingResolver = null;
        this.pendingRejecter = null;
        this.disconnect();
        reject(new Error(`RouterOS command timed out after ${commandTimeoutMs}ms`));
      }, commandTimeoutMs);

      this.pendingResolver = (responses) => {
        clearTimeout(timer);
        resolve(responses);
      };
      this.pendingRejecter = (error) => {
        clearTimeout(timer);
        reject(error);
      };
      this.currentResponses = [];

      const encoded = RouterOsSocketProtocol.encodeSentence(words);
      this.socket?.write(encoded);
    });
  }

  private async performLogin(): Promise<void> {
    const password = this.config.password ?? '';

    // Step 1: Post-6.43 plain login attempt
    const res = await this.executeCommand([
      '/login',
      `=name=${this.config.username}`,
      `=password=${password}`,
    ]);

    const last = res[res.length - 1];
    if (last && last.type === '!done' && !last.attributes['ret']) {
      return; // Login successful
    }

    // Step 2: Challenge-response legacy authentication if challenge returned
    const challenge = last?.attributes['ret'];
    if (challenge) {
      const md5 = crypto.createHash('md5');
      md5.update(Buffer.from([0]));
      md5.update(password, 'utf8');
      md5.update(Buffer.from(challenge, 'hex'));
      const responseHex = md5.digest('hex');

      const legacyRes = await this.executeCommand([
        '/login',
        `=name=${this.config.username}`,
        `=response=00${responseHex}`,
      ]);

      const legacyLast = legacyRes[legacyRes.length - 1];
      if (legacyLast && legacyLast.type === '!done') {
        return;
      }
    }

    throw new Error('RouterOS authentication failed: Invalid username or password');
  }

  async ping(): Promise<boolean> {
    try {
      if (!this.isConnected()) {
        await this.connect();
      }
      const responses = await this.executeCommand(['/system/identity/print']);
      return responses.some((r) => r.type === '!done');
    } catch {
      return false;
    }
  }

  async getHealth(): Promise<RouterHealthResult> {
    const responses = await this.executeCommand(['/system/resource/print']);
    const record = responses.find((r) => r.type === '!re')?.attributes ?? {};

    return {
      uptime: record['uptime'] ?? '0s',
      version: record['version'] ?? 'unknown',
      cpuLoad: parseInt(record['cpu-load'] ?? '0', 10),
      memoryFree: parseInt(record['free-memory'] ?? '0', 10),
      memoryTotal: parseInt(record['total-memory'] ?? '0', 10),
      hddFree: parseInt(record['free-hdd-space'] ?? '0', 10),
      hddTotal: parseInt(record['total-hdd-space'] ?? '0', 10),
      boardName: record['board-name'],
      architecture: record['architecture-name'],
    };
  }

  async batchAddHotspotUsers(users: HotspotBatchAddUser[]): Promise<HotspotBatchAddResult> {
    let createdCount = 0;
    let alreadyExistingCount = 0;
    let failedCount = 0;
    const errors: Array<{ name: string; error: string }> = [];

    for (const u of users) {
      try {
        const words = ['/ip/hotspot/user/add', `=name=${u.name}`];
        if (u.password) words.push(`=password=${u.password}`);
        if (u.profile) words.push(`=profile=${u.profile}`);
        if (u.limitUptime) words.push(`=limit-uptime=${u.limitUptime}`);
        if (u.limitBytesTotal) words.push(`=limit-bytes-total=${u.limitBytesTotal}`);
        if (u.comment) words.push(`=comment=${u.comment}`);

        const res = await this.executeCommand(words);
        const trap = res.find((r) => r.type === '!trap');

        if (trap) {
          const msg = trap.attributes['message'] ?? '';
          if (msg.includes('already have user with this name')) {
            // Detailed Reconciliation: verify attributes of pre-existing user before assuming it matches
            const findRes = await this.executeCommand(['/ip/hotspot/user/print', `?name=${u.name}`]);
            const existingUser = findRes.find((r) => r.type === '!re')?.attributes;

            if (existingUser) {
              const existingProfile = existingUser['profile'] ?? 'default';
              const targetProfile = u.profile ?? 'default';
              const existingComment = existingUser['comment'] ?? '';
              const targetComment = u.comment ?? '';

              // Match profile and comment
              const profileMatches = existingProfile === targetProfile;
              const commentMatches = !u.comment || existingComment === targetComment;

              if (profileMatches && commentMatches) {
                // Idempotent reconciliation: exact same card already present from prior attempt
                alreadyExistingCount++;
              } else {
                // Name collision with a DIFFERENT pre-existing user! Do NOT overwrite!
                failedCount++;
                errors.push({
                  name: u.name,
                  error: `Conflict: Pre-existing user has mismatched attributes (profile: "${existingProfile}", comment: "${existingComment}"). Creation aborted to prevent data corruption.`,
                });
              }
            } else {
              failedCount++;
              errors.push({ name: u.name, error: 'User exists but could not be inspected' });
            }
          } else {
            failedCount++;
            errors.push({ name: u.name, error: msg });
          }
        } else {
          createdCount++;
        }
      } catch (err: any) {
        failedCount++;
        errors.push({ name: u.name, error: err.message });
      }
    }

    return {
      total: users.length,
      createdCount,
      alreadyExistingCount,
      failedCount,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async removeHotspotUsers(names: string[]): Promise<HotspotUserRemoveResult> {
    let removedCount = 0;
    let notFoundCount = 0;
    let failedCount = 0;

    for (const name of names) {
      try {
        // Find user by name
        const findRes = await this.executeCommand(['/ip/hotspot/user/print', `?name=${name}`]);
        const userItem = findRes.find((r) => r.type === '!re');

        if (!userItem || !userItem.attributes['.id']) {
          notFoundCount++;
          continue;
        }

        const id = userItem.attributes['.id'];
        const remRes = await this.executeCommand(['/ip/hotspot/user/remove', `=.id=${id}`]);
        const trap = remRes.find((r) => r.type === '!trap');

        if (trap) {
          failedCount++;
        } else {
          removedCount++;
        }
      } catch {
        failedCount++;
      }
    }

    return {
      total: names.length,
      removedCount,
      notFoundCount,
      failedCount,
    };
  }

  async verifyHotspotUsers(names: string[]): Promise<HotspotVerifyBatchResult> {
    const existingUsers: string[] = [];
    const missingUsers: string[] = [];

    // Fetch all users to minimize round-trips
    const res = await this.executeCommand(['/ip/hotspot/user/print', '=.proplist=name']);
    const existingSet = new Set(
      res.filter((r) => r.type === '!re' && r.attributes['name']).map((r) => r.attributes['name']),
    );

    for (const name of names) {
      if (existingSet.has(name)) {
        existingUsers.push(name);
      } else {
        missingUsers.push(name);
      }
    }

    return {
      existingUsers,
      missingUsers,
    };
  }

  async listActiveSessions(): Promise<HotspotSessionListResult> {
    const res = await this.executeCommand(['/ip/hotspot/active/print']);
    const sessions: HotspotActiveSession[] = res
      .filter((r) => r.type === '!re')
      .map((r) => ({
        id: r.attributes['.id'] ?? '',
        user: r.attributes['user'] ?? '',
        address: r.attributes['address'] ?? '',
        macAddress: r.attributes['mac-address'] ?? '',
        uptime: r.attributes['uptime'] ?? '',
        bytesIn: parseInt(r.attributes['bytes-in'] ?? '0', 10),
        bytesOut: parseInt(r.attributes['bytes-out'] ?? '0', 10),
        sessionId: r.attributes['session-id'],
        server: r.attributes['server'],
        loginBy: r.attributes['login-by'],
        sessionTimeLeft: r.attributes['session-time-left'],
        idleTime: r.attributes['idle-time'],
        limitBytesTotal: r.attributes['limit-bytes-total']
          ? parseInt(r.attributes['limit-bytes-total'], 10)
          : undefined,
      }));

    return {
      total: sessions.length,
      sessions,
    };
  }

  // =========================================================================
  // PPPoE / Broadband Implementation Methods
  // =========================================================================

  async syncPppoeProfile(payload: PppoeProfileSyncPayload): Promise<PppoeProfileSyncResult> {
    if (!payload.name || payload.name.trim() === '') {
      throw new Error('Profile name is required');
    }

    const findRes = await this.executeCommand(['/ppp/profile/print', `?name=${payload.name}`]);
    const existing = findRes.find((r) => r.type === '!re');

    if (existing && existing.attributes['.id']) {
      const words = ['/ppp/profile/set', `=.id=${existing.attributes['.id']}`];
      if (payload.rateLimit) words.push(`=rate-limit=${payload.rateLimit}`);
      if (payload.localAddress) words.push(`=local-address=${payload.localAddress}`);
      if (payload.remoteAddress) words.push(`=remote-address=${payload.remoteAddress}`);
      if (payload.dnsServers) words.push(`=dns-server=${payload.dnsServers}`);
      if (payload.onlyOne !== undefined) words.push(`=only-one=${payload.onlyOne ? 'yes' : 'no'}`);

      const setRes = await this.executeCommand(words);
      const trap = setRes.find((r) => r.type === '!trap');
      if (trap) {
        throw new Error(`Failed to update PPP profile "${payload.name}": ${trap.attributes['message'] ?? 'unknown error'}`);
      }

      return {
        name: payload.name,
        action: 'UPDATED',
        rateLimit: payload.rateLimit,
      };
    } else {
      const words = ['/ppp/profile/add', `=name=${payload.name}`];
      if (payload.rateLimit) words.push(`=rate-limit=${payload.rateLimit}`);
      if (payload.localAddress) words.push(`=local-address=${payload.localAddress}`);
      if (payload.remoteAddress) words.push(`=remote-address=${payload.remoteAddress}`);
      if (payload.dnsServers) words.push(`=dns-server=${payload.dnsServers}`);
      if (payload.onlyOne !== undefined) words.push(`=only-one=${payload.onlyOne ? 'yes' : 'no'}`);

      const addRes = await this.executeCommand(words);
      const trap = addRes.find((r) => r.type === '!trap');
      if (trap) {
        throw new Error(`Failed to create PPP profile "${payload.name}": ${trap.attributes['message'] ?? 'unknown error'}`);
      }

      return {
        name: payload.name,
        action: 'CREATED',
        rateLimit: payload.rateLimit,
      };
    }
  }

  async addPppoeSecret(payload: PppoeSecretAddPayload): Promise<PppoeSecretAddResult> {
    if (!payload.username || payload.username.trim() === '') {
      throw new Error('Username is required for PPPoE secret');
    }
    if (!payload.profile || payload.profile.trim() === '') {
      throw new Error('Profile is required for PPPoE secret');
    }

    // 1. Reconciliation & Conflict Check
    const findRes = await this.executeCommand(['/ppp/secret/print', `?name=${payload.username}`]);
    const existing = findRes.find((r) => r.type === '!re');

    if (existing && existing.attributes['.id']) {
      const existingProfile = existing.attributes['profile'] ?? 'default';
      const existingCaller = existing.attributes['caller-id'] ?? '';
      const targetCaller = payload.callerId ?? '';
      const existingRemote = existing.attributes['remote-address'] ?? '';
      const targetRemote = payload.remoteAddress ?? '';

      const profileMatches = existingProfile === payload.profile;
      const callerMatches = !payload.callerId || existingCaller === targetCaller;
      const remoteMatches = !payload.remoteAddress || existingRemote === targetRemote;

      if (profileMatches && callerMatches && remoteMatches) {
        return {
          username: payload.username,
          status: 'ALREADY_EXISTS',
          profile: payload.profile,
          reconciled: true,
        };
      } else {
        throw new Error(
          `Conflict: User "${payload.username}" already exists in /ppp/secret with mismatched profile ("${existingProfile}") or settings. Creation aborted to protect existing broadband subscriber.`,
        );
      }
    }

    // 2. Add secret
    const words = ['/ppp/secret/add', `=name=${payload.username}`, '=service=pppoe'];
    if (payload.password) words.push(`=password=${payload.password}`);
    if (payload.profile) words.push(`=profile=${payload.profile}`);
    if (payload.callerId) words.push(`=caller-id=${payload.callerId}`);
    if (payload.remoteAddress) words.push(`=remote-address=${payload.remoteAddress}`);
    if (payload.comment) words.push(`=comment=${payload.comment}`);
    if (payload.disabled !== undefined) words.push(`=disabled=${payload.disabled ? 'yes' : 'no'}`);

    const addRes = await this.executeCommand(words);
    const trap = addRes.find((r) => r.type === '!trap');
    if (trap) {
      const msg = trap.attributes['message'] ?? '';
      if (msg.includes('already have user with this name')) {
        return {
          username: payload.username,
          status: 'ALREADY_EXISTS',
          profile: payload.profile,
          reconciled: true,
        };
      }
      throw new Error(`Failed to create PPPoE secret: ${msg}`);
    }

    return {
      username: payload.username,
      status: 'CREATED',
      profile: payload.profile,
    };
  }

  async updatePppoeSecret(payload: PppoeSecretUpdatePayload): Promise<PppoeSecretUpdateResult> {
    if (!payload.username || payload.username.trim() === '') {
      throw new Error('Username is required');
    }

    const findRes = await this.executeCommand(['/ppp/secret/print', `?name=${payload.username}`]);
    const existing = findRes.find((r) => r.type === '!re');
    if (!existing || !existing.attributes['.id']) {
      throw new Error(`PPPoE secret "${payload.username}" was not found in /ppp/secret`);
    }

    const words = ['/ppp/secret/set', `=.id=${existing.attributes['.id']}`];
    const fieldsModified: string[] = [];

    if (payload.password !== undefined) {
      words.push(`=password=${payload.password}`);
      fieldsModified.push('password');
    }
    if (payload.profile !== undefined) {
      words.push(`=profile=${payload.profile}`);
      fieldsModified.push('profile');
    }
    if (payload.callerId !== undefined) {
      words.push(`=caller-id=${payload.callerId}`);
      fieldsModified.push('callerId');
    }
    if (payload.remoteAddress !== undefined) {
      words.push(`=remote-address=${payload.remoteAddress}`);
      fieldsModified.push('remoteAddress');
    }
    if (payload.comment !== undefined) {
      words.push(`=comment=${payload.comment}`);
      fieldsModified.push('comment');
    }
    if (payload.disabled !== undefined) {
      words.push(`=disabled=${payload.disabled ? 'yes' : 'no'}`);
      fieldsModified.push('disabled');
    }

    const setRes = await this.executeCommand(words);
    const trap = setRes.find((r) => r.type === '!trap');
    if (trap) {
      throw new Error(`Failed to update PPPoE secret "${payload.username}": ${trap.attributes['message'] ?? 'unknown error'}`);
    }

    return {
      username: payload.username,
      updated: true,
      fieldsModified,
    };
  }

  async disablePppoeSecret(payload: PppoeSecretStatusPayload): Promise<PppoeSecretStatusResult> {
    if (!payload.username || payload.username.trim() === '') {
      throw new Error('Username is required');
    }

    const findRes = await this.executeCommand(['/ppp/secret/print', `?name=${payload.username}`]);
    const existing = findRes.find((r) => r.type === '!re');
    if (!existing || !existing.attributes['.id']) {
      throw new Error(`PPPoE secret "${payload.username}" was not found in /ppp/secret`);
    }

    const setRes = await this.executeCommand(['/ppp/secret/set', `=.id=${existing.attributes['.id']}`, '=disabled=yes']);
    const trap = setRes.find((r) => r.type === '!trap');
    if (trap) {
      throw new Error(`Failed to disable PPPoE secret "${payload.username}": ${trap.attributes['message'] ?? 'unknown error'}`);
    }

    let activeDisconnected = false;
    if (payload.disconnectActive !== false) {
      const actRes = await this.executeCommand(['/ppp/active/print', `?name=${payload.username}`]);
      const activeItem = actRes.find((r) => r.type === '!re');
      if (activeItem && activeItem.attributes['.id']) {
        await this.executeCommand(['/ppp/active/remove', `=.id=${activeItem.attributes['.id']}`]);
        activeDisconnected = true;
      }
    }

    return {
      username: payload.username,
      disabled: true,
      activeDisconnected,
    };
  }

  async enablePppoeSecret(payload: PppoeSecretStatusPayload): Promise<PppoeSecretStatusResult> {
    if (!payload.username || payload.username.trim() === '') {
      throw new Error('Username is required');
    }

    const findRes = await this.executeCommand(['/ppp/secret/print', `?name=${payload.username}`]);
    const existing = findRes.find((r) => r.type === '!re');
    if (!existing || !existing.attributes['.id']) {
      throw new Error(`PPPoE secret "${payload.username}" was not found in /ppp/secret`);
    }

    const setRes = await this.executeCommand(['/ppp/secret/set', `=.id=${existing.attributes['.id']}`, '=disabled=no']);
    const trap = setRes.find((r) => r.type === '!trap');
    if (trap) {
      throw new Error(`Failed to enable PPPoE secret "${payload.username}": ${trap.attributes['message'] ?? 'unknown error'}`);
    }

    return {
      username: payload.username,
      disabled: false,
      activeDisconnected: false,
    };
  }

  async removePppoeSecret(payload: PppoeSecretRemovePayload): Promise<PppoeSecretRemoveResult> {
    if (!payload.username || payload.username.trim() === '') {
      throw new Error('Username is required');
    }

    const findRes = await this.executeCommand(['/ppp/secret/print', `?name=${payload.username}`]);
    const existing = findRes.find((r) => r.type === '!re');
    if (!existing || !existing.attributes['.id']) {
      throw new Error(`PPPoE secret "${payload.username}" was not found in /ppp/secret`);
    }

    let activeDisconnected = false;
    if (payload.disconnectActive !== false) {
      const actRes = await this.executeCommand(['/ppp/active/print', `?name=${payload.username}`]);
      const activeItem = actRes.find((r) => r.type === '!re');
      if (activeItem && activeItem.attributes['.id']) {
        await this.executeCommand(['/ppp/active/remove', `=.id=${activeItem.attributes['.id']}`]);
        activeDisconnected = true;
      }
    }

    const remRes = await this.executeCommand(['/ppp/secret/remove', `=.id=${existing.attributes['.id']}`]);
    const trap = remRes.find((r) => r.type === '!trap');
    if (trap) {
      throw new Error(`Failed to remove PPPoE secret "${payload.username}": ${trap.attributes['message'] ?? 'unknown error'}`);
    }

    return {
      username: payload.username,
      removed: true,
      activeDisconnected,
    };
  }

  async listPppoeActiveSessions(): Promise<PppoeSessionListResult> {
    const res = await this.executeCommand(['/ppp/active/print']);
    const sessions: PppoeActiveSession[] = res
      .filter((r) => r.type === '!re')
      .map((r) => ({
        id: r.attributes['.id'] ?? '',
        username: r.attributes['name'] ?? '',
        service: r.attributes['service'] ?? 'pppoe',
        callerId: r.attributes['caller-id'],
        address: r.attributes['address'] ?? '',
        uptime: r.attributes['uptime'] ?? '',
        encoding: r.attributes['encoding'],
        sessionId: r.attributes['session-id'],
      }));

    return {
      total: sessions.length,
      sessions,
    };
  }

  async disconnectPppoeSession(payload: PppoeSessionDisconnectPayload): Promise<PppoeSessionDisconnectResult> {
    if (!payload.username && !payload.sessionId) {
      throw new Error('Either username or sessionId is required to disconnect a PPPoE session');
    }

    const words = ['/ppp/active/print'];
    if (payload.sessionId) {
      words.push(`?session-id=${payload.sessionId}`);
    } else if (payload.username) {
      words.push(`?name=${payload.username}`);
    }

    const res = await this.executeCommand(words);
    const items = res.filter((r) => r.type === '!re' && r.attributes['.id']);

    if (items.length === 0) {
      return {
        disconnected: false,
        matchedCount: 0,
        message: 'Session is no longer active on router',
      };
    }

    for (const item of items) {
      await this.executeCommand(['/ppp/active/remove', `=.id=${item.attributes['.id']}`]);
    }

    return {
      disconnected: true,
      matchedCount: items.length,
    };
  }

  async publishHotspotPortal(payload: HotspotPortalPublishPayload): Promise<HotspotPortalPublishResult> {
    const baseDir = payload.directoryName?.trim() || 'hotspot';
    if (!/^[a-zA-Z0-9_-]+$/.test(baseDir)) {
      throw new Error(`Invalid directory name: "${baseDir}". Must be alphanumeric.`);
    }

    if (!Array.isArray(payload.files) || payload.files.length === 0) {
      throw new Error('No files provided for HotSpot portal deployment.');
    }

    // 1. Flash Detection & Staging Directory Setup
    let hasFlash = false;
    let existingFileNames = new Set<string>();
    try {
      const verifyRes = await this.executeCommand(['/file/print']);
      const fileRecs = verifyRes.filter((r) => r.type === '!re');
      existingFileNames = new Set(fileRecs.map((r) => r.attributes['name'] ?? ''));
      hasFlash = Array.from(existingFileNames).some((name) => name.startsWith('flash/'));
    } catch {
      // Non-fatal
    }

    const targetDir = hasFlash && !baseDir.startsWith('flash/') ? `flash/${baseDir}` : baseDir;
    const stagingDir = `${targetDir}-staging`;

    // 2. Overwrite Protection in Staging
    const existingInStaging = Array.from(existingFileNames).filter((name) => name.startsWith(`${stagingDir}/`));
    if (existingInStaging.length > 0 && payload.overwriteConfirmed !== true) {
      throw new Error(`Staging directory "${stagingDir}" contains ${existingInStaging.length} existing files. Overwrite confirmation required.`);
    }

    // 3. Capture Original Profile Settings for Rollback
    let originalProfileName: string | undefined;
    let originalHtmlDirectory: string | undefined;
    let targetProfileId: string | undefined;

    try {
      const profRes = await this.executeCommand(['/ip/hotspot/profile/print']);
      const profRecs = profRes.filter((r) => r.type === '!re');
      if (payload.applyToProfile) {
        const match = profRecs.find((r) => r.attributes['name'] === payload.applyToProfile!.trim());
        if (match) {
          originalProfileName = match.attributes['name'];
          originalHtmlDirectory = match.attributes['html-directory'] ?? 'hotspot';
          targetProfileId = match.attributes['.id'];
        }
      } else if (profRecs.length > 0) {
        const firstProf = profRecs[0];
        originalProfileName = firstProf.attributes['name'];
        originalHtmlDirectory = firstProf.attributes['html-directory'] ?? 'hotspot';
        targetProfileId = firstProf.attributes['.id'];
      }
    } catch (profErr) {
      // Non-fatal
    }

    // 4. Upload Files to Staging (Lossless Binary Support)
    const written: string[] = [];
    for (const file of payload.files) {
      const cleanName = (file.name ?? '')
        .replace(/^\/+/, '')
        .trim();
      if (!cleanName || cleanName.includes('..') || !/^[a-zA-Z0-9_./-]+$/.test(cleanName)) {
        throw new Error(`Invalid file name: "${file.name}". Must be safe relative path.`);
      }

      const filePath = `${stagingDir}/${cleanName}`;

      let contentsWord: string | Buffer;
      if (file.encoding === 'base64') {
        const binBuf = Buffer.from(file.content ?? '', 'base64');
        contentsWord = Buffer.concat([Buffer.from('=contents='), binBuf]);
      } else {
        contentsWord = `=contents=${file.content ?? ''}`;
      }

      // Check if file exists on router
      const checkRes = await this.executeCommand(['/file/print', `?name=${filePath}`]);
      const existing = checkRes.find((r) => r.type === '!re');

      if (existing && existing.attributes['.id']) {
        const setRes = await this.executeCommand([
          '/file/set',
          `=.id=${existing.attributes['.id']}`,
          contentsWord,
        ]);
        const trap = setRes.find((r) => r.type === '!trap');
        if (trap) {
          throw new Error(`Failed to update router file "${filePath}": ${trap.attributes['message'] ?? 'unknown error'}`);
        }
      } else {
        const addRes = await this.executeCommand([
          '/file/add',
          `=name=${filePath}`,
          contentsWord,
        ]);
        const trap = addRes.find((r) => r.type === '!trap');
        if (trap) {
          throw new Error(`Failed to create router file "${filePath}": ${trap.attributes['message'] ?? 'unknown error'}`);
        }
      }

      written.push(cleanName);
    }

    // 5. Verify Written Files in Staging
    const verified: string[] = [];
    const postVerifyRes = await this.executeCommand(['/file/print']);
    const postExistingFileNames = new Set(
      postVerifyRes.filter((r) => r.type === '!re').map((r) => r.attributes['name']),
    );
    for (const w of written) {
      const targetPath = `${stagingDir}/${w}`;
      if (postExistingFileNames.has(targetPath) || postExistingFileNames.has(w)) {
        verified.push(w);
      }
    }

    if (verified.length < written.length) {
      throw new Error(`Staging verification incomplete: ${verified.length}/${written.length} files verified. Profile update aborted.`);
    }

    // 6. Atomic Profile Update with Immediate Rollback on Failure
    let profileUpdated: string | undefined;
    if (targetProfileId && originalProfileName) {
      try {
        const profRes = await this.executeCommand([
          '/ip/hotspot/profile/set',
          `=.id=${targetProfileId}`,
          `=html-directory=${stagingDir}`,
        ]);
        const trap = profRes.find((r) => r.type === '!trap');
        if (trap) {
          throw new Error(trap.attributes['message'] ?? 'Profile set error');
        }
        profileUpdated = originalProfileName;
      } catch (switchErr) {
        // Rollback
        if (originalHtmlDirectory) {
          try {
            await this.executeCommand([
              '/ip/hotspot/profile/set',
              `=.id=${targetProfileId}`,
              `=html-directory=${originalHtmlDirectory}`,
            ]);
          } catch {
            // ignore
          }
        }
        throw new Error(`Failed to activate profile "${originalProfileName}" to staging: ${switchErr}. Preserved original directory "${originalHtmlDirectory}".`);
      }
    }

    return {
      published: true,
      directory: targetDir,
      stagingDirectory: stagingDir,
      filesWritten: written,
      filesVerified: verified,
      profileUpdated,
      originalProfileName,
      originalHtmlDirectory,
      rollbackSupported: Boolean(originalProfileName && originalHtmlDirectory),
      message: `Successfully uploaded ${written.length} captive portal file(s) to ${stagingDir}/ (${verified.length} verified)`,
    };
  }
      message: `Successfully uploaded ${written.length} captive portal file(s) to ${dir}/ (${verified.length} verified)`,
    };
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      try {
        this.socket.destroy();
      } catch {
        // Ignore destroy error
      }
      this.socket = null;
    }
    this.connected = false;
  }
}
