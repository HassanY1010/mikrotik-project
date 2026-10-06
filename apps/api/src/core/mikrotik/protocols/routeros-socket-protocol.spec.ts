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

    it('should return null if 2-byte length is incomplete', () => {
      const buf = Buffer.from([0x80]);
      expect(RouterOsSocketProtocol.decodeLength(buf, 0)).toBeNull();
    });
  });
});
