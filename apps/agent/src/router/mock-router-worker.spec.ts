import { MockRouterWorker } from './mock-router-worker';

describe('MockRouterWorker & Reconciliation', () => {
  let worker: MockRouterWorker;

  beforeEach(() => {
    worker = new MockRouterWorker();
  });

  it('should report successful ping and healthy system resources', async () => {
    expect(await worker.ping()).toBe(true);

    const health = await worker.getHealth();
    expect(health.version).toContain('7.14');
    expect(health.cpuLoad).toBeGreaterThanOrEqual(0);
    expect(health.memoryTotal).toBeGreaterThan(0);
  });

  it('should add batch of users and reconcile duplicate additions idempotently', async () => {
    const users = [
      { name: 'user01', password: 'p1', profile: 'default', comment: 'batch-1' },
      { name: 'user02', password: 'p2', profile: 'default', comment: 'batch-1' },
    ];

    // First addition
    const result1 = await worker.batchAddHotspotUsers(users);
    expect(result1.total).toBe(2);
    expect(result1.createdCount).toBe(2);
    expect(result1.alreadyExistingCount).toBe(0);
    expect(result1.failedCount).toBe(0);

    // Second addition (e.g. retry after lost ack)
    const result2 = await worker.batchAddHotspotUsers([
      ...users,
      { name: 'user03', password: 'p3', profile: 'default' },
    ]);
    expect(result2.total).toBe(3);
    expect(result2.createdCount).toBe(1); // Only user03 was new
    expect(result2.alreadyExistingCount).toBe(2); // user01 & user02 reconciled safely!
    expect(result2.failedCount).toBe(0);
  });

  it('should detect name collision and reject addition if pre-existing user has different profile or comment', async () => {
    // Pre-existing user with different profile
    await worker.batchAddHotspotUsers([
      { name: 'user-conflict', password: 'old', profile: 'vip', comment: 'pre-existing' },
    ]);

    const result = await worker.batchAddHotspotUsers([
      { name: 'user-conflict', password: 'new', profile: 'standard', comment: 'new-batch' },
    ]);

    expect(result.createdCount).toBe(0);
    expect(result.alreadyExistingCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.errors?.[0].error).toContain('Conflict');
  });

  it('should remove users and report notFound without errors for already removed users', async () => {
    await worker.batchAddHotspotUsers([{ name: 'to-delete' }]);
    expect(worker.hasUser('to-delete')).toBe(true);

    const res1 = await worker.removeHotspotUsers(['to-delete', 'non-existent']);
    expect(res1.removedCount).toBe(1);
    expect(res1.notFoundCount).toBe(1);
    expect(res1.failedCount).toBe(0);
    expect(worker.hasUser('to-delete')).toBe(false);

    // Second removal of the same users (idempotent no-op)
    const res2 = await worker.removeHotspotUsers(['to-delete']);
    expect(res2.removedCount).toBe(0);
    expect(res2.notFoundCount).toBe(1);
  });

  it('should verify batch and partition existing and missing users', async () => {
    await worker.batchAddHotspotUsers([{ name: 'user-a' }, { name: 'user-b' }]);

    const verify = await worker.verifyHotspotUsers(['user-a', 'user-c', 'user-b', 'user-d']);
    expect(verify.existingUsers).toEqual(['user-a', 'user-b']);
    expect(verify.missingUsers).toEqual(['user-c', 'user-d']);
  });

  it('should list active hotspot sessions', async () => {
    const sessions = await worker.listActiveSessions();
    expect(sessions.total).toBeGreaterThan(0);
    expect(sessions.sessions[0].user).toBe('test-user-active');
  });
});
