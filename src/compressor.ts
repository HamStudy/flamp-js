
import {
  encodeSync as lzmaEncode,
  decodeSync as lzmaDecode
} from './lzma';

type CompressFn = (str: string) => string;
type DecompressFn = (str: string) => string;

interface CompressOption {
  prefix: string;
  compress: CompressFn;
  decompress: DecompressFn;
}

class CompressorHolder {
  default!: string;
  cMap: {[prefix: string]: CompressOption} = {};

  constructor() {
    const prefix = "\u0002LZMA";
    this.addCompressor({
      prefix,
      compress: str => prefix + lzmaEncode(str, 1),
      decompress: str => {
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
