/*
Modified from the base91.js version at https://github.com/mscdex/base91.js

... which was ....

Modified version of Benedikt Waldvogel's modified version of Jochaim Henke's
original code from http://base91.sourceforge.net/

base91 encoding/decoding routines

Copyright (c) 2000-2006 Joachim Henke All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

- Redistributions of source code must retain the above copyright notice, this
list of conditions and the following disclaimer. - Redistributions in binary
form must reproduce the above copyright notice, this list of conditions and
the following disclaimer in the documentation and/or other materials provided
with the distribution. - Neither the name of Joachim Henke nor the names of
his contributors may be used to endorse or promote products derived from this
software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
*/

// tslint:disable:one-variable-per-declaration
// tslint:disable:curly
// tslint:disable:no-bitwise

const AVERAGE_ENCODING_RATIO = 1.2297,
   WORST_ENCODING_RATIO = 1.24,
    ENCODING_TABLE = [
      'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
      'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
      'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
      'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
      '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '!', '#', '$',
      '%', '&', '(', ')', '*', '+', ',', '.', '/', ':', ';', '<', '=',
      '>', '?', '@', '[', ']', '^', '_', '`', '{', '|', '}', '~', '"',
    ],
    DECODING_TABLE = [
      91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91,
      91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91,
      91, 62, 90, 63, 64, 65, 66, 91, 67, 68, 69, 70, 71, 91, 72, 73,
      52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 74, 75, 76, 77, 78, 79,
      80,  0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14,
      15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 81, 91, 82, 83, 84,
      85, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
      41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 86, 87, 88, 89, 91,
      91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91,
      91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91,
      91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91,
      91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91,
      91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91,
      91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91,
      91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91,
      91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91,
    ];

export function encode(data: string) {
  let len = data.length,
      output = '', ebq = 0, en = 0, ev = 0, j = 0, byte = 0;

  if (typeof data === 'string') {
    for (let i = 0; i < len; ++i) {
      byte = data.charCodeAt(i);
      j = 0;
      let lenj = (byte < 128
                  ? 1
                  : (byte > 127 && byte < 2048
                      ? 2
                      : 3));
      for (; j < lenj; ++j) {
        if (lenj === 1)
          ebq |= byte << en;
        else if (lenj === 2) {
          if (j === 0)
            ebq |= ((byte >> 6) | 192) << en;
          else
            ebq |= ((byte & 63) | 128) << en;
        } else {
          if (j === 0)
            ebq |= ((byte >> 12) | 224) << en;
          else if (j === 1)
            ebq |= (((byte >> 6) & 63) | 128) << en;
          else
            ebq |= ((byte & 63) | 128) << en;
        }
        en += 8;
        if (en > 13) {
          ev = ebq & 8191;
          if (ev > 88) {
            ebq >>= 13;
            en -= 13;
          } else {
            ev = ebq & 16383;
            ebq >>= 14;
            en -= 14;
          }
          output += ENCODING_TABLE[ev % 91];
          output += ENCODING_TABLE[(ev / 91) | 0];
        }
      }
    }
  } else {
    for (let i = 0; i < len; ++i) {
      ebq |= (data[i] & 255) << en;
      en += 8;
      if (en > 13) {
        ev = ebq & 8191;
        if (ev > 88) {
          ebq >>= 13;
          en -= 13;
        } else {
          ev = ebq & 16383;
          ebq >>= 14;
          en -= 14;
        }
        output += ENCODING_TABLE[ev % 91];
        output += ENCODING_TABLE[(ev / 91) | 0];
      }
    }
  }

  if (en > 0) {
    output += ENCODING_TABLE[ebq % 91];
    if (en > 7 || ebq > 90)
      output += ENCODING_TABLE[(ebq / 91) | 0];
  }

  return output;
}

export function decode(data: string|Uint8Array) : string {
  let len = data.length,
      estimatedSize = len,
      dbQueue = 0, nbits = 0, dVal = -1, i = 0, n = 0, byte = 0,
      output = "";

  if (typeof data == 'string') {
    data = Uint8Array.from(data.split('').map(c => c.charCodeAt(0)));
  }

  let pos = 0;

  for (i = 0; i < len; ++i) {
    byte = data[i];
    let d = DECODING_TABLE[byte];
    // console.log(byte);
    if (d === 91)
      continue;
    if (dVal === -1)
      dVal = d;
    else {
      dVal += d * 91;
      dbQueue |= dVal << nbits;
      nbits += ((dVal & 8191) > 88 ? 13 : 14);
      do {
        output += String.fromCharCode(dbQueue & 0xFF);
        dbQueue >>= 8;
        nbits -= 8;
      } while (nbits > 7);
      dVal = -1;
    }
  }

  if (dVal !== -1) {
    output += String.fromCharCode((dbQueue | dVal << nbits) & 0xFF);
  }

  return output;
}
