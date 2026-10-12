import * as os from 'os';
import { CredentialVault } from '../security/credential-vault';
import { ApiClient, AgentRevokedError } from '../transport/api-client';
import { IRouterWorker } from '../router/interfaces/router-worker.interface';
import { CommandExecutor } from '../executor/command-executor';
import {
  AgentConfigFile,
  AgentState,
  HeartbeatMetrics,
  StoredCredentials,
} from '../types';

export class AgentDaemon {
  private state: AgentState = 'STARTING';
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isProcessingHeartbeat = false;
  private lastPingAt: Date | null = null;
  private startedAt: Date = new Date();
  private routerOnline = false;

  constructor(
    private readonly config: AgentConfigFile,
    private readonly vault: CredentialVault,
    private readonly apiClient: ApiClient,
    private readonly routerWorker: IRouterWorker,
    private readonly commandExecutor: CommandExecutor,
    private readonly version = '0.1.0',
  ) {}

  getState(): AgentState {
    return this.state;
  }

  isRouterOnline(): boolean {
    return this.routerOnline;
  }

  /**
   * Pairs the agent with the backend using the provided 6-digit code.
   */
  async pair(code: string, customName?: string): Promise<StoredCredentials> {
    const name = customName ?? this.config.agentName ?? os.hostname();
    console.log(`[AgentDaemon] Pairing with backend (${this.config.serverUrl}) as "${name}"...`);

    const result = await this.apiClient.pair(code, name, this.version);

    const creds: StoredCredentials = {
      agentId: result.agentId,
      deviceId: result.deviceId,
      tenantId: result.tenantId,
      token: result.token,
      pairedAt: new Date().toISOString(),
      serverUrl: this.config.serverUrl,
      router: this.config.router,
    };

    await this.vault.save(creds);
    console.log(`[AgentDaemon] Successfully paired! Agent ID: ${result.agentId}, Router ID: ${result.deviceId}`);

    return creds;
  }

  /**
   * Initializes and starts the polling daemon.
   */
  async start(): Promise<void> {
    const creds = await this.vault.load();
    if (!creds) {
      this.state = 'UNPAIRED';
      console.warn('[AgentDaemon] Agent is not paired yet. Run with "pair --code <6-digit-code>" first.');
      return;
    }

    this.startedAt = new Date();
    this.state = 'STARTING';
    console.log(`[AgentDaemon] Starting agent (ID: ${creds.agentId}) for router ${creds.deviceId}...`);

    // Verify Router Connectivity
    try {
      this.routerOnline = await this.routerWorker.ping();
      if (this.routerOnline) {
        console.log(`[AgentDaemon] Router connection verified (${this.config.router?.host}:${this.config.router?.port})`);
      } else {
        console.warn(`[AgentDaemon] Warning: Router unreachable at ${this.config.router?.host}. Will retry during operation.`);
      }
    } catch (err: any) {
      console.warn(`[AgentDaemon] Warning: Router check failed: ${err.message}`);
      this.routerOnline = false;
    }

    this.state = 'ONLINE';
    // Trigger initial heartbeat immediately
    await this.tickHeartbeat(creds);

    // Schedule periodic heartbeat loop
    const intervalMs = this.config.heartbeatIntervalMs ?? 25000;
    this.heartbeatTimer = setInterval(async () => {
      await this.tickHeartbeat(creds);
    }, intervalMs);

    // Allow process to exit cleanly if timer is the only active handle
    if (this.heartbeatTimer.unref) {
      this.heartbeatTimer.unref();
    }
  }

  /**
   * Single heartbeat tick: sends presence, metrics, and executes pending commands.
   */
  async tickHeartbeat(creds: StoredCredentials): Promise<void> {
    if (this.isProcessingHeartbeat || this.state === 'STOPPED' || this.state === 'REVOKED') {
      return;
    }

    this.isProcessingHeartbeat = true;
    try {
      const metrics = this.collectMetrics();
      const heartbeatRes = await this.apiClient.sendHeartbeat(creds.token, metrics, this.version);

      this.lastPingAt = new Date();
      if (this.state !== 'ONLINE') {
        console.log('[AgentDaemon] Reconnected to backend. Status: ONLINE');
        this.state = 'ONLINE';
      }

      // Check and execute pending commands received from heartbeat
      if (heartbeatRes.pendingCommands && heartbeatRes.pendingCommands.length > 0) {
        console.log(`[AgentDaemon] Received ${heartbeatRes.pendingCommands.length} command(s) to execute`);

        for (const cmd of heartbeatRes.pendingCommands) {
          try {
            console.log(`[AgentDaemon] Executing command [${cmd.id}] (${cmd.type}) with opId [${cmd.operationId}]...`);
            const execResult = await this.commandExecutor.execute(cmd);

            // Report execution result to backend
            await this.apiClient.submitCommandResult(creds.token, cmd.id, execResult);
            console.log(`[AgentDaemon] Command [${cmd.id}] outcome: ${execResult.status}`);
          } catch (cmdErr: any) {
            console.error(`[AgentDaemon] Error processing command [${cmd.id}]: ${cmdErr.message}`);
          }
        }
      }
    } catch (err: any) {
      if (err instanceof AgentRevokedError) {
        this.state = 'REVOKED';
        console.error('[AgentDaemon] CRITICAL: Agent token has been revoked by admin. Stopping agent.');
        await this.stop();
        return;
      }

      if (this.state === 'ONLINE') {
        console.warn(`[AgentDaemon] Connection to backend interrupted (${err.message}). Transitioning to RECONNECTING...`);
        this.state = 'RECONNECTING';
      }
    } finally {
      this.isProcessingHeartbeat = false;
    }
  }

  private collectMetrics(): HeartbeatMetrics {
    const mem = process.memoryUsage();
    const uptimeSec = Math.round((Date.now() - this.startedAt.getTime()) / 1000);
    return {
      uptimeSeconds: uptimeSec,
      agentUptimeSeconds: uptimeSec,
      memoryUsage: Math.round(mem.heapUsed / (1024 * 1024)), // MB
      freeMemoryBytes: os.freemem(),
    };
  }

  /**
   * Stops the agent daemon and disconnects router socket.
   */
  async stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.state !== 'REVOKED') {
      this.state = 'STOPPED';
    }
    await this.routerWorker.disconnect();
    console.log('[AgentDaemon] Agent stopped.');
  }

  getStatus() {
    return {
      state: this.state,
      routerOnline: this.routerOnline,
      lastPingAt: this.lastPingAt,
      uptimeSeconds: Math.round((Date.now() - this.startedAt.getTime()) / 1000),
      serverUrl: this.config.serverUrl,
    };
  }
}
