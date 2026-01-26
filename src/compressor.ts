
import {
  encodeSync as lzmaEncode,
  decodeSync as lzmaDecode
} from './lzma';

type CompressFn = (str: string) => Uint8Array;
type DecompressFn = (str: string) => Uint8Array;

interface CompressOption {
  prefix: string;
  compress: CompressFn;
  decompress: DecompressFn;
}

class CompressorHolder {
  default!: string;
  cMap: {[prefix: string]: CompressOption} = {};

  constructor() {
    const PREFIX_BYTES = new Uint8Array([
      0x02,
      ...[0x4c, 0x5a, 0x4d, 0x41], // LZMA
    ]);
    const prefix = String.fromCharCode(...PREFIX_BYTES);
    this.addCompressor({
      prefix,
      compress: (str) => {
        const compressed = lzmaEncode(str, 1);
        const out = new Uint8Array(PREFIX_BYTES.length + compressed.length);
        out.set(PREFIX_BYTES, 0);
        out.set(compressed, PREFIX_BYTES.length);
        return out;
      },
      decompress: (str) => {
        if (str.startsWith(prefix)) {
          return lzmaDecode(str.substring(prefix.length));
        } else {
          throw new Error("Invalid compressed string");
        }
      },
    });
  }

  addCompressor(compressor: CompressOption) {
    this.default = compressor.prefix;
    this.cMap[compressor.prefix]  = compressor;
  }

  getCompressor(prefix: string = this.default) {
    return this.cMap[prefix];
  }

  getDecompressor(buffer: string) {
    for (let c of Object.values(this.cMap)) {
      if (buffer.substring(0, c.prefix.length) == c.prefix) {
        return c;
      }
    }
    return null;
  }
}

export const Compressor = new CompressorHolder();
