
import * as lzma from './lzma-js';

function stringFromStringOrArray(res: string | Uint8Array) {
  if (typeof res == 'string') {
    return res;
  } else {
    return String.fromCharCode(...res);
  }
}

export function encodeSync(str: string, mode: number = 4) {
  let res = lzma.compress(str, mode);
  return stringFromStringOrArray(res);
}

export function encode(str: string, mode: number = 4) {
  return new Promise<string>((resolve, reject) => {
    lzma.compress(str, mode, (res, err) => {
      if (err) {
        reject(err);
      } else {
        resolve(stringFromStringOrArray(res));
      }
    });
  });
}

export function decodeSync(stringToDecode: string) {
  let byteArray = Uint8Array.from(stringToDecode.split('').map(c => c.charCodeAt(0)));
  let res = lzma.decompress(byteArray);

  return stringFromStringOrArray(res);
}
export function decode(stringToDecode: string) {
  let byteArray = Uint8Array.from(stringToDecode.split('').map(c => c.charCodeAt(0)));

  return new Promise<string>((resolve, reject) => {
    lzma.decompress(byteArray, (res, err) => {
      if (err) {
        reject(err);
      } else {
        resolve(stringFromStringOrArray(res));
      }
    });
  });
}
