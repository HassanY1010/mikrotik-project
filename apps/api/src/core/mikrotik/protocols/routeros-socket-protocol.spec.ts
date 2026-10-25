import { RouterOsSocketProtocol } from './routeros-socket-protocol';

describe('RouterOsSocketProtocol', () => {
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

      // In 2-byte length encoding: val = len | 0x8000
      // 200 | 0x8000 = 0x80C8 -> [0x80, 0xC8]
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

      // In 2-byte encoding: 256 is 0x8000 | 256 = 0x8100 -> [0x81, 0x00]
      expect(encoded[0]).toBe(0x81);
      expect(encoded[1]).toBe(0x00);
      expect(encoded.subarray(2)).toEqual(allBytes);
      expect(encoded.length).toBe(2 + 256);
    });

    it('should strictly encode word length as BYTE count, not character count', () => {
      // 4 Arabic characters = 8 bytes in UTF-8
      const arabicWord = 'شبكة';
      const encodedArabic = RouterOsSocketProtocol.encodeWord(arabicWord);
      expect(encodedArabic[0]).toBe(8); // 8 bytes, NOT 4 characters

      // 1 Emoji character = 4 bytes in UTF-8
      const emojiWord = '🚀';
      const encodedEmoji = RouterOsSocketProtocol.encodeWord(emojiWord);
      expect(encodedEmoji[0]).toBe(4); // 4 bytes, NOT 1 character
    });

    it('should correctly encode 3-byte length header for buffers >= 16384 bytes', () => {
      const largeBuffer = Buffer.alloc(20000, 0x55);
      const encoded = RouterOsSocketProtocol.encodeWord(largeBuffer);

      // In 3-byte encoding: 20000 | 0xC00000 = 0xC04E20 -> [0xC0, 0x4E, 0x20]
      expect(encoded[0]).toBe(0xc0);
      expect(encoded[1]).toBe(0x4e);
      expect(encoded[2]).toBe(0x20);
      expect(encoded.subarray(3)).toEqual(largeBuffer);
      expect(encoded.length).toBe(3 + 20000);
    });

    it('should preserve a complete valid binary PNG image payload with =contents= prefix', () => {
      // Standard 1x1 transparent PNG binary bytes
      const validPngBytes = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG Signature
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR header
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 dimensions
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, // bit depth, color type, CRC
        0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, // IDAT header
        0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, // Deflate compressed data
        0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, // Checksum
        0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, // IEND header
        0x42, 0x60, 0x82,                               // IEND CRC
      ]);

      const contentsWord = Buffer.concat([Buffer.from('=contents='), validPngBytes]);
      const sentence = RouterOsSocketProtocol.encodeSentence([
        '/file/add',
        '=name=hotspot-staging/img/logo.png',
        contentsWord,
      ]);

      // Sentence must end with single 0x00 byte
      expect(sentence[sentence.length - 1]).toBe(0x00);

      // Find =contents= in the encoded stream
      const contentsPrefixIndex = sentence.indexOf(Buffer.from('=contents='));
      expect(contentsPrefixIndex).toBeGreaterThan(0);

      // The bytes immediately following "=contents=" MUST be the exact PNG bytes bit-for-bit
      const extractedPng = sentence.subarray(
        contentsPrefixIndex + 10,
        contentsPrefixIndex + 10 + validPngBytes.length,
      );
      expect(extractedPng).toEqual(validPngBytes);
    });
  });

  describe('encodeSentence', () => {
    it('should encode multiple words and append trailing 0x00 delimiter', () => {
      const words = ['/login', '=name=admin', '=password=secret'];
      const buffer = RouterOsSocketProtocol.encodeSentence(words);

      // Trailing byte must be 0x00
      expect(buffer[buffer.length - 1]).toBe(0x00);

      // First word length is 6 for "/login"
      expect(buffer[0]).toBe(6);
      expect(buffer.subarray(1, 7).toString('utf8')).toBe('/login');
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
      // 0x80C8 -> 200
      const buf = Buffer.from([0x80, 0xc8, 1, 2]);
      const res = RouterOsSocketProtocol.decodeLength(buf, 0);
      expect(res).toEqual([200, 2]);
    });

    it('should decode 3-byte length prefix', () => {
      // 0xC04E20 -> 20000
      const buf = Buffer.from([0xc0, 0x4e, 0x20, 1, 2]);
      const res = RouterOsSocketProtocol.decodeLength(buf, 0);
      expect(res).toEqual([20000, 3]);
    });

    it('should return null if 2-byte length is incomplete', () => {
      const buf = Buffer.from([0x80]);
      expect(RouterOsSocketProtocol.decodeLength(buf, 0)).toBeNull();
    });
  });
});
