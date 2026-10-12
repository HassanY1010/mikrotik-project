import {
  HeartbeatMetrics,
  HeartbeatResponse,
  SubmitResultPayload,
} from '../types';

export class AgentRevokedError extends Error {
  constructor(message = 'Agent has been revoked by the administrator') {
    super(message);
    this.name = 'AgentRevokedError';
  }
}

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export interface ApiClientConfig {
  serverUrl: string;
  httpTimeoutMs?: number;
  maxRetries?: number;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.serverUrl.replace(/\/+$/, '');
    this.timeoutMs = config.httpTimeoutMs ?? 60000; // 60s default for Render cold starts
    this.maxRetries = config.maxRetries ?? 5;
  }

  /**
   * Helper that executes an HTTP request with exponential backoff and timeout.
   */
  private async executeWithRetry<T>(
    operationName: string,
    requestFn: () => Promise<Response>,
  ): Promise<T> {
    let attempt = 0;
    const baseDelay = 2000;
    const maxDelay = 30000;

    while (true) {
      attempt++;
      try {
        const response = await requestFn();

        if (response.status === 401) {
          const body: any = await response.json().catch(() => ({}));
          const errMsg = body?.message ?? 'Unauthorized';
          if (errMsg.toLowerCase().includes('revoked')) {
            throw new AgentRevokedError(errMsg);
          }
          throw new AuthenticationError(`Authentication failed (401): ${errMsg}`);
        }

        if (!response.ok) {
          const body: any = await response.json().catch(() => ({}));
          const errMsg = body?.message ?? `HTTP ${response.status} ${response.statusText}`;
          // 4xx client errors (except 408/429) shouldn't be retried indefinitely
          if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
            throw new Error(errMsg);
          }
          throw new Error(`Server returned error status ${response.status}: ${errMsg}`);
        }

        return (await response.json()) as T;
      } catch (err: any) {
        if (err instanceof AgentRevokedError || err instanceof AuthenticationError) {
          throw err;
        }

        if (attempt >= this.maxRetries) {
          throw new Error(`[${operationName}] Failed after ${attempt} attempts: ${err.message}`);
        }

        // Exponential backoff with random jitter
        const delay = Math.min(maxDelay, baseDelay * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 1000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Pairs the agent with the backend using the 6-digit one-time code.
   */
  async pair(
    code: string,
    name: string,
    version?: string,
  ): Promise<{ agentId: string; deviceId: string; tenantId: string; token: string }> {
    const url = `${this.baseUrl}/agent/pair`;

    const res = await this.executeWithRetry<any>('Agent Pairing', () =>
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ pairingCode: code, code, name, version }),
        signal: AbortSignal.timeout(this.timeoutMs),
      }),
    );

    return {
      agentId: res.agentId,
      deviceId: res.deviceId,
      tenantId: res.tenantId,
      token: res.token || res.agentToken,
    };
  }

  /**
   * Sends a periodic heartbeat to the server and retrieves queued commands.
   */
  async sendHeartbeat(
    token: string,
    metrics?: HeartbeatMetrics,
    version?: string,
  ): Promise<HeartbeatResponse> {
    const url = `${this.baseUrl}/agent/heartbeat`;

    const res: any = await this.executeWithRetry<any>('Heartbeat', () =>
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ metrics, version }),
        signal: AbortSignal.timeout(this.timeoutMs),
      }),
    );

    const payload = res?.data ?? res;
    return {
      serverTime: payload.serverTime,
      status: payload.status,
      pendingCommands: payload.pendingCommands ?? [],
    };
  }

  /**
   * Submits the execution result of a command to the backend.
   */
  async submitCommandResult(
    token: string,
    commandId: string,
    payload: SubmitResultPayload,
  ): Promise<{ success: boolean; message: string }> {
    const url = `${this.baseUrl}/agent/commands/${commandId}/result`;

    const res: any = await this.executeWithRetry<any>('Submit Result', () =>
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      }),
    );

    const data = res?.data ?? res;
    return {
      success: data.success ?? true,
      message: data.message ?? 'OK',
    };
  }
}
