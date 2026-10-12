import { AgentDaemon } from './agent-daemon';
import { CredentialVault } from '../security/credential-vault';
import { ApiClient, AgentRevokedError } from '../transport/api-client';
import { MockRouterWorker } from '../router/mock-router-worker';
import { CommandExecutor } from '../executor/command-executor';
import { AgentCommandType, CommandItem, StoredCredentials } from '../types';

describe('AgentDaemon Integration Tests', () => {
  let vault: jest.Mocked<CredentialVault>;
  let apiClient: jest.Mocked<ApiClient>;
  let routerWorker: MockRouterWorker;
  let commandExecutor: CommandExecutor;
  let daemon: AgentDaemon;

  const mockCreds: StoredCredentials = {
    agentId: 'agent-uuid-1',
    deviceId: 'device-uuid-1',
    tenantId: 'tenant-uuid-1',
    token: 'token-64-hex',
    pairedAt: new Date().toISOString(),
    serverUrl: 'http://localhost:3000/api/v1',
    router: { host: '192.168.88.1', port: 8728, username: 'admin' },
  };

  beforeEach(() => {
    vault = {
      load: jest.fn().mockResolvedValue(mockCreds),
      save: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
      isPaired: jest.fn().mockResolvedValue(true),
      getFilePath: jest.fn().mockReturnValue('/mock/path'),
    } as any;

    apiClient = {
      pair: jest.fn().mockResolvedValue({
        agentId: 'new-agent-id',
        deviceId: 'new-device-id',
        tenantId: 'new-tenant-id',
        token: 'new-token',
      }),
      sendHeartbeat: jest.fn().mockResolvedValue({
        serverTime: new Date().toISOString(),
        status: 'ACK',
        pendingCommands: [],
      }),
      submitCommandResult: jest.fn().mockResolvedValue({ success: true, message: 'Result recorded' }),
    } as any;

    routerWorker = new MockRouterWorker();
    commandExecutor = new CommandExecutor(routerWorker);

    daemon = new AgentDaemon(
      {
        serverUrl: 'http://localhost:3000/api/v1',
        agentName: 'Test-PC',
        heartbeatIntervalMs: 5000,
        mockRouter: true,
      },
      vault,
      apiClient,
      routerWorker,
      commandExecutor,
      '0.1.0',
    );
  });

  afterEach(async () => {
    await daemon.stop();
  });

  it('should pair successfully and save encrypted credentials', async () => {
    const creds = await daemon.pair('654321', 'Custom-POS');

    expect(apiClient.pair).toHaveBeenCalledWith('654321', 'Custom-POS', '0.1.0');
    expect(vault.save).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'new-agent-id',
        deviceId: 'new-device-id',
        token: 'new-token',
      }),
    );
    expect(creds.agentId).toBe('new-agent-id');
  });

  it('should transition to UNPAIRED if no credentials exist in vault', async () => {
    vault.load.mockResolvedValueOnce(null);

    await daemon.start();
    expect(daemon.getState()).toBe('UNPAIRED');
  });

  it('should start, verify router connectivity, and transition to ONLINE', async () => {
    await daemon.start();

    expect(daemon.getState()).toBe('ONLINE');
    expect(daemon.isRouterOnline()).toBe(true);
    expect(apiClient.sendHeartbeat).toHaveBeenCalledWith('token-64-hex', expect.any(Object), '0.1.0');
  });

  it('should receive pending command from heartbeat, execute it, and submit result', async () => {
    const pendingCmd: CommandItem = {
      id: 'cmd-batch-1',
      operationId: 'op-batch-1',
      type: AgentCommandType.HOTSPOT_BATCH_ADD,
      payload: {
        users: [{ name: 'card_user_01', password: '123' }],
      },
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      attempts: 0,
    };

    apiClient.sendHeartbeat.mockResolvedValueOnce({
      serverTime: new Date().toISOString(),
      status: 'ACK',
      pendingCommands: [pendingCmd],
    });

    await daemon.start();

    // Verify command was executed on router
    expect(routerWorker.hasUser('card_user_01')).toBe(true);

    // Verify result was reported to backend
    expect(apiClient.submitCommandResult).toHaveBeenCalledWith(
      'token-64-hex',
      'cmd-batch-1',
      expect.objectContaining({
        operationId: 'op-batch-1',
        status: 'COMPLETED',
        result: expect.objectContaining({
          createdCount: 1,
        }),
      }),
    );
  });

  it('should transition to RECONNECTING on backend network drop and return to ONLINE when restored', async () => {
    await daemon.start();
    expect(daemon.getState()).toBe('ONLINE');

    // Simulate backend network outage (Render sleep or internet drop)
    apiClient.sendHeartbeat.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await daemon.tickHeartbeat(mockCreds);
    expect(daemon.getState()).toBe('RECONNECTING');

    // Restore backend connection
    apiClient.sendHeartbeat.mockResolvedValueOnce({
      serverTime: new Date().toISOString(),
      status: 'ACK',
      pendingCommands: [],
    });
    await daemon.tickHeartbeat(mockCreds);
    expect(daemon.getState()).toBe('ONLINE');
  });

  it('should stop cleanly and transition to REVOKED when server returns revocation error', async () => {
    await daemon.start();
    expect(daemon.getState()).toBe('ONLINE');

    // Simulate admin revoked the token
    apiClient.sendHeartbeat.mockRejectedValueOnce(new AgentRevokedError('Token revoked'));
    await daemon.tickHeartbeat(mockCreds);

    expect(daemon.getState()).toBe('REVOKED');
  });

  it('should handle duplicate command execution safely via reconciliation (Lost Ack recovery)', async () => {
    const cmd: CommandItem = {
      id: 'cmd-lost-ack',
      operationId: 'op-lost-ack',
      type: AgentCommandType.HOTSPOT_BATCH_ADD,
      payload: {
        users: [{ name: 'existing_user', password: '123' }],
      },
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      attempts: 1,
    };

    // User was already created on router in prior attempt
    await routerWorker.batchAddHotspotUsers([{ name: 'existing_user', password: '123' }]);

    apiClient.sendHeartbeat.mockResolvedValueOnce({
      serverTime: new Date().toISOString(),
      status: 'ACK',
      pendingCommands: [cmd],
    });

    await daemon.start();

    // Reconciled without error: alreadyExistingCount = 1
    expect(apiClient.submitCommandResult).toHaveBeenCalledWith(
      'token-64-hex',
      'cmd-lost-ack',
      expect.objectContaining({
        operationId: 'op-lost-ack',
        status: 'COMPLETED',
        result: expect.objectContaining({
          alreadyExistingCount: 1,
          createdCount: 0,
        }),
      }),
    );
  });
});
