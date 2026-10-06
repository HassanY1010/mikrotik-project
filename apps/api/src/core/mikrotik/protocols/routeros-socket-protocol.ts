/**
 * Implements MikroTik RouterOS API binary sentence and word protocol.
 * Spec: https://wiki.mikrotik.com/wiki/Manual:API
 */
export class RouterOsSocketProtocol {
  /**
   * Encodes a string word into RouterOS length-prefixed Buffer.
   */
  static encodeWord(word: string): Buffer {
    const wordBuffer = Buffer.from(word, 'utf8');
    const len = wordBuffer.length;
    let headerBuffer: Buffer;

    if (len < 0x80) {
      headerBuffer = Buffer.from([len]);
    } else if (len < 0x4000) {
      const val = len | 0x8000;
      headerBuffer = Buffer.from([(val >> 8) & 0xff, val & 0xff]);
    } else if (len < 0x200000) {
      const val = len | 0xc00000;
      headerBuffer = Buffer.from([(val >> 16) & 0xff, (val >> 8) & 0xff, val & 0xff]);
    } else if (len < 0x10000000) {
      const val = (len | 0xe0000000) >>> 0;
      headerBuffer = Buffer.from([
        (val >> 24) & 0xff,
        (val >> 16) & 0xff,
        (val >> 8) & 0xff,
        val & 0xff,
      ]);
    } else {
      headerBuffer = Buffer.from([
        0xf0,
        (len >> 24) & 0xff,
        (len >> 16) & 0xff,
        (len >> 8) & 0xff,
        len & 0xff,
      ]);
    }

    return Buffer.concat([headerBuffer, wordBuffer]);
  }

  /**
   * Encodes an array of words into a sentence ending with an empty word.
   */
  static encodeSentence(words: string[]): Buffer {
    const buffers: Buffer[] = words.map((w) => this.encodeWord(w));
    // End of sentence is signaled by an empty word (length 0 = single 0x00 byte)
    buffers.push(Buffer.from([0x00]));
    return Buffer.concat(buffers);
  }

  /**
   * Decodes length prefix from a buffer.
   * Returns [length, bytesConsumed] or null if buffer has insufficient data.
   */
  static decodeLength(buffer: Buffer, offset: number): [number, number] | null {
    if (buffer.length - offset < 1) return null;

    const b0 = buffer[offset];

    if ((b0 & 0x80) === 0) {
      return [b0, 1];
    } else if ((b0 & 0xc0) === 0x80) {
      if (buffer.length - offset < 2) return null;
      const b1 = buffer[offset + 1];
      const len = ((b0 & ~0xc0) << 8) | b1;
      return [len, 2];
    } else if ((b0 & 0xe0) === 0xc0) {
      if (buffer.length - offset < 3) return null;
      const b1 = buffer[offset + 1];
      const b2 = buffer[offset + 2];
      const len = ((b0 & ~0xe0) << 16) | (b1 << 8) | b2;
      return [len, 3];
    } else if ((b0 & 0xf0) === 0xe0) {
      if (buffer.length - offset < 4) return null;
      const b1 = buffer[offset + 1];
      const b2 = buffer[offset + 2];
      const b3 = buffer[offset + 3];
      const len = (((b0 & ~0xf0) << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;
      return [len, 4];
    } else if (b0 === 0xf0) {
      if (buffer.length - offset < 5) return null;
      const b1 = buffer[offset + 1];
      const b2 = buffer[offset + 2];
      const b3 = buffer[offset + 3];
      const b4 = buffer[offset + 4];
      const len = ((b1 << 24) | (b2 << 16) | (b3 << 8) | b4) >>> 0;
      return [len, 5];
    }

    return null;
  }
}
