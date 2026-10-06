import { CardCodeGeneratorService } from './card-code-generator.service';

describe('CardCodeGeneratorService', () => {
  let generator: CardCodeGeneratorService;

  beforeEach(() => {
    generator = new CardCodeGeneratorService();
  });

  describe('generateCode', () => {
    it('should generate a numeric code of requested length', () => {
      const code = generator.generateCode({ length: 8, pattern: 'NUMERIC' });
      expect(code).toHaveLength(8);
      expect(/^\d{8}$/.test(code)).toBe(true);
      // Leading digit should not be 0
      expect(code[0]).not.toBe('0');
    });

    it('should generate an alphanumeric code excluding ambiguous characters (0, O, 1, I, L)', () => {
      for (let i = 0; i < 50; i++) {
        const code = generator.generateCode({ length: 10, pattern: 'ALPHANUMERIC' });
        expect(code).toHaveLength(10);
        expect(code).not.toMatch(/[01OIL]/);
      }
    });

    it('should respect prefix and suffix', () => {
      const code = generator.generateCode({
        length: 6,
        pattern: 'NUMERIC',
        prefix: 'VIP-',
        suffix: '-X',
      });
      expect(code.startsWith('VIP-')).toBe(true);
      expect(code.endsWith('-X')).toBe(true);
      expect(code).toHaveLength(4 + 6 + 2); // VIP- (4) + 6 + -X (2) = 12
    });
  });

  describe('generatePin', () => {
    it('should generate a 4-digit PIN by default', () => {
      const pin = generator.generatePin();
      expect(pin).toHaveLength(4);
      expect(/^\d{4}$/.test(pin)).toBe(true);
    });

    it('should generate custom length PIN', () => {
      const pin = generator.generatePin(6);
      expect(pin).toHaveLength(6);
      expect(/^\d{6}$/.test(pin)).toBe(true);
    });
  });

  describe('generateBatchCodes', () => {
    it('should generate requested number of unique codes without duplicates', () => {
      const count = 500;
      const codes = generator.generateBatchCodes(count, {
        length: 8,
        pattern: 'NUMERIC',
      });

      expect(codes).toHaveLength(count);
      const unique = new Set(codes);
      expect(unique.size).toBe(count);
    });

    it('should avoid collisions with existing codes', () => {
      const existing = new Set(['12345678', '87654321']);
      const codes = generator.generateBatchCodes(10, { length: 8, pattern: 'NUMERIC' }, existing);

      for (const code of codes) {
        expect(existing.has(code)).toBe(false);
      }
    });
  });

  describe('generateSerialNumber', () => {
    it('should format serial numbers with 4-digit zero padding', () => {
      const sn1 = generator.generateSerialNumber('B-261003-ABCD', 1);
      const sn99 = generator.generateSerialNumber('B-261003-ABCD', 99);
      expect(sn1).toBe('B-261003-ABCD-0001');
      expect(sn99).toBe('B-261003-ABCD-0099');
    });
  });

  describe('generateBatchNumber', () => {
    it('should generate standard batch number format B-YYMMDD-XXXX', () => {
      const batchNo = generator.generateBatchNumber();
      expect(/^B-\d{6}-[0-9A-F]{4}$/.test(batchNo)).toBe(true);
    });
  });
});
