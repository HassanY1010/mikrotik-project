import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
}

@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;
  private readonly fallbackKeys: Buffer[] = [];

  constructor(private readonly configService: ConfigService) {
    const rawKey = this.configService.getOrThrow<string>('ENCRYPTION_KEY');
    this.key = this.deriveKey(rawKey);

    // Support optional fallback keys for zero-downtime key rotation (comma-separated)
    const rawFallbacks = typeof this.configService?.get === 'function'
      ? this.configService.get<string>('ENCRYPTION_FALLBACK_KEYS')
      : undefined;
    if (rawFallbacks) {
      const keys = rawFallbacks.split(',').map((k) => k.trim()).filter(Boolean);
      for (const k of keys) {
        this.fallbackKeys.push(this.deriveKey(k));
      }
    }
  }

  private deriveKey(rawKey: string): Buffer {
    if (rawKey.length === 64 && /^[0-9a-fA-F]+$/.test(rawKey)) {
      return Buffer.from(rawKey, 'hex');
    }
    return crypto.createHash('sha256').update(rawKey).digest();
  }

  /**
   * Encrypts plaintext using AES-256-GCM with a fresh random 12-byte IV.
   * Returns hex-encoded ciphertext, IV, and 16-byte authentication tag.
   */
  encrypt(plaintext: string): EncryptedPayload {
    try {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag().toString('hex');

      return {
        ciphertext: encrypted,
        iv: iv.toString('hex'),
        authTag,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new InternalServerErrorException(`Encryption failed: ${message}`);
    }
  }

  /**
   * Decrypts ciphertext using AES-256-GCM.
   * Validates the authentication tag to ensure authenticity and integrity.
   * Tries primary key first, then any configured fallback rotation keys.
   */
  decrypt(payload: EncryptedPayload): string;
  decrypt(ciphertext: string, iv: string, authTag: string): string;
  decrypt(firstArg: EncryptedPayload | string, secondArg?: string, thirdArg?: string): string {
    const result = this.tryDecrypt(firstArg as string, secondArg, thirdArg);
    if (result !== null) {
      return result;
    }

    throw new InternalServerErrorException(
      'Decryption failed: corrupted data or invalid authentication tag',
    );
  }

  /**
   * Safe decryption that returns null instead of throwing on decryption/authentication failure.
   */
  tryDecrypt(payload: EncryptedPayload): string | null;
  tryDecrypt(ciphertext: string, iv?: string, authTag?: string): string | null;
  tryDecrypt(firstArg: EncryptedPayload | string, secondArg?: string, thirdArg?: string): string | null {
    let ciphertext: string;
    let ivHex: string;
    let authTagHex: string;

    if (typeof firstArg === 'object') {
      ciphertext = firstArg.ciphertext;
      ivHex = firstArg.iv;
      authTagHex = firstArg.authTag;
    } else {
      ciphertext = firstArg;
      ivHex = secondArg!;
      authTagHex = thirdArg!;
    }

    const candidateKeys = [this.key, ...this.fallbackKeys];

    for (const k of candidateKeys) {
      try {
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = crypto.createDecipheriv(this.algorithm, k, iv);

        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
      } catch {
        // Try next candidate key
      }
    }

    return null;
  }
}
