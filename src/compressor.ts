
import {
  encodeSync as lzmaEncode,
  decodeSync as lzmaDecode
} from './lzma';

type CompressFn = (str: string) => Uint8Array;
type DecompressFn = (str: string) => string;

interface CompressOption {
  prefix: string;
  compress: CompressFn;
  decompress: DecompressFn;
}

// lzma-js produces/consumes the LZMA-Alone format:
//   [props: 5 bytes] [uncompressed_size: 8 bytes LE] [compressed data]
// FLAMP (C++ reference implementation) uses:
//   [original_length: 4 bytes LE] [props: 5 bytes] [compressed data]
// We convert between the two at the compressor boundary so the wire format
// matches the FLAMP spec while the internal lzma module stays generic.

const encoder = new TextEncoder();

/**
 * Re-package compressed data from the lzma-js native format into the FLAMP
 * wire format.
 *
 * `lzma-js` (the underlying LZMA engine) emits data in the LZMA-Alone file
 * format, which is the format used by standalone `.lzma` files:
 *
 *   [properties: 5 bytes] [uncompressed size: 8 bytes LE] [compressed bytes]
 *
 * FLAMP, the Amateur Multicast Protocol this library implements, uses a
 * different header layout after the `\u0001LZMA` prefix:
 *
 *   [original length: 4 bytes LE] [properties: 5 bytes] [compressed bytes]
 *
 * This function strips the LZMA-Alone header and rebuilds the payload as
 * FLAMP expects it, so transmissions are compatible with the C++ FLAMP
 * reference implementation.
 *
 * @param lzmaAlone - compressed data in LZMA-Alone format.
 * @param originalByteLength - uncompressed byte length to embed in the FLAMP header.
 * @returns compressed data in FLAMP format (without the `\u0001LZMA` prefix).
 */
function lzmaAloneToFlamp(lzmaAlone: Uint8Array, originalByteLength: number): Uint8Array {
  const props = lzmaAlone.slice(0, 5);
  const compressedData = lzmaAlone.slice(13);
  const out = new Uint8Array(4 + 5 + compressedData.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, originalByteLength, true);
  out.set(props, 4);
  out.set(compressedData, 9);
  return out;
}

/**
 * Re-package compressed data from the FLAMP wire format into the LZMA-Alone
 * format expected by lzma-js.
 *
 * See {@link lzmaAloneToFlamp} for the byte layouts of the two formats. This
 * function is the inverse: it reads the FLAMP header (original length +
 * properties), then prepends the properties and an 8-byte uncompressed size
 * header so `lzma-js` can decompress the payload.
 *
 * @param flampPayload - compressed data in FLAMP format (without the `\u0001LZMA` prefix).
 * @returns compressed data in LZMA-Alone format.
 */
function flampToLzmaAlone(flampPayload: Uint8Array): Uint8Array {
  const view = new DataView(flampPayload.buffer, flampPayload.byteOffset, flampPayload.byteLength);
  const originalByteLength = view.getUint32(0, true);
  const props = flampPayload.slice(4, 9);
  const compressedData = flampPayload.slice(9);
  const out = new Uint8Array(5 + 8 + compressedData.length);
  out.set(props, 0);
  const outView = new DataView(out.buffer);
  outView.setUint32(5, originalByteLength, true);
  outView.setUint32(9, 0, true);
  out.set(compressedData, 13);
  return out;
}

class CompressorHolder {
  default!: string;
  cMap: {[prefix: string]: CompressOption} = {};

  constructor() {
    const PREFIX_BYTES = new Uint8Array([
      0x01,
      ...[0x4c, 0x5a, 0x4d, 0x41], // LZMA
    ]);
    const prefix = String.fromCharCode(...PREFIX_BYTES);
    this.addCompressor({
      prefix,
      compress: (str) => {
        const compressed = lzmaEncode(str, 1);
        const originalByteLength = encoder.encode(str).length;
        const flampPayload = lzmaAloneToFlamp(compressed, originalByteLength);
        const out = new Uint8Array(PREFIX_BYTES.length + flampPayload.length);
        out.set(PREFIX_BYTES, 0);
        out.set(flampPayload, PREFIX_BYTES.length);
        return out;
      },
      decompress: (str) => {
        if (str.startsWith(prefix)) {
          const payloadBytes = Uint8Array.from(str.substring(prefix.length).split('').map((c) => c.charCodeAt(0)));
          const lzmaAlone = flampToLzmaAlone(payloadBytes);
          return lzmaDecode(lzmaAlone);
        } else {
          throw new Error("Invalid compressed string");
        }
      },
    });
  }

  addCompressor(compressor: CompressOption) {
    this.default = compressor.prefix;
    this.cMap[compressor.prefix] = compressor;
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
export const LZMA_PREFIX = Compressor.getCompressor().prefix;
