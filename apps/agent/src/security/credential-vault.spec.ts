import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CredentialVault } from './credential-vault';
import { StoredCredentials } from '../types';

describe('CredentialVault', () => {
  let tempDir: string;
  let vault: CredentialVault;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `sudafi-vault-test-${Date.now()}-${Math.random()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    vault = new CredentialVault(tempDir);
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup error
    }
  });

  const mockCreds: StoredCredentials = {
    agentId: 'agent-uuid-1',
    deviceId: 'device-uuid-1',
    tenantId: 'tenant-uuid-1',
    token: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    pairedAt: new Date().toISOString(),
    serverUrl: 'http://localhost:3000/api/v1',
    router: {
      host: '192.168.88.1',
      port: 8728,
      username: 'admin',
    },
  };

  it('should return null when no credentials are saved', async () => {
    const creds = await vault.load();
    expect(creds).toBeNull();
    expect(await vault.isPaired()).toBe(false);
  });

  it('should encrypt, save, and decrypt credentials accurately without exposing plaintext token', async () => {
    await vault.save(mockCreds);

    expect(await vault.isPaired()).toBe(true);

    const loaded = await vault.load();
    expect(loaded).not.toBeNull();
    expect(loaded?.agentId).toBe(mockCreds.agentId);
    expect(loaded?.deviceId).toBe(mockCreds.deviceId);
    expect(loaded?.token).toBe(mockCreds.token);
    expect(loaded?.router?.host).toBe('192.168.88.1');

    // Verify raw file on disk is encrypted and doesn't contain raw token in plaintext
    const rawFileContent = fs.readFileSync(vault.getFilePath(), 'utf8');
    expect(rawFileContent).not.toContain(mockCreds.token);
    expect(rawFileContent).toContain('data');
  });

  it('should encrypt and decrypt accurately with AES-256-GCM fallback mode', async () => {
    vault.setForceFallback(true);
    await vault.save(mockCreds);

    const rawFileContent = fs.readFileSync(vault.getFilePath(), 'utf8');
    expect(rawFileContent).not.toContain(mockCreds.token);
    expect(rawFileContent).toContain('format');
    expect(rawFileContent).toContain('aes-256-gcm');
    expect(rawFileContent).toContain('iv');
    expect(rawFileContent).toContain('tag');

    const loaded = await vault.load();
    expect(loaded).not.toBeNull();
    expect(loaded?.token).toBe(mockCreds.token);
  });

  it('should safely clear credentials and become unpaired', async () => {
    await vault.save(mockCreds);
    expect(await vault.isPaired()).toBe(true);

    await vault.clear();
    expect(await vault.isPaired()).toBe(false);
    expect(await vault.load()).toBeNull();
  });

  it('should return null if file is corrupted or tampered with', async () => {
    vault.setForceFallback(true);
    await vault.save(mockCreds);

    // Tamper with ciphertext
    const raw = JSON.parse(fs.readFileSync(vault.getFilePath(), 'utf8'));
    raw.data = 'bad-hex-data';
    fs.writeFileSync(vault.getFilePath(), JSON.stringify(raw));

    const loaded = await vault.load();
    expect(loaded).toBeNull();
  });
});
