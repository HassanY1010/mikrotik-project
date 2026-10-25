import { RouterOsSocketProtocol } from './routeros-socket-protocol';

describe('Agent RouterOsSocketProtocol', () => {
  describe('encodeWord', () => {
    it('should encode a short ASCII word with 1-byte length prefix', () => {
      const word = '/system/resource/print';
      const encoded = RouterOsSocketProtocol.encodeWord(word);

      expect(encoded[0]).toBe(word.length);
      expect(encoded.subarray(1).toString('utf8')).toBe(word);
    });

    it('should encode an empty word as 0x00', () => {
      const encoded = RouterOsSocketProtocol.encodeWord('');
      expect(encoded.length).toBe(1);
      expect(encoded[0]).toBe(0x00);
    });

    it('should encode words requiring 2-byte length header (>= 128 bytes)', () => {
      const word = 'a'.repeat(200);
      const encoded = RouterOsSocketProtocol.encodeWord(word);

      expect(encoded[0]).toBe(0x80);
      expect(encoded[1]).toBe(200);
      expect(encoded.subarray(2).toString('utf8')).toBe(word);
    });
  });

  describe('encodeWord - Binary and Full Byte Spectrum', () => {
    it('should encode raw Buffer preserving null bytes (0x00) without truncation', () => {
      const binaryWithNulls = Buffer.from([0x00, 0x01, 0x00, 0x02, 0x00, 0x03]);
      const encoded = RouterOsSocketProtocol.encodeWord(binaryWithNulls);

      expect(encoded[0]).toBe(6);
      expect(encoded.subarray(1)).toEqual(binaryWithNulls);
    });

    it('should encode all 256 byte values (0x00 to 0xFF) without UTF-8 expansion or distortion', () => {
      const allBytes = Buffer.alloc(256);
      for (let i = 0; i < 256; i++) {
        allBytes[i] = i;
      }

      const encoded = RouterOsSocketProtocol.encodeWord(allBytes);

      expect(encoded[0]).toBe(0x81);
      expect(encoded[1]).toBe(0x00);
      expect(encoded.subarray(2)).toEqual(allBytes);
      expect(encoded.length).toBe(2 + 256);
    });

    it('should strictly encode word length as BYTE count, not character count', () => {
      const arabicWord = 'شبكة';
      const encodedArabic = RouterOsSocketProtocol.encodeWord(arabicWord);
      expect(encodedArabic[0]).toBe(8);

      const emojiWord = '🚀';
      const encodedEmoji = RouterOsSocketProtocol.encodeWord(emojiWord);
      expect(encodedEmoji[0]).toBe(4);
    });

    it('should preserve a complete valid binary PNG image payload with =contents= prefix', () => {
      const validPngBytes = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
        0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
        0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
        0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
        0x42, 0x60, 0x82,
      ]);

      const contentsWord = Buffer.concat([Buffer.from('=contents='), validPngBytes]);
      const sentence = RouterOsSocketProtocol.encodeSentence([
        '/file/add',
        '=name=hotspot-staging/img/logo.png',
        contentsWord,
      ]);

      expect(sentence[sentence.length - 1]).toBe(0x00);
      const contentsPrefixIndex = sentence.indexOf(Buffer.from('=contents='));
      expect(contentsPrefixIndex).toBeGreaterThan(0);

      const extractedPng = sentence.subarray(
        contentsPrefixIndex + 10,
        contentsPrefixIndex + 10 + validPngBytes.length,
      );
      expect(extractedPng).toEqual(validPngBytes);
    });
  });

  describe('decodeLength', () => {
    it('should return null if buffer has insufficient data', () => {
      const emptyBuffer = Buffer.alloc(0);
      expect(RouterOsSocketProtocol.decodeLength(emptyBuffer, 0)).toBeNull();
    });

    it('should decode 1-byte length prefix (< 128)', () => {
      const buf = Buffer.from([42, 1, 2, 3]);
      const res = RouterOsSocketProtocol.decodeLength(buf, 0);
      expect(res).toEqual([42, 1]);
    });

    it('should decode 2-byte length prefix', () => {
      const buf = Buffer.from([0x80, 0xc8, 1, 2]);
      const res = RouterOsSocketProtocol.decodeLength(buf, 0);
      expect(res).toEqual([200, 2]);
    });

    it('should decode 3-byte length prefix', () => {
      const buf = Buffer.from([0xc0, 0x4e, 0x20, 1, 2]);
      const res = RouterOsSocketProtocol.decodeLength(buf, 0);
      expect(res).toEqual([20000, 3]);
    });
  });
});
