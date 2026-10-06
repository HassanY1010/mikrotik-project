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

  constructor(private readonly configService: ConfigService) {
    const rawKey = this.configService.getOrThrow<string>('ENCRYPTION_KEY');

    // Key must be exactly 32 bytes for AES-256
    if (rawKey.length === 64 && /^[0-9a-fA-F]+$/.test(rawKey)) {
      this.key = Buffer.from(rawKey, 'hex');
    } else {
      // Derive 32 bytes using SHA-256
      this.key = crypto.createHash('sha256').update(rawKey).digest();
    }
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
   */
  decrypt(payload: EncryptedPayload): string;
  decrypt(ciphertext: string, iv: string, authTag: string): string;
  decrypt(firstArg: EncryptedPayload | string, secondArg?: string, thirdArg?: string): string {
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

    try {
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);

      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch {
      throw new InternalServerErrorException(
        'Decryption failed: corrupted data or invalid authentication tag',
      );
    }
  }
}
