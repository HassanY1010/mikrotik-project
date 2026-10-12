import { CommandExecutor } from './command-executor';
import { MockRouterWorker } from '../router/mock-router-worker';
import { AgentCommandType, CommandItem } from '../types';

describe('Hotspot Portal Command Executor (Task 5.1)', () => {
  let worker: MockRouterWorker;
  let executor: CommandExecutor;

  beforeEach(() => {
    worker = new MockRouterWorker();
    executor = new CommandExecutor(worker);
  });

  it('should successfully publish captive portal files to router', async () => {
    const command: CommandItem = {
      id: 'cmd-portal-1',
      operationId: 'op-portal-publish-1',
      type: AgentCommandType.HOTSPOT_PORTAL_PUBLISH,
      payload: {
        directoryName: 'hotspot-sudafi',
        files: [
          { name: 'login.html', content: '<html><body><h1>$(error)</h1><form action="$(link-login-only)"></form></body></html>' },
          { name: 'status.html', content: '<html><body>Status: $(username)</body></html>' },
          { name: 'style.css', content: 'body { background: #0f172a; }' },
        ],
        applyToProfile: 'hsprof1',
      },
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      attempts: 0,
    };

    const res = await executor.execute(command);

    expect(res.status).toBe('COMPLETED');
    expect(res.operationId).toBe('op-portal-publish-1');
    expect(res.result).toBeDefined();
    expect(res.result!.published).toBe(true);
    expect(res.result!.directory).toBe('hotspot-sudafi');
    expect(res.result!.filesWritten).toEqual(['login.html', 'status.html', 'style.css']);
    expect(res.result!.profileUpdated).toBe('hsprof1');

    // Verify stored in mock worker
    expect(worker.hasHotspotFile('hotspot-sudafi/login.html')).toBe(true);
    expect(worker.getHotspotFile('hotspot-sudafi/login.html')).toContain('$(link-login-only)');
    expect(worker.getHotspotFile('hotspot-sudafi/style.css')).toBe('body { background: #0f172a; }');
  });

  it('should fail when files payload is missing or empty', async () => {
    const command: CommandItem = {
      id: 'cmd-portal-2',
      operationId: 'op-portal-publish-2',
      type: AgentCommandType.HOTSPOT_PORTAL_PUBLISH,
      payload: {
        directoryName: 'hotspot',
        files: [],
      },
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      attempts: 0,
    };

    const res = await executor.execute(command);

    expect(res.status).toBe('FAILED');
    expect(res.errorMessage).toContain('files');
  });

  it('should fail safely when directory name attempts traversal attack', async () => {
    const command: CommandItem = {
      id: 'cmd-portal-3',
      operationId: 'op-portal-publish-3',
      type: AgentCommandType.HOTSPOT_PORTAL_PUBLISH,
      payload: {
        directoryName: '../etc/hotspot',
        files: [{ name: 'login.html', content: 'test' }],
      },
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      attempts: 0,
    };

    const res = await executor.execute(command);

    expect(res.status).toBe('FAILED');
    expect(res.errorMessage).toContain('Invalid directory name');
  });
});
