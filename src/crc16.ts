export function crc16(message: string | ArrayBuffer) {
  let table = [];
  for (let x = 0; x < 256; ++x) {
    let y = x;
    for (let z = 0; z < 8; ++z) {
      y = y & 1 ? 0xA001 ^ (y >>> 1) : y >>> 1;
    }
    table[x] = y >>> 0;
  }

  let crcval = 0xFFFF;
  if (message instanceof ArrayBuffer) {
    const msgUint8Array = new Uint8Array(message);
    for (let i = 0; i < length; ++i) {
      crcval = table[(crcval ^ msgUint8Array[i]) & 0xFF] ^ (crcval >>> 8);
    }
  } else {
    for (let i = 0; i < message.length; ++i) {
      let code = message.charCodeAt(i);
      if (code < 0x80) {
        crcval = table[(crcval ^ code) & 0xFF] ^ (crcval >>> 8);
      } else if (code < 0x800) {
        crcval = table[(crcval ^ (0xc0 | (code >> 6))) & 0xFF] ^ (crcval >>> 8);
        crcval = table[(crcval ^ (0x80 | (code & 0x3f))) & 0xFF] ^ (crcval >>> 8);
      } else if (code < 0xd800 || code >= 0xe000) {
        crcval = table[(crcval ^ (0xe0 | (code >> 12))) & 0xFF] ^ (crcval >>> 8);
        crcval = table[(crcval ^ (0x80 | ((code >> 6) & 0x3f))) & 0xFF] ^ (crcval >>> 8);
        crcval = table[(crcval ^ (0x80 | (code & 0x3f))) & 0xFF] ^ (crcval >>> 8);
      } else {
        code = 0x10000 + (((code & 0x3ff) << 10) | (message.charCodeAt(++i) & 0x3ff));
        crcval = table[(crcval ^ (0xf0 | (code >> 18))) & 0xFF] ^ (crcval >>> 8);
        crcval = table[(crcval ^ (0x80 | ((code >> 12) & 0x3f))) & 0xFF] ^ (crcval >>> 8);
        crcval = table[(crcval ^ (0x80 | ((code >> 6) & 0x3f))) & 0xFF] ^ (crcval >>> 8);
        crcval = table[(crcval ^ (0x80 | (code & 0x3f))) & 0xFF] ^ (crcval >>> 8);
      }
    }
  }

  const HEX_CHARS = '0123456789ABCDEF'.split('');
  return HEX_CHARS[(crcval >> 12) & 0x0F] + HEX_CHARS[(crcval >> 8) & 0x0F] + HEX_CHARS[(crcval >> 4) & 0x0F] + HEX_CHARS[crcval & 0x0F];
};
