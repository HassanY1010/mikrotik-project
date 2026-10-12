import { CommandExecutor } from './command-executor';
import { MockRouterWorker } from '../router/mock-router-worker';
import { AgentCommandType, CommandItem } from '../types';

describe('CommandExecutor & Whitelist Enforcement', () => {
  let mockWorker: MockRouterWorker;
  let executor: CommandExecutor;

  beforeEach(() => {
    mockWorker = new MockRouterWorker();
    executor = new CommandExecutor(mockWorker);
  });

  it('should execute authorized system.router.health command', async () => {
    const cmd: CommandItem = {
      id: 'cmd-1',
      operationId: 'op-1',
      type: AgentCommandType.ROUTER_HEALTH,
      payload: {},
      expiresAt: new Date().toISOString(),
      attempts: 0,
    };

    const result = await executor.execute(cmd);
    expect(result.operationId).toBe('op-1');
    expect(result.status).toBe('COMPLETED');
    expect(result.result?.version).toBeDefined();
    expect(result.result?.cpuLoad).toBeDefined();
  });

  it('should execute authorized hotspot.user.batch_add with reconciliation', async () => {
    const cmd: CommandItem = {
      id: 'cmd-2',
      operationId: 'op-2',
      type: AgentCommandType.HOTSPOT_BATCH_ADD,
      payload: {
        users: [
          { name: 'u1', password: 'p1' },
          { name: 'u2', password: 'p2' },
        ],
      },
      expiresAt: new Date().toISOString(),
      attempts: 0,
    };

    const result = await executor.execute(cmd);
    expect(result.status).toBe('COMPLETED');
    expect(result.result?.createdCount).toBe(2);

    // Repeated execution of the same batch (Lost Ack simulation)
    const retryResult = await executor.execute(cmd);
    expect(retryResult.status).toBe('COMPLETED');
    expect(retryResult.result?.alreadyExistingCount).toBe(2);
    expect(retryResult.result?.createdCount).toBe(0);
  });

  it('should strictly REJECT forbidden or unwhitelisted commands (e.g. CLI execution)', async () => {
    const dangerousCmd: CommandItem = {
      id: 'cmd-danger',
      operationId: 'op-danger',
      type: 'system.terminal.exec' as any, // Not in whitelist!
      payload: { command: '/system reboot' },
      expiresAt: new Date().toISOString(),
      attempts: 0,
    };

    const result = await executor.execute(dangerousCmd);
    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).toContain('Forbidden or unsupported command type');
    expect(result.result).toBeUndefined();
  });

  it('should execute hotspot.user.remove command', async () => {
    await mockWorker.batchAddHotspotUsers([{ name: 'del-user' }]);

    const cmd: CommandItem = {
      id: 'cmd-3',
      operationId: 'op-3',
      type: AgentCommandType.HOTSPOT_USER_REMOVE,
      payload: { names: ['del-user', 'non-existent'] },
      expiresAt: new Date().toISOString(),
      attempts: 0,
    };

    const result = await executor.execute(cmd);
    expect(result.status).toBe('COMPLETED');
    expect(result.result?.removedCount).toBe(1);
    expect(result.result?.notFoundCount).toBe(1);
  });

  it('should execute hotspot.user.verify_batch command', async () => {
    await mockWorker.batchAddHotspotUsers([{ name: 'found-user' }]);

    const cmd: CommandItem = {
      id: 'cmd-4',
      operationId: 'op-4',
      type: AgentCommandType.HOTSPOT_VERIFY_BATCH,
      payload: { names: ['found-user', 'missing-user'] },
      expiresAt: new Date().toISOString(),
      attempts: 0,
    };

    const result = await executor.execute(cmd);
    expect(result.status).toBe('COMPLETED');
    expect(result.result?.existingUsers).toEqual(['found-user']);
    expect(result.result?.missingUsers).toEqual(['missing-user']);
  });

  it('should execute hotspot.session.list command', async () => {
    const cmd: CommandItem = {
      id: 'cmd-5',
      operationId: 'op-5',
      type: AgentCommandType.HOTSPOT_SESSION_LIST,
      payload: {},
      expiresAt: new Date().toISOString(),
      attempts: 0,
    };

    const result = await executor.execute(cmd);
    expect(result.status).toBe('COMPLETED');
    expect(result.result?.total).toBeGreaterThan(0);
    expect(result.result?.sessions).toHaveLength(1);
  });

  it('should sanitize errors and not leak passwords in error messages', async () => {
    const failingWorker = {
      ...mockWorker,
      getHealth: jest.fn().mockRejectedValue(new Error('Failed connecting with password=secret_password_123')),
    };
    const failingExecutor = new CommandExecutor(failingWorker as any);

    const cmd: CommandItem = {
      id: 'cmd-err',
      operationId: 'op-err',
      type: AgentCommandType.ROUTER_HEALTH,
      payload: {},
      expiresAt: new Date().toISOString(),
      attempts: 0,
    };

    const result = await failingExecutor.execute(cmd);
    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).not.toContain('secret_password_123');
    expect(result.errorMessage).toContain('password=***');
  });
});
