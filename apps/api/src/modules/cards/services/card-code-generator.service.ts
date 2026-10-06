import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

export type CodePattern = 'NUMERIC' | 'ALPHANUMERIC' | 'ALPHABETIC' | 'HEX';

export interface CodeGeneratorOptions {
  length: number;
  pattern: CodePattern;
  prefix?: string;
  suffix?: string;
}

@Injectable()
export class CardCodeGeneratorService {
  // Unambiguous character sets (removes 0, O, 1, I, L to avoid customer confusion on printed cards)
  private readonly CHARSET_NUMERIC = '0123456789';
  private readonly CHARSET_ALPHANUMERIC = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  private readonly CHARSET_ALPHABETIC = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  private readonly CHARSET_HEX = '0123456789ABCDEF';

  private getCharset(pattern: CodePattern): string {
    switch (pattern) {
      case 'NUMERIC':
        return this.CHARSET_NUMERIC;
      case 'ALPHANUMERIC':
        return this.CHARSET_ALPHANUMERIC;
      case 'ALPHABETIC':
        return this.CHARSET_ALPHABETIC;
      case 'HEX':
        return this.CHARSET_HEX;
      default:
        return this.CHARSET_NUMERIC;
    }
  }

  /**
   * Generates a single cryptographically secure random code string using CSPRNG.
   */
  generateCode(options: CodeGeneratorOptions): string {
    const charset = this.getCharset(options.pattern);
    const charsetLength = charset.length;
    const codeChars: string[] = [];

    // For numeric codes, ensure first digit is non-zero (1-9) so leading zeros aren't stripped by users
    if (options.pattern === 'NUMERIC' && options.length > 1) {
      const firstDigit = crypto.randomInt(1, 10).toString();
      codeChars.push(firstDigit);
      for (let i = 1; i < options.length; i++) {
        const randIndex = crypto.randomInt(0, charsetLength);
        codeChars.push(charset[randIndex]);
      }
    } else {
      for (let i = 0; i < options.length; i++) {
        const randIndex = crypto.randomInt(0, charsetLength);
        codeChars.push(charset[randIndex]);
      }
    }

    const raw = codeChars.join('');
    const prefix = options.prefix ? options.prefix.trim() : '';
    const suffix = options.suffix ? options.suffix.trim() : '';

    return `${prefix}${raw}${suffix}`;
  }

  /**
   * Generates a random numeric PIN code (default 4 digits, 1000-9999).
   */
  generatePin(length = 4): string {
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length);
    return crypto.randomInt(min, max).toString();
  }

  /**
   * Generates N guaranteed unique codes within the batch with collision avoidance.
   */
  generateBatchCodes(
    count: number,
    options: CodeGeneratorOptions,
    existingSet?: Set<string>,
  ): string[] {
    const uniqueCodes = new Set<string>();
    const maxAttempts = count * 20; // safety ceiling
    let attempts = 0;

    while (uniqueCodes.size < count && attempts < maxAttempts) {
      attempts++;
      const candidate = this.generateCode(options);

      // Verify not duplicate in current batch and not in existing set
      if (!uniqueCodes.has(candidate) && (!existingSet || !existingSet.has(candidate))) {
        uniqueCodes.add(candidate);
      }
    }

    if (uniqueCodes.size < count) {
      throw new Error(
        `Could not generate ${count} unique codes with length ${options.length} and pattern ${options.pattern}. Increase code length.`,
      );
    }

    return Array.from(uniqueCodes);
  }

  /**
   * Formats a structured unique serial number for the card.
   * e.g. "SN-261003-8A2F-0001"
   */
  generateSerialNumber(batchPrefix: string, sequenceNumber: number): string {
    const paddedSeq = sequenceNumber.toString().padStart(4, '0');
    return `${batchPrefix}-${paddedSeq}`;
  }

  /**
   * Generates a unique batch number identifier.
   * e.g. "B-261003-8F4A"
   */
  generateBatchNumber(): string {
    const now = new Date();
    const yy = (now.getFullYear() % 100).toString().padStart(2, '0');
    const mm = (now.getMonth() + 1).toString().padStart(2, '0');
    const dd = now.getDate().toString().padStart(2, '0');
    const randomSuffix = crypto.randomBytes(2).toString('hex').toUpperCase();

    return `B-${yy}${mm}${dd}-${randomSuffix}`;
  }
}
