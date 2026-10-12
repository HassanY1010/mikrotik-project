import { CommandExecutor } from './command-executor';
import { MockRouterWorker } from '../router/mock-router-worker';
import { AgentCommandType, CommandItem } from '../types';

describe('PPPoE Command Engine & Mock Simulation (Task 4.2)', () => {
  let mockWorker: MockRouterWorker;
  let executor: CommandExecutor;

  beforeEach(() => {
    mockWorker = new MockRouterWorker();
    executor = new CommandExecutor(mockWorker);
  });

  // -------------------------------------------------------------------------
  // 1. إنشاء حساب PPPoE صحيح (Create valid PPPoE secret)
  // -------------------------------------------------------------------------
  it('1. should successfully create a valid PPPoE secret', async () => {
    const cmd: CommandItem = {
      id: 'cmd-pppoe-1',
      operationId: 'op-pppoe-1',
      type: AgentCommandType.PPPOE_SECRET_ADD,
      payload: {
        username: 'sub-user-01',
        password: 'secret_sub_password_123',
        profile: 'profile_10m',
        comment: 'Contract #9910',
      },
      expiresAt: new Date().toISOString(),
      attempts: 0,
    };

    const res = await executor.execute(cmd);
    expect(res.operationId).toBe('op-pppoe-1');
    expect(res.status).toBe('COMPLETED');
    expect(res.result).toBeDefined();
    expect(res.result?.username).toBe('sub-user-01');
    expect(res.result?.status).toBe('CREATED');
    expect(res.result?.profile).toBe('profile_10m');
    // Security check: password must NEVER be in result
    expect(res.result?.password).toBeUndefined();
    expect(mockWorker.hasPppoeSecret('sub-user-01')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 2. إنشاء الحساب نفسه مرة أخرى (Re-add identical secret - Idempotency)
  // -------------------------------------------------------------------------
  it('2. should idempotently reconcile creating the same secret again', async () => {
    const cmd: CommandItem = {
      id: 'cmd-pppoe-2',
      operationId: 'op-pppoe-2',
      type: AgentCommandType.PPPOE_SECRET_ADD,
      payload: {
        username: 'sub-user-reconcile',
        password: 'mypassword',
        profile: 'profile_20m',
      },
      expiresAt: new Date().toISOString(),
      attempts: 0,
    };

    const firstRes = await executor.execute(cmd);
    expect(firstRes.status).toBe('COMPLETED');
    expect(firstRes.result?.status).toBe('CREATED');

    // Repeated execution (e.g., lost ACK retry)
    const secondRes = await executor.execute(cmd);
    expect(secondRes.status).toBe('COMPLETED');
    expect(secondRes.result?.status).toBe('ALREADY_EXISTS');
    expect(secondRes.result?.reconciled).toBe(true);
    expect(secondRes.result?.username).toBe('sub-user-reconcile');
  });

  // -------------------------------------------------------------------------
  // 3. رفض تعارض اسم المستخدم مع حساب موجود ذي خصائص مختلفة
  // -------------------------------------------------------------------------
  it('3. should reject conflict when adding username that already exists with mismatched profile/settings', async () => {
    // Initial creation with profile_5m
    await executor.execute({
      id: 'cmd-pppoe-pre',
      operationId: 'op-pppoe-pre',
      type: AgentCommandType.PPPOE_SECRET_ADD,
      payload: {
        username: 'sub-conflict',
        password: 'pass1',
        profile: 'profile_5m',
      },
      expiresAt: new Date().toISOString(),
      attempts: 0,
    });

    // Attempt to add same username with conflicting profile_50m
    const conflictCmd: CommandItem = {
      id: 'cmd-pppoe-3',
      operationId: 'op-pppoe-3',
      type: AgentCommandType.PPPOE_SECRET_ADD,
      payload: {
        username: 'sub-conflict',
        password: 'pass2',
        profile: 'profile_50m',
      },
      expiresAt: new Date().toISOString(),
      attempts: 0,
    };

    const res = await executor.execute(conflictCmd);
    expect(res.status).toBe('FAILED');
    expect(res.errorMessage).toContain('Conflict');
    expect(res.errorMessage).toContain('mismatched profile');
  });

  // -------------------------------------------------------------------------
  // 4. تحديث حساب موجود (Update existing secret)
  // -------------------------------------------------------------------------
  it('4. should successfully update an existing PPPoE secret without leaking password', async () => {
    await executor.execute({
      id: 'cmd-pre-update',
      operationId: 'op-pre-update',
      type: AgentCommandType.PPPOE_SECRET_ADD,
      payload: {
        username: 'sub-update-me',
        password: 'oldpassword',
        profile: 'profile_10m',
      },
      expiresAt: new Date().toISOString(),
      attempts: 0,
    });

    const updateCmd: CommandItem = {
      id: 'cmd-pppoe-4',
      operationId: 'op-pppoe-4',
      type: AgentCommandType.PPPOE_SECRET_UPDATE,
      payload: {
        username: 'sub-update-me',
        password: 'new_super_secret_pass',
        profile: 'profile_100m',
        comment: 'Upgraded to 100Mbps plan',
      },
      expiresAt: new Date().toISOString(),
      attempts: 0,
    };

    const res = await executor.execute(updateCmd);
    expect(res.status).toBe('COMPLETED');
    expect(res.result?.username).toBe('sub-update-me');
    expect(res.result?.updated).toBe(true);
    expect(res.result?.fieldsModified).toContain('password');
    expect(res.result?.fieldsModified).toContain('profile');
    expect(res.result?.fieldsModified).toContain('comment');
    // Ensure raw password is NEVER returned in result object
    expect(res.result?.password).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // 5. تعطيل الحساب وتفعيله (Disable and Enable secret with active session cutoff)
  // -------------------------------------------------------------------------
  it('5. should disable PPPoE secret with active session disconnection, and then enable it', async () => {
    await executor.execute({
      id: 'cmd-pre-disable',
      operationId: 'op-pre-disable',
      type: AgentCommandType.PPPOE_SECRET_ADD,
      payload: {
        username: 'sub-toggle',
        password: 'password1',
        profile: 'default',
      },
      expiresAt: new Date().toISOString(),
      attempts: 0,
    });

    // Seed an active session for sub-toggle
    mockWorker.addPppoeActiveSession({
      id: '*99',
      username: 'sub-toggle',
      service: 'pppoe',
      address: '10.100.1.55',
      uptime: '02:30:15',
    });

    // 5a. Disable secret
    const disableCmd: CommandItem = {
      id: 'cmd-pppoe-5a',
      operationId: 'op-pppoe-5a',
      type: AgentCommandType.PPPOE_SECRET_DISABLE,
      payload: {
        username: 'sub-toggle',
        disconnectActive: true,
      },
      expiresAt: new Date().toISOString(),
      attempts: 0,
    };

    const disableRes = await executor.execute(disableCmd);
    expect(disableRes.status).toBe('COMPLETED');
    expect(disableRes.result?.disabled).toBe(true);
    expect(disableRes.result?.activeDisconnected).toBe(true);

    // Active session should now be gone
    const activeSessionsAfterDisable = await mockWorker.listPppoeActiveSessions();
    expect(activeSessionsAfterDisable.sessions.some((s) => s.username === 'sub-toggle')).toBe(false);

    // 5b. Enable secret
    const enableCmd: CommandItem = {
      id: 'cmd-pppoe-5b',
      operationId: 'op-pppoe-5b',
      type: AgentCommandType.PPPOE_SECRET_ENABLE,
      payload: {
        username: 'sub-toggle',
      },
      expiresAt: new Date().toISOString(),
      attempts: 0,
    };

    const enableRes = await executor.execute(enableCmd);
    expect(enableRes.status).toBe('COMPLETED');
    expect(enableRes.result?.disabled).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 6. حذف الحساب غير النشط أو الموجود (Remove PPPoE secret)
  // -------------------------------------------------------------------------
  it('6. should remove existing PPPoE secret and terminate active sessions', async () => {
    await executor.execute({
      id: 'cmd-pre-remove',
      operationId: 'op-pre-remove',
      type: AgentCommandType.PPPOE_SECRET_ADD,
      payload: {
        username: 'sub-remove-me',
        password: 'password1',
        profile: 'default',
      },
      expiresAt: new Date().toISOString(),
      attempts: 0,
    });

    mockWorker.addPppoeActiveSession({
      id: '*88',
      username: 'sub-remove-me',
      service: 'pppoe',
      address: '10.100.1.88',
      uptime: '00:10:00',
    });

    const removeCmd: CommandItem = {
      id: 'cmd-pppoe-6',
      operationId: 'op-pppoe-6',
      type: AgentCommandType.PPPOE_SECRET_REMOVE,
      payload: {
        username: 'sub-remove-me',
        disconnectActive: true,
      },
      expiresAt: new Date().toISOString(),
      attempts: 0,
    };

    const res = await executor.execute(removeCmd);
    expect(res.status).toBe('COMPLETED');
    expect(res.result?.removed).toBe(true);
    expect(res.result?.activeDisconnected).toBe(true);
    expect(mockWorker.hasPppoeSecret('sub-remove-me')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 7. التعامل مع حساب غير موجود (Handle non-existent secret)
  // -------------------------------------------------------------------------
  it('7. should return structured error when updating or operating on a non-existent secret', async () => {
    const updateGhostCmd: CommandItem = {
      id: 'cmd-pppoe-7',
      operationId: 'op-pppoe-7',
      type: AgentCommandType.PPPOE_SECRET_UPDATE,
      payload: {
        username: 'ghost-subscriber',
        profile: 'profile_new',
      },
      expiresAt: new Date().toISOString(),
      attempts: 0,
    };

    const res = await executor.execute(updateGhostCmd);
    expect(res.status).toBe('FAILED');
    expect(res.errorMessage).toContain('was not found in /ppp/secret');
  });

  // -------------------------------------------------------------------------
  // 8. مزامنة بروفايلات PPPoE (Sync PPPoE profiles - Creation & Update)
  // -------------------------------------------------------------------------
  it('8. should sync PPPoE profiles: creation, update, and parameters', async () => {
    // 8a. Create new profile
    const createProfileCmd: CommandItem = {
      id: 'cmd-pppoe-8a',
      operationId: 'op-pppoe-8a',
      type: AgentCommandType.PPPOE_PROFILE_SYNC,
      payload: {
        name: 'plan-premium-50m',
        rateLimit: '50M/50M',
        localAddress: '10.200.0.1',
        remoteAddress: 'pool-pppoe',
        dnsServers: '8.8.8.8,1.1.1.1',
        onlyOne: true,
      },
      expiresAt: new Date().toISOString(),
      attempts: 0,
    };

    const resCreate = await executor.execute(createProfileCmd);
    expect(resCreate.status).toBe('COMPLETED');
    expect(resCreate.result?.name).toBe('plan-premium-50m');
    expect(resCreate.result?.action).toBe('CREATED');
    expect(resCreate.result?.rateLimit).toBe('50M/50M');
    expect(mockWorker.hasPppoeProfile('plan-premium-50m')).toBe(true);

    // 8b. Update existing profile
    const updateProfileCmd: CommandItem = {
      id: 'cmd-pppoe-8b',
      operationId: 'op-pppoe-8b',
      type: AgentCommandType.PPPOE_PROFILE_SYNC,
      payload: {
        name: 'plan-premium-50m',
        rateLimit: '60M/60M',
      },
      expiresAt: new Date().toISOString(),
      attempts: 0,
    };

    const resUpdate = await executor.execute(updateProfileCmd);
    expect(resUpdate.status).toBe('COMPLETED');
    expect(resUpdate.result?.name).toBe('plan-premium-50m');
    expect(resUpdate.result?.action).toBe('UPDATED');
    expect(resUpdate.result?.rateLimit).toBe('60M/60M');
  });

  // -------------------------------------------------------------------------
  // 9. جلب الجلسات النشطة (List active PPPoE sessions)
  // -------------------------------------------------------------------------
  it('9. should list active broadband sessions from /ppp/active', async () => {
    mockWorker.addPppoeActiveSession({
      id: '*101',
      username: 'active-user-alpha',
      service: 'pppoe',
      callerId: '00:11:22:33:44:55',
      address: '10.200.0.10',
      uptime: '05:12:44',
      sessionId: 'sess-alpha-001',
    });

    const listCmd: CommandItem = {
      id: 'cmd-pppoe-9',
      operationId: 'op-pppoe-9',
      type: AgentCommandType.PPPOE_SESSION_LIST,
      payload: {},
      expiresAt: new Date().toISOString(),
      attempts: 0,
    };

    const res = await executor.execute(listCmd);
    expect(res.status).toBe('COMPLETED');
    expect(res.result?.total).toBeGreaterThanOrEqual(1);
    const alphaSession = res.result?.sessions.find((s: any) => s.username === 'active-user-alpha');
    expect(alphaSession).toBeDefined();
    expect(alphaSession.service).toBe('pppoe');
    expect(alphaSession.address).toBe('10.200.0.10');
    expect(alphaSession.callerId).toBe('00:11:22:33:44:55');
  });

  // -------------------------------------------------------------------------
  // 10. فصل جلسة موجودة (Disconnect existing active session)
  // -------------------------------------------------------------------------
  it('10. should disconnect an existing active session by username or sessionId', async () => {
    mockWorker.addPppoeActiveSession({
      id: '*202',
      username: 'to-disconnect-user',
      service: 'pppoe',
      address: '10.200.0.22',
      uptime: '01:00:00',
    });

    const discCmd: CommandItem = {
      id: 'cmd-pppoe-10',
      operationId: 'op-pppoe-10',
      type: AgentCommandType.PPPOE_SESSION_DISCONNECT,
      payload: {
        username: 'to-disconnect-user',
      },
      expiresAt: new Date().toISOString(),
      attempts: 0,
    };

    const res = await executor.execute(discCmd);
    expect(res.status).toBe('COMPLETED');
    expect(res.result?.disconnected).toBe(true);
    expect(res.result?.matchedCount).toBe(1);

    // Verify session was terminated
    const sessions = await mockWorker.listPppoeActiveSessions();
    expect(sessions.sessions.some((s) => s.username === 'to-disconnect-user')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 11. التعامل مع جلسة انتهت قبل تنفيذ الفصل (Session expired before disconnect)
  // -------------------------------------------------------------------------
  it('11. should gracefully handle session that has already terminated/expired before disconnect', async () => {
    const discNonExistentCmd: CommandItem = {
      id: 'cmd-pppoe-11',
      operationId: 'op-pppoe-11',
      type: AgentCommandType.PPPOE_SESSION_DISCONNECT,
      payload: {
        username: 'already-logged-out-user',
      },
      expiresAt: new Date().toISOString(),
      attempts: 0,
    };

    const res = await executor.execute(discNonExistentCmd);
    expect(res.status).toBe('COMPLETED');
    expect(res.result?.disconnected).toBe(false);
    expect(res.result?.matchedCount).toBe(0);
    expect(res.result?.message).toContain('Session is no longer active on router');
  });

  // -------------------------------------------------------------------------
  // 12. رفض مدخلات غير صحيحة (Validation of mandatory fields)
  // -------------------------------------------------------------------------
  it('12. should strictly validate input fields and reject invalid payloads', async () => {
    // Missing username in secret add
    const missingUserCmd: CommandItem = {
      id: 'cmd-bad-1',
      operationId: 'op-bad-1',
      type: AgentCommandType.PPPOE_SECRET_ADD,
      payload: { password: 'pwd', profile: 'prof' },
      expiresAt: new Date().toISOString(),
      attempts: 0,
    };
    const res1 = await executor.execute(missingUserCmd);
    expect(res1.status).toBe('FAILED');
    expect(res1.errorMessage).toContain('"username" is required');

    // Missing profile in secret add
    const missingProfileCmd: CommandItem = {
      id: 'cmd-bad-2',
      operationId: 'op-bad-2',
      type: AgentCommandType.PPPOE_SECRET_ADD,
      payload: { username: 'testuser', password: 'pwd' },
      expiresAt: new Date().toISOString(),
      attempts: 0,
    };
    const res2 = await executor.execute(missingProfileCmd);
    expect(res2.status).toBe('FAILED');
    expect(res2.errorMessage).toContain('"profile" is required');

    // Missing profile name in profile sync
    const missingNameCmd: CommandItem = {
      id: 'cmd-bad-3',
      operationId: 'op-bad-3',
      type: AgentCommandType.PPPOE_PROFILE_SYNC,
      payload: { rateLimit: '10M/10M' },
      expiresAt: new Date().toISOString(),
      attempts: 0,
    };
    const res3 = await executor.execute(missingNameCmd);
    expect(res3.status).toBe('FAILED');
    expect(res3.errorMessage).toContain('"name" is required');

    // Missing both username and sessionId in session disconnect
    const missingTargetCmd: CommandItem = {
      id: 'cmd-bad-4',
      operationId: 'op-bad-4',
      type: AgentCommandType.PPPOE_SESSION_DISCONNECT,
      payload: {},
      expiresAt: new Date().toISOString(),
      attempts: 0,
    };
    const res4 = await executor.execute(missingTargetCmd);
    expect(res4.status).toBe('FAILED');
    expect(res4.errorMessage).toContain('either "username" or "sessionId" must be provided');
  });

  // -------------------------------------------------------------------------
  // 13. عدم تسريب كلمات المرور في السجلات والأخطاء (Password safety)
  // -------------------------------------------------------------------------
  it('13. should never leak credentials or passwords in result payload or sanitized error messages', async () => {
    // Add command result must not have password
    const addCmd: CommandItem = {
      id: 'cmd-safe-add',
      operationId: 'op-safe-add',
      type: AgentCommandType.PPPOE_SECRET_ADD,
      payload: {
        username: 'safety-user',
        password: 'SUPER_CONFIDENTIAL_PASSWORD_9988',
        profile: 'default',
      },
      expiresAt: new Date().toISOString(),
      attempts: 0,
    };
    const addRes = await executor.execute(addCmd);
    expect(JSON.stringify(addRes)).not.toContain('SUPER_CONFIDENTIAL_PASSWORD_9988');

    // Error message must sanitize password
    const errorWorker = {
      ...mockWorker,
      addPppoeSecret: jest.fn().mockRejectedValue(
        new Error('RouterOS error: connection failed with password=SUPER_CONFIDENTIAL_PASSWORD_9988 & status=refused'),
      ),
    };
    const errorExecutor = new CommandExecutor(errorWorker as any);

    const errRes = await errorExecutor.execute(addCmd);
    expect(errRes.status).toBe('FAILED');
    expect(errRes.errorMessage).not.toContain('SUPER_CONFIDENTIAL_PASSWORD_9988');
    expect(errRes.errorMessage).toContain('password=***');
  });

  // -------------------------------------------------------------------------
  // 14. الحفاظ على idempotency عند إعادة إرسال الأمر نفسه (Lost-ACK idempotency)
  // -------------------------------------------------------------------------
  it('14. should preserve idempotency across multiple re-transmissions of identical command', async () => {
    const cmd: CommandItem = {
      id: 'cmd-retry-1',
      operationId: 'op-fixed-id-4455',
      type: AgentCommandType.PPPOE_SECRET_ADD,
      payload: {
        username: 'idempotent-subscriber',
        password: 'same-password',
        profile: 'default',
        callerId: '00:aa:bb:cc:dd:ee',
      },
      expiresAt: new Date().toISOString(),
      attempts: 0,
    };

    // First attempt -> CREATED
    const res1 = await executor.execute(cmd);
    expect(res1.status).toBe('COMPLETED');
    expect(res1.result?.status).toBe('CREATED');

    // Second attempt (simulating packet loss or lost ACK) -> ALREADY_EXISTS / reconciled
    const res2 = await executor.execute(cmd);
    expect(res2.status).toBe('COMPLETED');
    expect(res2.result?.status).toBe('ALREADY_EXISTS');
    expect(res2.result?.reconciled).toBe(true);

    // Third attempt -> stays healthy and consistent
    const res3 = await executor.execute(cmd);
    expect(res3.status).toBe('COMPLETED');
    expect(res3.result?.status).toBe('ALREADY_EXISTS');
    expect(res3.result?.reconciled).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 15. التأكد من أن أوامر HotSpot واختباراته الحالية لم تتغير نتائجها
  // -------------------------------------------------------------------------
  it('15. should verify HotSpot commands and health checks continue working identically alongside PPPoE', async () => {
    // 15a. Health Check
    const healthCmd: CommandItem = {
      id: 'cmd-hs-health',
      operationId: 'op-hs-health',
      type: AgentCommandType.ROUTER_HEALTH,
      payload: {},
      expiresAt: new Date().toISOString(),
      attempts: 0,
    };
    const healthRes = await executor.execute(healthCmd);
    expect(healthRes.status).toBe('COMPLETED');
    expect(healthRes.result?.cpuLoad).toBeDefined();

    // 15b. Hotspot Batch Add
    const hsAddCmd: CommandItem = {
      id: 'cmd-hs-add',
      operationId: 'op-hs-add',
      type: AgentCommandType.HOTSPOT_BATCH_ADD,
      payload: {
        users: [
          { name: 'hs-user-1', password: 'p1' },
          { name: 'hs-user-2', password: 'p2' },
        ],
      },
      expiresAt: new Date().toISOString(),
      attempts: 0,
    };
    const hsAddRes = await executor.execute(hsAddCmd);
    expect(hsAddRes.status).toBe('COMPLETED');
    expect(hsAddRes.result?.createdCount).toBe(2);

    // 15c. Hotspot Verify
    const hsVerifyCmd: CommandItem = {
      id: 'cmd-hs-verify',
      operationId: 'op-hs-verify',
      type: AgentCommandType.HOTSPOT_VERIFY_BATCH,
      payload: { names: ['hs-user-1', 'non-existent'] },
      expiresAt: new Date().toISOString(),
      attempts: 0,
    };
    const hsVerifyRes = await executor.execute(hsVerifyCmd);
    expect(hsVerifyRes.status).toBe('COMPLETED');
    expect(hsVerifyRes.result?.existingUsers).toContain('hs-user-1');
    expect(hsVerifyRes.result?.missingUsers).toContain('non-existent');

    // 15d. Hotspot Remove
    const hsRemoveCmd: CommandItem = {
      id: 'cmd-hs-remove',
      operationId: 'op-hs-remove',
      type: AgentCommandType.HOTSPOT_USER_REMOVE,
      payload: { names: ['hs-user-1'] },
      expiresAt: new Date().toISOString(),
      attempts: 0,
    };
    const hsRemoveRes = await executor.execute(hsRemoveCmd);
    expect(hsRemoveRes.status).toBe('COMPLETED');
    expect(hsRemoveRes.result?.removedCount).toBe(1);

    // 15e. Hotspot Sessions
    const hsSessCmd: CommandItem = {
      id: 'cmd-hs-sess',
      operationId: 'op-hs-sess',
      type: AgentCommandType.HOTSPOT_SESSION_LIST,
      payload: {},
      expiresAt: new Date().toISOString(),
      attempts: 0,
    };
    const hsSessRes = await executor.execute(hsSessCmd);
    expect(hsSessRes.status).toBe('COMPLETED');
    expect(hsSessRes.result?.total).toBeGreaterThan(0);
  });
});
