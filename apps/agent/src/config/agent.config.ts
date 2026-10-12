import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AgentConfigFile, RouterConfig } from '../types';

export class AgentConfigManager {
  private config: AgentConfigFile;

  constructor(customConfigPath?: string) {
    this.config = this.loadConfig(customConfigPath);
  }

  private loadConfig(customConfigPath?: string): AgentConfigFile {
    let fileConfig: Partial<AgentConfigFile> = {};

    const candidatePaths = [
      customConfigPath,
      path.join(process.cwd(), 'agent.config.json'),
      process.env.APPDATA ? path.join(process.env.APPDATA, 'SudaFiAgent', 'agent.config.json') : undefined,
    ].filter(Boolean) as string[];

    for (const filePath of candidatePaths) {
      if (fs.existsSync(filePath)) {
        try {
          const raw = fs.readFileSync(filePath, 'utf8');
          fileConfig = JSON.parse(raw);
          break;
        } catch {
          // Ignore invalid JSON in file and continue to defaults/env
        }
      }
    }

    const defaultRouter: RouterConfig = {
      host: process.env.ROUTER_HOST ?? fileConfig.router?.host ?? '192.168.88.1',
      port: Number(process.env.ROUTER_PORT ?? fileConfig.router?.port ?? 8728),
      username: process.env.ROUTER_USER ?? fileConfig.router?.username ?? 'admin',
      password: process.env.ROUTER_PASS ?? fileConfig.router?.password ?? '',
      useSsl: (process.env.ROUTER_SSL === 'true') || (fileConfig.router?.useSsl ?? false),
      timeoutMs: Number(process.env.ROUTER_TIMEOUT_MS ?? fileConfig.router?.timeoutMs ?? 10000),
      rosVersion: (process.env.ROUTER_ROS_VERSION ?? fileConfig.router?.rosVersion ?? 'v7') as 'v6' | 'v7',
    };

    return {
      serverUrl:
        process.env.SUDAFI_SERVER_URL ??
        fileConfig.serverUrl ??
        'http://localhost:3000/api/v1',
      agentName:
        process.env.SUDAFI_AGENT_NAME ??
        fileConfig.agentName ??
        os.hostname(),
      heartbeatIntervalMs:
        Number(process.env.SUDAFI_HEARTBEAT_INTERVAL_MS ?? fileConfig.heartbeatIntervalMs ?? 25000),
      httpTimeoutMs:
        Number(process.env.SUDAFI_HTTP_TIMEOUT_MS ?? fileConfig.httpTimeoutMs ?? 60000), // 60s for Render Cold Start
      maxRetries:
        Number(process.env.SUDAFI_MAX_RETRIES ?? fileConfig.maxRetries ?? 5),
      mockRouter:
        process.env.MOCK_ROUTER === 'true' || fileConfig.mockRouter === true,
      router: defaultRouter,
    };
  }

  get(): AgentConfigFile {
    return { ...this.config };
  }

  setMockRouter(enabled: boolean): void {
    this.config.mockRouter = enabled;
  }

  setServerUrl(url: string): void {
    this.config.serverUrl = url;
  }

  setRouterConfig(router: RouterConfig): void {
    this.config.router = router;
  }
}
