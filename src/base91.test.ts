import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { beforeAll, expect, test } from 'vitest';
import * as base91 from './base91';

const npm91 = require('node-base91') as {
  encode(str: string): string;
  decode(str: string): Buffer;
};

const files = [
  "Bids.csv",
  "TitanicSurvival.csv",
  "chickweed.csv",
  "edcT.csv",
  "mecter.csv",
  "treering.csv",
];

const fileStrings: string[] = [];

// Uses native node libraries to encode
function nativeEncode(str: string) {
  return npm91.encode(str);
}
// Uses native node libraries to decode
function nativeDecode(str: string) {
  return npm91.decode(str).toString();
}

beforeAll(async () => {
  for (const f of files) {
    const fileContents = await readFile(resolve(__dirname, 'testData', f));
    fileStrings.push(fileContents.toString());
  }
});

test("Encode and decode a simple string", () => {
  const str = "The quick brown fox jumped over the lazy dog and then got eaten for his trouble.";
  expect(nativeDecode(nativeEncode(str))).toEqual(str);
  const b91Str = nativeEncode(str);
  expect(base91.encode(str)).toEqual(b91Str);
  expect(base91.decode(b91Str)).toEqual(str);
  expect(base91.decode(base91.encode(str))).toEqual(str);
});

test("Encode and decode of large files should work", () => {
  for (const fStr of fileStrings) {
    const b91fStr = nativeEncode(fStr);

    expect(nativeDecode(nativeEncode(fStr))).toEqual(fStr);
    expect(base91.encode(fStr)).toEqual(b91fStr);
    expect(base91.decode(b91fStr)).toEqual(fStr);
    expect(base91.decode(base91.encode(fStr))).toEqual(fStr);
  }
});
