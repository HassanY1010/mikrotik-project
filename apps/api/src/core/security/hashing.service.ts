import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

const ARGON2_CONFIG = {
  memoryCost: 65536,
  timeCost: 3,
  outputLen: 32,
  parallelism: 4,
};

@Injectable()
export class HashingService {
  /**
   * Hashes a plaintext password using Argon2id with production parameters.
   */
  async hashPassword(password: string): Promise<string> {
    return hash(password, ARGON2_CONFIG);
  }

  /**
   * Verifies a plaintext password against an existing Argon2id hash.
   */
  async verifyPassword(hashString: string, candidate: string): Promise<boolean> {
    try {
      return await verify(hashString, candidate);
    } catch {
      return false;
    }
  }
}
