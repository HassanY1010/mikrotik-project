import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';

describe('EncryptionService', () => {
  let service: EncryptionService;
  const mockEncryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(() => {
    const configService = {
      getOrThrow: jest.fn().mockReturnValue(mockEncryptionKey),
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;

    service = new EncryptionService(configService);
  });

  it('should encrypt and decrypt plaintext using AES-256-GCM', () => {
    const routerPassword = 'MikroTikAdminRouterPass#9988';
    const encrypted = service.encrypt(routerPassword);

    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.iv).toHaveLength(24);
    expect(encrypted.authTag).toHaveLength(32);

    const decrypted = service.decrypt(encrypted);
    expect(decrypted).toEqual(routerPassword);
  });

  it('should generate a different IV and ciphertext for identical plaintexts', () => {
    const secret = 'identical-secret-value';
    const enc1 = service.encrypt(secret);
    const enc2 = service.encrypt(secret);

    expect(enc1.iv).not.toEqual(enc2.iv);
    expect(enc1.ciphertext).not.toEqual(enc2.ciphertext);
    expect(service.decrypt(enc1)).toEqual(secret);
    expect(service.decrypt(enc2)).toEqual(secret);
  });

  it('should throw InternalServerErrorException on tampered ciphertext', () => {
    const encrypted = service.encrypt('sensitive-data');
    const tampered = {
      ...encrypted,
      ciphertext: '00' + encrypted.ciphertext.substring(2),
    };

    expect(() => service.decrypt(tampered)).toThrow();
  });

  it('should throw on tampered authentication tag', () => {
    const encrypted = service.encrypt('sensitive-data');
    const tampered = {
      ...encrypted,
      authTag: 'ff' + encrypted.authTag.substring(2),
    };

    expect(() => service.decrypt(tampered)).toThrow();
  });

  it('should decrypt using fallback key when primary key differs', () => {
    const oldKey = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
    const oldConfigService = {
      getOrThrow: jest.fn().mockReturnValue(oldKey),
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    const oldService = new EncryptionService(oldConfigService);

    const secret = 'router-password-legacy';
    const encryptedWithOld = oldService.encrypt(secret);

    // New service with new key and oldKey in ENCRYPTION_FALLBACK_KEYS
    const newConfigService = {
      getOrThrow: jest.fn().mockReturnValue(mockEncryptionKey),
      get: jest.fn().mockReturnValue(oldKey),
    } as unknown as ConfigService;
    const newService = new EncryptionService(newConfigService);

    expect(newService.decrypt(encryptedWithOld)).toEqual(secret);
    expect(newService.tryDecrypt(encryptedWithOld)).toEqual(secret);
  });

  it('should return null from tryDecrypt on invalid data without throwing', () => {
    const invalid = {
      ciphertext: 'deadbeef',
      iv: '0123456789abcdef01234567',
      authTag: '0123456789abcdef0123456789abcdef',
    };
    expect(service.tryDecrypt(invalid)).toBeNull();
  });
});
