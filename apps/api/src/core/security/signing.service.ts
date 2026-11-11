import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface PlanSignPayload {
  tenantId: string;
  deviceId: string;
  sessionId?: string;
  nonce?: string;
  fencingToken?: string;
  snapshotHash?: string;
  expiresAt: string;
  commands: Array<{ stage: string; command: string }>;
}

export interface PlanSignatureResult {
  canonicalPayload: string;
  signature: string;
  publicKey: string;
}

const KNOWN_DEV_FALLBACK_KEYS = new Set([
  'sudafi-default-dev-master-encryption-key-32bytes!',
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
]);

@Injectable()
export class PlanSigningService {
  private readonly privKey: crypto.KeyObject;
  private readonly pubKey: crypto.KeyObject;
  private readonly rawPubKeyHex: string;

  constructor(@Optional() private readonly configService?: ConfigService) {
    const nodeEnv =
      (this.configService && typeof this.configService.get === 'function'
        ? this.configService.get<string>('NODE_ENV')
        : undefined) || process.env.NODE_ENV;
    const configuredKey =
      this.configService && typeof this.configService.get === 'function'
        ? this.configService.get<string>('ENCRYPTION_KEY')
        : process.env.ENCRYPTION_KEY;

    if (
      nodeEnv === 'production' &&
      (!configuredKey ||
        configuredKey.trim().length < 32 ||
        KNOWN_DEV_FALLBACK_KEYS.has(configuredKey.trim()))
    ) {
      throw new Error(
        'FATAL SECURITY ERROR: NODE_ENV=production requires a strong non-default ENCRYPTION_KEY (>=32 chars) for Ed25519 plan signing.',
      );
    }

    const rawKey =
      (configuredKey && configuredKey.trim().length > 0 ? configuredKey.trim() : null) ||
      'sudafi-default-dev-master-encryption-key-32bytes!';
    // Derive deterministic 32-byte Ed25519 seed using HMAC-SHA256
    const seed = crypto.createHmac('sha256', rawKey).update('sudafi-ed25519-plan-signing-v1').digest();
    // RFC 8410 PKCS#8 prefix for 32-byte Ed25519 private key
    const prefix = Buffer.from('302e020100300506032b657004220420', 'hex');
    const pkcs8Der = Buffer.concat([prefix, seed]);

    this.privKey = crypto.createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' });
    this.pubKey = crypto.createPublicKey(this.privKey);
    this.rawPubKeyHex = this.pubKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
  }

  getPublicKeyHex(): string {
    return this.rawPubKeyHex;
  }

  buildCanonicalPayload(payload: PlanSignPayload): { canonicalPayload: string; commandsHash: string } {
    const commandsJson = JSON.stringify(
      payload.commands.map((c) => ({
        stage: c.stage,
        command: c.command.trim(),
      })),
    );
    const commandsHash = crypto.createHash('sha256').update(commandsJson, 'utf8').digest('hex');

    const canonicalPayload = [
      'SUDAFI-PLAN-V1',
      payload.tenantId,
      payload.deviceId,
      payload.sessionId || 'session-default',
      payload.nonce || 'none',
      payload.fencingToken || '0',
      payload.snapshotHash || 'none',
      payload.expiresAt,
      commandsHash,
    ].join(':');

    return { canonicalPayload, commandsHash };
  }

  signPlan(payload: PlanSignPayload): PlanSignatureResult {
    const { canonicalPayload } = this.buildCanonicalPayload(payload);
    const signature = crypto.sign(null, Buffer.from(canonicalPayload, 'utf8'), this.privKey).toString('hex');

    return {
      canonicalPayload,
      signature,
      publicKey: this.rawPubKeyHex,
    };
  }

  verifyPlan(canonicalPayload: string, signatureHex: string, publicKeyHex?: string): boolean {
    try {
      if (publicKeyHex && publicKeyHex.toLowerCase() !== this.rawPubKeyHex.toLowerCase()) {
        return false;
      }
      const sigBuffer = Buffer.from(signatureHex, 'hex');
      return crypto.verify(null, Buffer.from(canonicalPayload, 'utf8'), this.pubKey, sigBuffer);
    } catch {
      return false;
    }
  }
}
