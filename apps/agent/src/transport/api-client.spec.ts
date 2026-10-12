import { ApiClient, AgentRevokedError } from './api-client';

describe('ApiClient', () => {
  let client: ApiClient;
  const originalFetch = global.fetch;

  beforeEach(() => {
    client = new ApiClient({
      serverUrl: 'http://mock-api.test/api/v1',
      httpTimeoutMs: 1000,
      maxRetries: 2,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should successfully execute pairing request', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        agentId: 'ag-1',
        deviceId: 'dev-1',
        tenantId: 'ten-1',
        token: 'token-64-hex',
      }),
    });

    const res = await client.pair('123456', 'POS-PC', '0.1.0');
    expect(res.agentId).toBe('ag-1');
    expect(res.token).toBe('token-64-hex');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://mock-api.test/api/v1/agent/pair',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ pairingCode: '123456', code: '123456', name: 'POS-PC', version: '0.1.0' }),
      }),
    );
  });

  it('should detect 401 revoked token and throw AgentRevokedError', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Agent access has been revoked' }),
    });

    await expect(
      client.sendHeartbeat('revoked-token', { memoryUsage: 10 }),
    ).rejects.toThrow(AgentRevokedError);
  });

  it('should successfully submit command result', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, message: 'Command result recorded' }),
    });

    const res = await client.submitCommandResult('valid-token', 'cmd-1', {
      operationId: 'op-1',
      status: 'COMPLETED',
      result: { ok: true },
    });

    expect(res.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://mock-api.test/api/v1/agent/commands/cmd-1/result',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer valid-token',
        }),
      }),
    );
  });

  it('should retry on transient network failures and succeed', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ serverTime: new Date().toISOString(), status: 'ACK', pendingCommands: [] }),
      });

    const res = await client.sendHeartbeat('valid-token');
    expect(res.status).toBe('ACK');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
