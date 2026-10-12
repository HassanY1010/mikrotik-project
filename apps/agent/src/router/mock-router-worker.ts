import { IRouterWorker } from './interfaces/router-worker.interface';
import {
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

export class MockRouterWorker implements IRouterWorker {
  private users = new Map<string, HotspotBatchAddUser>();
  private hotspotFiles = new Map<string, string>();
  private sessions: HotspotActiveSession[] = [
    {
      id: '*1',
      user: 'test-user-active',
      address: '192.168.88.50',
      macAddress: 'AA:BB:CC:DD:EE:01',
      uptime: '1h 22m',
      bytesIn: 1048576,
      bytesOut: 5242880,
      sessionId: 'sess-001',
    },
  ];

  // PPPoE Simulation State
  private pppoeProfiles = new Map<string, PppoeProfileSyncPayload>();
  private pppoeSecrets = new Map<string, PppoeSecretAddPayload & { disabled: boolean }>();
  private pppoeSessions: PppoeActiveSession[] = [
    {
      id: '*p1',
      username: 'active-pppoe-user',
      service: 'pppoe',
      callerId: '00:11:22:33:44:55',
      address: '192.168.10.100',
      uptime: '3d 12:45:00',
      encoding: 'MPPE128',
      sessionId: 'sess-p001',
    },
  ];

  async ping(): Promise<boolean> {
    return true;
  }

  async getHealth(): Promise<RouterHealthResult> {
    return {
      uptime: '4d 18:22:10',
      version: '7.14.3 (stable)',
      cpuLoad: 8,
      memoryFree: 875000000,
      memoryTotal: 1073741824,
      hddFree: 15400000,
      hddTotal: 33554432,
      boardName: 'RB750Gr3 (hEX)',
      architecture: 'mmips',
    };
  }

  async batchAddHotspotUsers(users: HotspotBatchAddUser[]): Promise<HotspotBatchAddResult> {
    let createdCount = 0;
    let alreadyExistingCount = 0;
    let failedCount = 0;
    const errors: Array<{ name: string; error: string }> = [];

    for (const u of users) {
      if (!u.name || u.name.trim() === '') {
        failedCount++;
        errors.push({ name: u.name ?? 'unknown', error: 'User name is empty' });
        continue;
      }

      if (this.users.has(u.name)) {
        const existing = this.users.get(u.name)!;
        const profileMatches = (existing.profile ?? 'default') === (u.profile ?? 'default');
        const commentMatches = !u.comment || existing.comment === u.comment;

        if (profileMatches && commentMatches) {
          alreadyExistingCount++;
        } else {
          failedCount++;
          errors.push({
            name: u.name,
            error: `Conflict: User "${u.name}" already exists on the router with mismatched profile or comment`,
          });
        }
      } else {
        this.users.set(u.name, { ...u });
        createdCount++;
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

    for (const name of names) {
      if (this.users.has(name)) {
        this.users.delete(name);
        removedCount++;
      } else {
        notFoundCount++;
      }
    }

    return {
      total: names.length,
      removedCount,
      notFoundCount,
      failedCount: 0,
    };
  }

  async verifyHotspotUsers(names: string[]): Promise<HotspotVerifyBatchResult> {
    const existingUsers: string[] = [];
    const missingUsers: string[] = [];

    for (const name of names) {
      if (this.users.has(name)) {
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
    return {
      total: this.sessions.length,
      sessions: [...this.sessions],
    };
  }

  // =========================================================================
  // PPPoE Simulation Methods
  // =========================================================================

  async syncPppoeProfile(payload: PppoeProfileSyncPayload): Promise<PppoeProfileSyncResult> {
    if (!payload.name || payload.name.trim() === '') {
      throw new Error('Profile name is required');
    }

    const exists = this.pppoeProfiles.has(payload.name);
    this.pppoeProfiles.set(payload.name, { ...payload });

    return {
      name: payload.name,
      action: exists ? 'UPDATED' : 'CREATED',
      rateLimit: payload.rateLimit,
    };
  }

  async addPppoeSecret(payload: PppoeSecretAddPayload): Promise<PppoeSecretAddResult> {
    if (!payload.username || payload.username.trim() === '') {
      throw new Error('Username is required for PPPoE secret');
    }
    if (!payload.profile || payload.profile.trim() === '') {
      throw new Error('Profile is required for PPPoE secret');
    }

    if (this.pppoeSecrets.has(payload.username)) {
      const existing = this.pppoeSecrets.get(payload.username)!;
      const profileMatches = existing.profile === payload.profile;
      const callerMatches = !payload.callerId || existing.callerId === payload.callerId;
      const remoteMatches = !payload.remoteAddress || existing.remoteAddress === payload.remoteAddress;

      if (profileMatches && callerMatches && remoteMatches) {
        return {
          username: payload.username,
          status: 'ALREADY_EXISTS',
          profile: payload.profile,
          reconciled: true,
        };
      } else {
        throw new Error(
          `Conflict: User "${payload.username}" already exists in /ppp/secret with mismatched profile ("${existing.profile}") or settings. Creation aborted to protect existing broadband subscriber.`,
        );
      }
    }

    this.pppoeSecrets.set(payload.username, {
      ...payload,
      disabled: payload.disabled ?? false,
    });

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

    if (!this.pppoeSecrets.has(payload.username)) {
      throw new Error(`PPPoE secret "${payload.username}" was not found in /ppp/secret`);
    }

    const existing = this.pppoeSecrets.get(payload.username)!;
    const fieldsModified: string[] = [];

    if (payload.password !== undefined) {
      existing.password = payload.password;
      fieldsModified.push('password');
    }
    if (payload.profile !== undefined) {
      existing.profile = payload.profile;
      fieldsModified.push('profile');
    }
    if (payload.callerId !== undefined) {
      existing.callerId = payload.callerId;
      fieldsModified.push('callerId');
    }
    if (payload.remoteAddress !== undefined) {
      existing.remoteAddress = payload.remoteAddress;
      fieldsModified.push('remoteAddress');
    }
    if (payload.comment !== undefined) {
      existing.comment = payload.comment;
      fieldsModified.push('comment');
    }
    if (payload.disabled !== undefined) {
      existing.disabled = payload.disabled;
      fieldsModified.push('disabled');
    }

    this.pppoeSecrets.set(payload.username, existing);

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

    if (!this.pppoeSecrets.has(payload.username)) {
      throw new Error(`PPPoE secret "${payload.username}" was not found in /ppp/secret`);
    }

    const existing = this.pppoeSecrets.get(payload.username)!;
    existing.disabled = true;
    this.pppoeSecrets.set(payload.username, existing);

    let activeDisconnected = false;
    if (payload.disconnectActive !== false) {
      const idx = this.pppoeSessions.findIndex((s) => s.username === payload.username);
      if (idx !== -1) {
        this.pppoeSessions.splice(idx, 1);
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

    if (!this.pppoeSecrets.has(payload.username)) {
      throw new Error(`PPPoE secret "${payload.username}" was not found in /ppp/secret`);
    }

    const existing = this.pppoeSecrets.get(payload.username)!;
    existing.disabled = false;
    this.pppoeSecrets.set(payload.username, existing);

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

    if (!this.pppoeSecrets.has(payload.username)) {
      throw new Error(`PPPoE secret "${payload.username}" was not found in /ppp/secret`);
    }

    let activeDisconnected = false;
    if (payload.disconnectActive !== false) {
      const idx = this.pppoeSessions.findIndex((s) => s.username === payload.username);
      if (idx !== -1) {
        this.pppoeSessions.splice(idx, 1);
        activeDisconnected = true;
      }
    }

    this.pppoeSecrets.delete(payload.username);

    return {
      username: payload.username,
      removed: true,
      activeDisconnected,
    };
  }

  async listPppoeActiveSessions(): Promise<PppoeSessionListResult> {
    return {
      total: this.pppoeSessions.length,
      sessions: [...this.pppoeSessions],
    };
  }

  async disconnectPppoeSession(payload: PppoeSessionDisconnectPayload): Promise<PppoeSessionDisconnectResult> {
    if (!payload.username && !payload.sessionId) {
      throw new Error('Either username or sessionId is required to disconnect a PPPoE session');
    }

    const before = this.pppoeSessions.length;
    this.pppoeSessions = this.pppoeSessions.filter((s) => {
      if (payload.sessionId && s.sessionId === payload.sessionId) return false;
      if (payload.username && s.username === payload.username) return false;
      return true;
    });

    const removed = before - this.pppoeSessions.length;

    return {
      disconnected: removed > 0,
      matchedCount: removed,
      message: removed > 0 ? undefined : 'Session is no longer active on router',
    };
  }

  async disconnect(): Promise<void> {
    // No-op for mock
  }

  // Helper methods for testing
  getUserCount(): number {
    return this.users.size;
  }

  hasUser(name: string): boolean {
    return this.users.has(name);
  }

  clearUsers(): void {
    this.users.clear();
  }

  hasPppoeSecret(username: string): boolean {
    return this.pppoeSecrets.has(username);
  }

  getPppoeSecret(username: string) {
    return this.pppoeSecrets.get(username);
  }

  hasPppoeProfile(name: string): boolean {
    return this.pppoeProfiles.has(name);
  }

  addPppoeActiveSession(session: PppoeActiveSession): void {
    this.pppoeSessions.push(session);
  }

  clearPppoe(): void {
    this.pppoeProfiles.clear();
    this.pppoeSecrets.clear();
    this.pppoeSessions = [];
  }

  // HotSpot Portal Simulation
  async publishHotspotPortal(payload: HotspotPortalPublishPayload): Promise<HotspotPortalPublishResult> {
    const dir = payload.directoryName?.trim() || 'hotspot';
    if (!/^[a-zA-Z0-9_-]+$/.test(dir)) {
      throw new Error(`Invalid directory name: "${dir}". Must be alphanumeric.`);
    }

    if (!Array.isArray(payload.files) || payload.files.length === 0) {
      throw new Error('No files provided for HotSpot portal deployment.');
    }

    const written: string[] = [];
    for (const file of payload.files) {
      if (!file.name || !/^[a-zA-Z0-9_.-]+$/.test(file.name)) {
        throw new Error(`Invalid file name: "${file.name}".`);
      }
      const fullPath = `${dir}/${file.name}`;
      this.hotspotFiles.set(fullPath, file.content ?? '');
      written.push(file.name);
    }

    return {
      published: true,
      directory: dir,
      filesWritten: written,
      profileUpdated: payload.applyToProfile,
      message: `Successfully published ${written.length} files to directory "${dir}"`,
    };
  }

  getHotspotFile(path: string): string | undefined {
    return this.hotspotFiles.get(path);
  }

  hasHotspotFile(path: string): boolean {
    return this.hotspotFiles.has(path);
  }

  clearHotspotFiles(): void {
    this.hotspotFiles.clear();
  }
}


