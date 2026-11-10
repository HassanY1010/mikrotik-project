import { RouterOsRestClient } from './routeros-rest.client';

describe('RouterOsRestClient REST API Compliance & Removal Operations (RouterOS 7.19)', () => {
  let client: RouterOsRestClient;
  let originalFetch: any;

  beforeEach(() => {
    client = new RouterOsRestClient({
      host: '192.168.88.1',
      port: 443,
      username: 'admin',
      password: 'password123',
      useSsl: true,
    });

    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should correctly format POST to /rest/ip/address/remove with payload containing only numbers parameter', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;

    global.fetch = jest.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;

      // Mock RouterOS 7 system resource for initial connection/handshake
      if (url.includes('/rest/system/resource')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ version: '7.19.1', uptime: '1d' }),
          text: async () => JSON.stringify({ version: '7.19.1', uptime: '1d' }),
          headers: new Headers(),
        } as any;
      }

      // Mock successful response from RouterOS 7 REST remove command
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => '{}',
        headers: new Headers(),
      } as any;
    });

    const commandWords = ['/ip/address/remove', '=.id=*2'];
    const result = await client.runRawCommand(commandWords);

    expect(result).toBeDefined();

    // 1. Verify URL complies with RouterOS 7 REST CLI endpoint
    expect(capturedUrl).toBe('https://192.168.88.1:443/rest/ip/address/remove');

    // 2. Verify HTTP Method is POST (RouterOS 7 CLI commands via REST use POST)
    expect(capturedInit?.method).toBe('POST');

    // 3. Verify Headers include Content-Type and Authorization
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Authorization']).toBeDefined();
    expect(headers['Authorization']).toContain('Basic ');

    // 4. Verify Payload: numbers parameter is set, and extraneous .id is stripped
    const parsedBody = JSON.parse(capturedInit?.body as string);
    expect(parsedBody).toEqual({ numbers: '*2' });
    expect(parsedBody['.id']).toBeUndefined();
  });

  it('should correctly format POST to /rest/interface/bridge/port/remove with numbers parameter', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;

    global.fetch = jest.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;

      if (url.includes('/rest/system/resource')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ version: '7.19.1' }),
          text: async () => JSON.stringify({ version: '7.19.1' }),
          headers: new Headers(),
        } as any;
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => '{}',
        headers: new Headers(),
      } as any;
    });

    const commandWords = ['/interface/bridge/port/remove', '=numbers=*1'];
    await client.runRawCommand(commandWords);

    expect(capturedUrl).toBe('https://192.168.88.1:443/rest/interface/bridge/port/remove');
    expect(capturedInit?.method).toBe('POST');
    const parsedBody = JSON.parse(capturedInit?.body as string);
    expect(parsedBody).toEqual({ numbers: '*1' });
    expect(parsedBody['.id']).toBeUndefined();
  });

  it('should handle HTTP 204 No Content as successful removal', async () => {
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('/rest/system/resource')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ version: '7.19.1' }),
          text: async () => JSON.stringify({ version: '7.19.1' }),
          headers: new Headers(),
        } as any;
      }
      return {
        ok: true,
        status: 204,
        json: async () => undefined,
        text: async () => '',
        headers: new Headers(),
      } as any;
    });

    const res = await client.runRawCommand(['/ip/address/remove', '=.id=*A1']);
    expect(res).toBeUndefined();
  });

  it('should throw Error when RouterOS REST returns HTTP 400 Bad Request with error detail', async () => {
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('/rest/system/resource')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ version: '7.19.1' }),
          text: async () => JSON.stringify({ version: '7.19.1' }),
          headers: new Headers(),
        } as any;
      }
      return {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ detail: 'invalid number', error: 400 }),
        text: async () => JSON.stringify({ detail: 'invalid number', error: 400 }),
        headers: new Headers(),
      } as any;
    });

    await expect(client.runRawCommand(['/ip/address/remove', '=.id=*99'])).rejects.toThrow(
      /MikroTik REST request to \/ip\/address\/remove failed.*400/,
    );
  });

  it('should throw Error when RouterOS REST returns HTTP 404 Not Found', async () => {
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('/rest/system/resource')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ version: '7.19.1' }),
          text: async () => JSON.stringify({ version: '7.19.1' }),
          headers: new Headers(),
        } as any;
      }
      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ detail: 'no such item', error: 404 }),
        text: async () => JSON.stringify({ detail: 'no such item', error: 404 }),
        headers: new Headers(),
      } as any;
    });

    await expect(client.runRawCommand(['/ip/address/remove', '=.id=*2B'])).rejects.toThrow(
      /MikroTik REST request to \/ip\/address\/remove failed.*404/,
    );
  });

  it('should strictly reject removal before network request when ID is missing or has invalid syntax', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy;

    // Missing ID
    await expect(client.runRawCommand(['/ip/address/remove'])).rejects.toThrow(
      /معرف RouterOS غير صالح للحذف عبر REST/,
    );

    // Invalid non-hex ID
    await expect(client.runRawCommand(['/ip/address/remove', '=.id=not-hex-id'])).rejects.toThrow(
      /معرف RouterOS غير صالح للحذف عبر REST/,
    );

    // Raw IP address passed as ID (the old forbidden fallback)
    await expect(client.runRawCommand(['/ip/address/remove', '=.id=10.5.50.1'])).rejects.toThrow(
      /معرف RouterOS غير صالح للحذف عبر REST/,
    );

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
