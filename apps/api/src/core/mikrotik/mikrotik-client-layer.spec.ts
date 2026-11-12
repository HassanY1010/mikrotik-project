import * as net from 'net';
import * as http from 'http';
import * as crypto from 'crypto';
import { RouterOsVersion } from '@prisma/client';
import { RouterOsSocketProtocol } from './protocols/routeros-socket-protocol';
import { RouterOsApiClient } from './clients/routeros-api.client';
import { RouterOsRestClient } from './clients/routeros-rest.client';
import { MikrotikClientFactory, type DeviceConnectionConfig } from './mikrotik-client.factory';

function parseWordsFromBuffer(buf: Buffer): { sentences: string[][]; remaining: Buffer } {
  const sentences: string[][] = [];
  let current: string[] = [];
  let working = buf;

  while (working.length > 0) {
    const decoded = RouterOsSocketProtocol.decodeLength(working, 0);
    if (!decoded) break;
    const [len, hdrBytes] = decoded;
    if (working.length < hdrBytes + len) break;
    const word = working.subarray(hdrBytes, hdrBytes + len).toString('utf8');
    working = working.subarray(hdrBytes + len);
    if (word.length === 0) {
      sentences.push(current);
      current = [];
    } else {
      current.push(word);
    }
  }
  return { sentences, remaining: working };
}

