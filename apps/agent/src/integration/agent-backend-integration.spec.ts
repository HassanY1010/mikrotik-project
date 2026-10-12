import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { AddressInfo } from 'net';
import { ApiClient } from '../transport/api-client';
import { CredentialVault } from '../security/credential-vault';
import { MockRouterWorker } from '../router/mock-router-worker';
import { CommandExecutor } from '../executor/command-executor';
import { AgentDaemon } from '../service/agent-daemon';
import { AgentCommandType, CommandItem } from '../types';

describe('Agent-to-Backend Full Integration Suite (HTTP Loopback)', () => {
  let server: http.Server;
  let serverUrl: string;
  let tempDir: string;
  let vault: CredentialVault;
  let mockWorker: MockRouterWorker;
  let executor: CommandExecutor;
  let daemon: AgentDaemon;

  // Server state simulator
  const activePairingCodes = new Map<string, { deviceId: string; tenantId: string }>();
  const activeTokens = new Set<string>();
  const revokedTokens = new Set<string>();
  let queuedCommandsForHeartbeat: CommandItem[] = [];
  const recordedResults: Array<{ commandId: string; result: any }> = [];
  let simulateNetworkOutage = false;

  beforeAll(async () => {
    activePairingCodes.set('112233', { deviceId: 'dev-100', tenantId: 'ten-200' });

    server = http.createServer((req, res) => {
      if (simulateNetworkOutage) {
        req.destroy();
        return;
      }

      const url = req.url ?? '';
      const authHeader = req.headers['authorization'] ?? '';
      const token = authHeader.replace(/^Bearer\s+/, '').trim();

      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });

      req.on('end', () => {
        const parsedBody = body ? JSON.parse(body) : {};

        // 1. Pairing endpoint
        if (req.method === 'POST' && url === '/agent/pair') {
          const code = parsedBody.pairingCode || parsedBody.code;
          if (activePairingCodes.has(code)) {
            const meta = activePairingCodes.get(code)!;
            const issuedToken = 'valid-token-' + Math.random().toString(16).substring(2);
            activeTokens.add(issuedToken);
            activePairingCodes.delete(code); // One-time use

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                agentId: 'ag-test-1',
                deviceId: meta.deviceId,
                tenantId: meta.tenantId,
                token: issuedToken,
              }),
            );
            return;
          } else {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ statusCode: 401, message: 'Invalid or expired pairing code' }));
            return;
          }
        }

        // Auth check for protected agent endpoints
        if (revokedTokens.has(token)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ statusCode: 401, message: 'Agent access has been revoked' }));
          return;
        }

        if (!activeTokens.has(token)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ statusCode: 401, message: 'Invalid token' }));
          return;
        }

        // 2. Heartbeat endpoint
        if (req.method === 'POST' && url === '/agent/heartbeat') {
          const pending = [...queuedCommandsForHeartbeat];
          queuedCommandsForHeartbeat = []; // Dispatched

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              serverTime: new Date().toISOString(),
              status: 'ACK',
              pendingCommands: pending,
            }),
          );
          return;
        }

        // 3. Command Result submission
        if (req.method === 'POST' && url.startsWith('/agent/commands/') && url.endsWith('/result')) {
          const parts = url.split('/');
          const commandId = parts[3];
          recordedResults.push({ commandId, result: parsedBody });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Command result recorded' }));
          return;
        }

        // Not found
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ statusCode: 404, message: 'Route not found' }));
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const addr = server.address() as AddressInfo;
    serverUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `sudafi-integ-${Date.now()}-${Math.random()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    vault = new CredentialVault(tempDir);
    vault.setForceFallback(true); // Deterministic test vault

    const apiClient = new ApiClient({
      serverUrl,
      httpTimeoutMs: 2000,
      maxRetries: 2,
    });

    mockWorker = new MockRouterWorker();
    executor = new CommandExecutor(mockWorker);

    daemon = new AgentDaemon(
      {
        serverUrl,
        agentName: 'Integration-PC',
        heartbeatIntervalMs: 2000,
        mockRouter: true,
      },
      vault,
      apiClient,
      mockWorker,
      executor,
      '0.1.0',
    );

    simulateNetworkOutage = false;
    queuedCommandsForHeartbeat = [];
    recordedResults.length = 0;
  });

  afterEach(async () => {
    await daemon.stop();
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore
    }
  });

  it('1. should pair and authenticate successfully using valid pairing code', async () => {
    const creds = await daemon.pair('112233', 'POS-Store-1');
    expect(creds.agentId).toBe('ag-test-1');
    expect(creds.deviceId).toBe('dev-100');
    expect(creds.token).toBeDefined();

    expect(await vault.isPaired()).toBe(true);
  });

  it('2. should reject pairing attempt with invalid or expired code', async () => {
    await expect(daemon.pair('999999', 'Fake-PC')).rejects.toThrow('Invalid or expired pairing code');
    expect(await vault.isPaired()).toBe(false);
  });

  it('3. should start daemon, send periodic heartbeat, and report status ONLINE', async () => {
    activePairingCodes.set('555666', { deviceId: 'dev-2', tenantId: 'ten-2' });
    await daemon.pair('555666');

    await daemon.start();
    expect(daemon.getState()).toBe('ONLINE');
    expect(daemon.getStatus().routerOnline).toBe(true);
  });

  it('4. should receive whitelisted command, execute on router, and submit result to backend', async () => {
    activePairingCodes.set('777888', { deviceId: 'dev-3', tenantId: 'ten-3' });
    const creds = await daemon.pair('777888');

    // Queue command on mock server
    const cmd: CommandItem = {
      id: 'cmd-integ-1',
      operationId: '11111111-2222-3333-4444-555555555555',
      type: AgentCommandType.HOTSPOT_BATCH_ADD,
      payload: {
        users: [
          { name: 'user_card_1', password: 'p1', profile: 'default', comment: 'batch-test' },
          { name: 'user_card_2', password: 'p2', profile: 'default', comment: 'batch-test' },
        ],
      },
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      attempts: 0,
    };
    queuedCommandsForHeartbeat.push(cmd);

    // Run heartbeat tick
    await daemon.tickHeartbeat(creds);

    // Verify router state
    expect(mockWorker.hasUser('user_card_1')).toBe(true);
    expect(mockWorker.hasUser('user_card_2')).toBe(true);

    // Verify result was recorded on server
    expect(recordedResults).toHaveLength(1);
    expect(recordedResults[0].commandId).toBe('cmd-integ-1');
    expect(recordedResults[0].result.status).toBe('COMPLETED');
    expect(recordedResults[0].result.result.createdCount).toBe(2);
  });

  it('5. should handle lost ack and re-dispatch with idempotent reconciliation without duplicating cards', async () => {
    activePairingCodes.set('333444', { deviceId: 'dev-4', tenantId: 'ten-4' });
    const creds = await daemon.pair('333444');

    const cmd: CommandItem = {
      id: 'cmd-lost-ack',
      operationId: '22222222-3333-4444-5555-666666666666',
      type: AgentCommandType.HOTSPOT_BATCH_ADD,
      payload: {
        users: [{ name: 'dup_card', password: 'p1', profile: 'default', comment: 'batch-dup' }],
      },
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      attempts: 0,
    };

    // First execution
    queuedCommandsForHeartbeat.push(cmd);
    await daemon.tickHeartbeat(creds);
    expect(recordedResults[0].result.result.createdCount).toBe(1);

    // Simulate server re-dispatching same command (Lost Ack scenario)
    queuedCommandsForHeartbeat.push({ ...cmd, attempts: 1 });
    await daemon.tickHeartbeat(creds);

    // Reconciliation safely reconciled without failure or duplicates
    expect(recordedResults).toHaveLength(2);
    expect(recordedResults[1].result.result.createdCount).toBe(0);
    expect(recordedResults[1].result.result.alreadyExistingCount).toBe(1);
    expect(mockWorker.getUserCount()).toBe(1);
  });

  it('6. should reject unwhitelisted arbitrary command without executing it on router', async () => {
    activePairingCodes.set('123123', { deviceId: 'dev-5', tenantId: 'ten-5' });
    const creds = await daemon.pair('123123');

    const dangerousCmd: CommandItem = {
      id: 'cmd-danger',
      operationId: '33333333-4444-5555-6666-777777777777',
      type: 'system.terminal.exec' as any,
      payload: { command: '/system reboot' },
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      attempts: 0,
    };
    queuedCommandsForHeartbeat.push(dangerousCmd);

    await daemon.tickHeartbeat(creds);

    expect(recordedResults).toHaveLength(1);
    expect(recordedResults[0].result.status).toBe('FAILED');
    expect(recordedResults[0].result.errorMessage).toContain('Forbidden or unsupported command type');
  });

  it('7. should recover after network outage (transition ONLINE -> RECONNECTING -> ONLINE)', async () => {
    activePairingCodes.set('987654', { deviceId: 'dev-6', tenantId: 'ten-6' });
    const creds = await daemon.pair('987654');

    await daemon.start();
    expect(daemon.getState()).toBe('ONLINE');

    // Simulate network drop
    simulateNetworkOutage = true;
    await daemon.tickHeartbeat(creds);
    expect(daemon.getState()).toBe('RECONNECTING');

    // Restore network
    simulateNetworkOutage = false;
    await daemon.tickHeartbeat(creds);
    expect(daemon.getState()).toBe('ONLINE');
  });

  it('8. should transition to REVOKED and stop immediately when token is revoked on backend', async () => {
    activePairingCodes.set('456789', { deviceId: 'dev-7', tenantId: 'ten-7' });
    const creds = await daemon.pair('456789');

    await daemon.start();
    expect(daemon.getState()).toBe('ONLINE');

    // Revoke token on server
    revokedTokens.add(creds.token);
    await daemon.tickHeartbeat(creds);

    expect(daemon.getState()).toBe('REVOKED');
  });
});
