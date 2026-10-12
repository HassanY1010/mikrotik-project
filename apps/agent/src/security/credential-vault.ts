import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import * as cp from 'child_process';
import { StoredCredentials } from '../types';

export class CredentialVault {
  private readonly storagePath: string;
  private readonly salt: string;
  private forceFallback = false;

  constructor(customStorageDir?: string) {
    const baseDir =
      customStorageDir ??
      (process.env.APPDATA
        ? path.join(process.env.APPDATA, 'SudaFiAgent')
        : path.join(os.homedir(), '.sudafi-agent'));

    if (!fs.existsSync(baseDir)) {
      try {
        fs.mkdirSync(baseDir, { recursive: true, mode: 0o700 });
      } catch {
        // Fallback to local working directory if system directory creation fails
      }
    }

    this.storagePath = fs.existsSync(baseDir)
      ? path.join(baseDir, 'credentials.enc')
      : path.join(process.cwd(), '.sudafi-credentials.enc');

    this.salt = 'sudafi-agent-local-salt-v1';
  }

  /**
   * For testing purposes: allows forcing software AES-256-GCM mode.
   */
  setForceFallback(enabled: boolean): void {
    this.forceFallback = enabled;
  }

  getFilePath(): string {
    return this.storagePath;
  }

  private isWindows(): boolean {
    return process.platform === 'win32' && !this.forceFallback;
  }

  /**
   * Encrypts plaintext using Windows DPAPI (CurrentUser scope).
   * Backed by Windows Local Security Authority (LSA) and machine TPM master key.
   */
  private protectWithDpapi(plaintext: string): string {
    // Escape single quotes for PowerShell literal string
    const escaped = plaintext.replace(/'/g, "''");
    const psScript = `
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Security
$bytes = [System.Text.Encoding]::UTF8.GetBytes(@'
${escaped}
'@)
$encrypted = [System.Security.Cryptography.ProtectedData]::Protect(
  $bytes,
  $null,
  [System.Security.Cryptography.DataProtectionScope]::CurrentUser
)
[Convert]::ToBase64String($encrypted)
`.trim();

    const b64Command = Buffer.from(psScript, 'utf16le').toString('base64');
    return cp
      .execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', b64Command], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 10000,
      })
      .trim();
  }

  /**
   * Decrypts ciphertext using Windows DPAPI (CurrentUser scope).
   */
  private unprotectWithDpapi(cipherB64: string): string {
    const psScript = `
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Security
$cipherBytes = [Convert]::FromBase64String('${cipherB64}')
$decrypted = [System.Security.Cryptography.ProtectedData]::Unprotect(
  $cipherBytes,
  $null,
  [System.Security.Cryptography.DataProtectionScope]::CurrentUser
)
[System.Text.Encoding]::UTF8.GetString($decrypted)
`.trim();

    const b64Command = Buffer.from(psScript, 'utf16le').toString('base64');
    return cp
      .execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', b64Command], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 10000,
      })
      .trim();
  }

  /**
   * Fallback: Derives a 256-bit AES key for non-Windows environments.
   */
  private deriveFallbackKey(): Buffer {
    const machineFingerprint = [
      os.hostname(),
      os.platform(),
      os.arch(),
      os.userInfo().username,
      process.env.COMPUTERNAME ?? '',
      process.env.USERDOMAIN ?? '',
    ].join(':');

    return crypto.scryptSync(machineFingerprint, this.salt, 32);
  }

  /**
   * Encrypts and securely stores credentials.
   * Uses Windows DPAPI as primary protection on Windows, falling back to AES-256-GCM.
   */
  async save(credentials: StoredCredentials): Promise<void> {
    const jsonString = JSON.stringify(credentials);
    const dir = path.dirname(this.storagePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }

    let payload: Record<string, any>;

    if (this.isWindows()) {
      try {
        const dpapiCipher = this.protectWithDpapi(jsonString);
        payload = {
          format: 'win32-dpapi',
          data: dpapiCipher,
          updatedAt: new Date().toISOString(),
        };
      } catch {
        // If DPAPI call fails, use secure AES-256-GCM fallback
        payload = this.encryptFallback(jsonString);
      }
    } else {
      payload = this.encryptFallback(jsonString);
    }

    fs.writeFileSync(this.storagePath, JSON.stringify(payload, null, 2), {
      encoding: 'utf8',
      mode: 0o600, // Read/write only by current OS user
    });

    // On Windows, restrict NTFS permissions to current user
    if (process.platform === 'win32' && !this.forceFallback) {
      try {
        const username = process.env.USERNAME;
        if (username) {
          cp.execFileSync('icacls.exe', [this.storagePath, '/inheritance:r', '/grant:r', `${username}:(R,W)`], {
            stdio: 'ignore',
            timeout: 5000,
          });
        }
      } catch {
        // Ignore icacls errors on environments where icacls is restricted
      }
    }
  }

  private encryptFallback(jsonString: string): Record<string, any> {
    const key = this.deriveFallbackKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const plaintext = Buffer.from(jsonString, 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      format: 'aes-256-gcm',
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      data: ciphertext.toString('hex'),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Loads and decrypts credentials. Returns null if missing, corrupted, or transferred across machines.
   */
  async load(): Promise<StoredCredentials | null> {
    if (!fs.existsSync(this.storagePath)) {
      return null;
    }

    try {
      const raw = fs.readFileSync(this.storagePath, 'utf8');
      const payload = JSON.parse(raw);

      let decryptedJson: string;

      if (payload.format === 'win32-dpapi') {
        try {
          decryptedJson = this.unprotectWithDpapi(payload.data);
        } catch {
          // DPAPI will throw if file was copied to a different Windows user or machine
          return null;
        }
      } else if (payload.format === 'aes-256-gcm' || payload.iv) {
        if (!payload.iv || !payload.tag || !payload.data) {
          return null;
        }
        const key = this.deriveFallbackKey();
        const iv = Buffer.from(payload.iv, 'hex');
        const tag = Buffer.from(payload.tag, 'hex');
        const ciphertext = Buffer.from(payload.data, 'hex');

        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        decryptedJson = decrypted.toString('utf8');
      } else {
        return null;
      }

      const creds: StoredCredentials = JSON.parse(decryptedJson);
      if (!creds.token || !creds.agentId || !creds.deviceId) {
        return null;
      }

      return creds;
    } catch {
      return null;
    }
  }

  /**
   * Checks if valid credentials exist on disk.
   */
  async isPaired(): Promise<boolean> {
    const creds = await this.load();
    return creds !== null;
  }

  /**
   * Securely purges credentials file from disk.
   */
  async clear(): Promise<void> {
    if (fs.existsSync(this.storagePath)) {
      try {
        fs.writeFileSync(this.storagePath, crypto.randomBytes(256).toString('hex'), 'utf8');
        fs.unlinkSync(this.storagePath);
      } catch {
        // Ignore unlink error
      }
    }
  }
}
