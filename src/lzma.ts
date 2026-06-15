
import * as lzma from './lzma-js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function normalizeToUint8Array(res: string | number[] | Uint8Array): Uint8Array {
  if (res instanceof Uint8Array) {
    return res;
  } else if (typeof res === 'string') {
    return encoder.encode(res);
  } else {
    return Uint8Array.from(res);
  }
}

function byteArrayToString(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

export function encodeSync(str: string, mode: number = 4): Uint8Array {
  const res = lzma.compress(str, mode);
  return normalizeToUint8Array(res);
}

export function encode(str: string, mode: number = 4): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    lzma.compress(str, mode, (res, err) => {
      if (err) {
        reject(err);
      } else {
        resolve(normalizeToUint8Array(res));
      }
    });
  });
}

export function decodeSync(stringToDecode: string | Uint8Array): string {
  const byteArray =
    stringToDecode instanceof Uint8Array
      ? stringToDecode
      : Uint8Array.from(stringToDecode.split('').map((c) => c.charCodeAt(0)));
  const res = lzma.decompress(byteArray);

  return byteArrayToString(normalizeToUint8Array(res));
}

export function decode(stringToDecode: string | Uint8Array): Promise<string> {
  const byteArray =
    stringToDecode instanceof Uint8Array
      ? stringToDecode
      : Uint8Array.from(stringToDecode.split('').map((c) => c.charCodeAt(0)));

  return new Promise<string>((resolve, reject) => {
    lzma.decompress(byteArray, (res, err) => {
      if (err) {
        reject(err);
      } else {
        resolve(byteArrayToString(normalizeToUint8Array(res)));
      }
    });
  });
}