async function startFakeRouterOsSocketServer(options: {
  mode: 'ROS6_MD5' | 'ROS7_PLAIN';
  expectedUser: string;
  expectedPassword: string;
  stallCommands?: boolean;
}) {
  const challengeHex = '0123456789abcdef0123456789abcdef';
  const expectedMd5 =
    '00' +
    crypto
      .createHash('md5')
      .update(Buffer.concat([Buffer.from([0x00]), Buffer.from(options.expectedPassword, 'utf8'), Buffer.from(challengeHex, 'hex')]))
      .digest('hex');

  const sockets = new Set<net.Socket>();
  let commandDelayMs = 0;

  const server = net.createServer((socket) => {
    sockets.add(socket);
    let recv: Buffer = Buffer.alloc(0);
    let authenticated = false;

    socket.on('close', () => sockets.delete(socket));
    socket.on('data', (chunk) => {
      recv = Buffer.concat([recv, chunk]);
      const parsed = parseWordsFromBuffer(recv);
      recv = parsed.remaining;

      for (const words of parsed.sentences) {
        const cmd = words[0];
        const attrs: Record<string, string> = {};
        for (const w of words.slice(1)) {
          if (w.startsWith('=')) {
            const idx = w.indexOf('=', 1);
            if (idx > 1) attrs[w.slice(1, idx)] = w.slice(idx + 1);
          }
        }

        if (cmd === '/login') {
          if (options.mode === 'ROS6_MD5' && !attrs['response']) {
            socket.write(RouterOsSocketProtocol.encodeSentence(['!done', `=ret=${challengeHex}`]));
            continue;
          }
          const valid =
            attrs['name'] === options.expectedUser &&
            (options.mode === 'ROS6_MD5'
              ? attrs['response'] === expectedMd5
              : attrs['password'] === options.expectedPassword);

          if (valid) {
            authenticated = true;
            socket.write(RouterOsSocketProtocol.encodeSentence(['!done']));
          } else {
            socket.write(
              RouterOsSocketProtocol.encodeSentence(['!trap', '=message=invalid user name or password']),
            );
          }
          continue;
        }

        if (!authenticated) {
          socket.write(RouterOsSocketProtocol.encodeSentence(['!trap', '=message=not logged in']));
          continue;
        }

        if (options.stallCommands) {
          continue; // Intentionally never reply to test timeout cleanup
        }

        const sendReply = () => {
          if (socket.destroyed) return;
          if (cmd === '/system/resource/print') {
            socket.write(
              RouterOsSocketProtocol.encodeSentence([
                '!re',
                `=version=${options.mode === 'ROS6_MD5' ? '6.49.10 (long-term)' : '7.19.1 (stable)'}`,
                '=cpu-load=22',
                '=free-memory=134217728',
                '=total-memory=268435456',
                '=free-hdd-space=67108864',
                '=total-hdd-space=134217728',
                '=uptime=3h15m10s',
                '=board-name=hAP ax^2',
              ]),
            );
            socket.write(RouterOsSocketProtocol.encodeSentence(['!done']));
          } else if (cmd === '/ip/hotspot/active/print') {
            socket.write(
              RouterOsSocketProtocol.encodeSentence([
                '!re',
                '=.id=*A1',
                '=user=card1001',
                '=address=10.5.50.25',
                '=mac-address=AA:BB:CC:DD:EE:01',
                '=uptime=5m12s',
                '=bytes-in=102400',
                '=bytes-out=204800',
              ]),
            );
            socket.write(RouterOsSocketProtocol.encodeSentence(['!done']));
          } else {
            socket.write(RouterOsSocketProtocol.encodeSentence(['!done']));
          }
        };

        if (commandDelayMs > 0) {
          setTimeout(sendReply, commandDelayMs);
        } else {
          sendReply();
        }
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as net.AddressInfo;

  return {
    port: address.port,
    setDelay: (ms: number) => {
      commandDelayMs = ms;
    },
    dropAllSockets: () => {
      for (const s of sockets) s.destroy();
      sockets.clear();
    },
    close: async () => {
      for (const s of sockets) s.destroy();
      sockets.clear();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

async function startFakeRestServer(initialPassword: string) {
  let activePassword = initialPassword;
  let resourceHits = 0;
  let simulateDown = false;

  const server = http.createServer((req, res) => {
    if (simulateDown) {
      req.destroy();
      return;
    }

    const auth = req.headers.authorization || '';
    const expected = 'Basic ' + Buffer.from(`admin:${activePassword}`, 'utf8').toString('base64');
    if (auth !== expected) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 401, message: 'Unauthorized' }));
      return;
    }

    if (req.url === '/rest/system/resource' && req.method === 'GET') {
      resourceHits++;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          version: '7.23.8 (stable)',
          'cpu-load': '18',
          'free-memory': '200000000',
          'total-memory': '512000000',
          'free-hdd-space': '50000000',
          'total-hdd-space': '128000000',
          uptime: '1d2h3m',
          'board-name': 'C52iG-5HaxD2HaxD',
        }),
      );
      return;
    }

    if (req.url === '/rest/ip/hotspot' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{ '.id': '*1', name: 'hs-sudafi', interface: 'bridge-hotspot' }]));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 404, message: 'Not found' }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as net.AddressInfo;

  return {
    port: address.port,
    getResourceHits: () => resourceHits,
    resetHits: () => {
      resourceHits = 0;
    },
    setPassword: (pw: string) => {
      activePassword = pw;
    },
    setDown: (down: boolean) => {
      simulateDown = down;
    },
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

describe('Core MikroTik Client Layer (Loopback Simulators for ROS 6 & ROS 7)', () => {
  it('connects to ROS 6 MD5 challenge binary socket simulator and executes commands cleanly', async () => {
    const sim = await startFakeRouterOsSocketServer({
      mode: 'ROS6_MD5',
      expectedUser: 'admin',
      expectedPassword: 'secret6',
    });

    const client = new RouterOsApiClient({
      host: '127.0.0.1',
      port: sim.port,
      username: 'admin',
      password: 'secret6',
      useSsl: false,
      timeoutMs: 2000,
    });

    try {
      await client.connect();
      expect(client.isConnected()).toBe(true);
      const resource = await client.getSystemResource();
      expect(resource.version).toContain('6.49.10');
      expect(resource.cpuLoad).toBe(22);
      expect(resource.boardName).toBe('hAP ax^2');
    } finally {
      await client.disconnect();
      await sim.close();
    }
  });

  it('serializes concurrent commands on the same RouterOsApiClient without response collision', async () => {
    const sim = await startFakeRouterOsSocketServer({
      mode: 'ROS7_PLAIN',
      expectedUser: 'admin',
      expectedPassword: 'secret7',
    });
    sim.setDelay(30);

    const client = new RouterOsApiClient({
      host: '127.0.0.1',
      port: sim.port,
      username: 'admin',
      password: 'secret7',
      useSsl: false,
      timeoutMs: 2000,
    });

    try {
      await client.connect();
      const [resource, sessions] = await Promise.all([
        client.getSystemResource(),
        client.listActiveSessions(),
      ]);

      expect(resource.version).toContain('7.19.1');
      expect(resource.cpuLoad).toBe(22);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].user).toBe('card1001');
    } finally {
      await client.disconnect();
      await sim.close();
    }
  });

  it('disconnects cleanly and marks client disconnected on command timeout without poisoning reconnect', async () => {
    const stalledSim = await startFakeRouterOsSocketServer({
      mode: 'ROS7_PLAIN',
      expectedUser: 'admin',
      expectedPassword: 'secret7',
      stallCommands: true,
    });

    const client = new RouterOsApiClient({
      host: '127.0.0.1',
      port: stalledSim.port,
      username: 'admin',
      password: 'secret7',
      useSsl: false,
      timeoutMs: 200,
    });

    try {
      await client.connect();
      expect(client.isConnected()).toBe(true);
      await expect(client.getSystemResource()).rejects.toThrow(/timed out/i);
      expect(client.isConnected()).toBe(false);
    } finally {
      await client.disconnect();
      await stalledSim.close();
    }
  });

  it('RouterOsRestClient skips redundant ping when already connected and invalidates connected state on 401/network failure', async () => {
    const restSim = await startFakeRestServer('pass1');
    const client = new RouterOsRestClient({
      host: '127.0.0.1',
      port: restSim.port,
      username: 'admin',
      password: 'pass1',
      useSsl: false,
      timeoutMs: 1500,
    });

    try {
      await client.connect();
      expect(client.isConnected()).toBe(true);
      expect(restSim.getResourceHits()).toBe(1);

      // listHotspotServers invokes await this.connect() internally; should NOT send extra /system/resource ping
      const servers = await client.listHotspotServers();
      expect(servers).toHaveLength(1);
      expect(restSim.getResourceHits()).toBe(1);

      // Simulate router dropping / rejecting after password change -> connected flips to false
      restSim.setPassword('pass2');
      await expect(client.listHotspotServers()).rejects.toThrow(/401|Unauthorized/i);
      expect(client.isConnected()).toBe(false);
    } finally {
      await client.disconnect();
      await restSim.close();
    }
  });

  it('MikrotikClientFactory invalidates pooled client when credentials change or socket disconnects, and recovers cleanly', async () => {
    const socketSim = await startFakeRouterOsSocketServer({
      mode: 'ROS6_MD5',
      expectedUser: 'admin',
      expectedPassword: 'pwA',
    });
    const restSim = await startFakeRestServer('pwA');

    let decrypted = 'pwA';
    const encryptionMock = {
      decrypt: jest.fn(() => decrypted),
    } as any;

    const factory = new MikrotikClientFactory(encryptionMock);

    // Note: without restPort, factory selects RouterOsApiClient (socket)
    const socketDevice: DeviceConnectionConfig = {
      id: 'dev-1',
      name: 'Lab Router',
      host: '127.0.0.1',
      apiPort: socketSim.port,
      useSsl: false,
      username: 'admin',
      passwordEncrypted: 'enc-pwA',
      iv: 'iv-1',
      authTag: 'tag-1',
      rosVersion: RouterOsVersion.V6,
    };

    try {
      // 1. Pooled socket connect works and reuses instance
      const client1 = await factory.getClient(socketDevice);
      const client1Again = await factory.getClient(socketDevice);
      expect(client1Again).toBe(client1);
      expect(client1.isConnected()).toBe(true);

      // 2. Sudden socket drop evicts/reconnects transparently on next getClient call
      socketSim.dropAllSockets();
      await new Promise((r) => setTimeout(r, 80));
      expect(client1.isConnected()).toBe(false);

      const clientReconnected = await factory.getClient(socketDevice);
      expect(clientReconnected).not.toBe(client1);
      expect(clientReconnected.isConnected()).toBe(true);
      const res = await clientReconnected.getSystemResource();
      expect(res.boardName).toBe('hAP ax^2');

      // 3. Password/protocol change via config/encrypted fields must evict old pooled client and connect with REST simulator using new password
      restSim.setPassword('pwB');
      decrypted = 'pwB';
      const restUpdatedDevice: DeviceConnectionConfig = {
        ...socketDevice,
        rosVersion: RouterOsVersion.V7,
        apiPort: 80,
        restPort: restSim.port,
        passwordEncrypted: 'enc-pwB',
      };
      const updatedClient = await factory.getClient(restUpdatedDevice);
      expect(clientReconnected.isConnected()).toBe(false);
      expect(updatedClient.isConnected()).toBe(true);
      const restResource = await updatedClient.getSystemResource();
      expect(restResource.version).toContain('7.23.8');

      // 4. REST server outage marks client disconnected so factory reconnects when recovered
      restSim.setDown(true);
      await expect(updatedClient.getSystemResource()).rejects.toThrow();
      expect(updatedClient.isConnected()).toBe(false);

      restSim.setDown(false);
      const recoveredRestClient = await factory.getClient(restUpdatedDevice);
      expect(recoveredRestClient).not.toBe(updatedClient);
      expect(recoveredRestClient.isConnected()).toBe(true);

      // 5. Explicit invalidateClient disconnects and clears entry
      await factory.invalidateClient(socketDevice.id);
      expect(recoveredRestClient.isConnected()).toBe(false);
    } finally {
      await factory.invalidateAll();
      await socketSim.close();
      await restSim.close();
    }
  });
});
