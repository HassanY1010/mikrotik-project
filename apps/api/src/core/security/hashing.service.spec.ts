import { HashingService } from './hashing.service';

describe('HashingService', () => {
  let service: HashingService;

  beforeEach(() => {
    service = new HashingService();
  });

  it('should hash a password with Argon2id and verify correctly', async () => {
    const password = 'SuperSecretPassword@2026';
    const hash = await service.hashPassword(password);

    expect(hash).toBeDefined();
    expect(hash.startsWith('$argon2id$')).toBe(true);

    const isValid = await service.verifyPassword(hash, password);
    expect(isValid).toBe(true);
  });

  it('should reject an incorrect password', async () => {
    const password = 'CorrectPassword@123';
    const hash = await service.hashPassword(password);

    const isValid = await service.verifyPassword(hash, 'WrongPassword@123');
    expect(isValid).toBe(false);
  });

  it('should generate unique salts for identical passwords', async () => {
    const password = 'IdenticalPassword@2026';
    const hash1 = await service.hashPassword(password);
    const hash2 = await service.hashPassword(password);

    expect(hash1).not.toEqual(hash2);
    expect(await service.verifyPassword(hash1, password)).toBe(true);
    expect(await service.verifyPassword(hash2, password)).toBe(true);
  });
});
