
import * as base64 from './base64';

declare function require(m: string): any;
const fs = require('fs').promises;
const path = require('path');
declare const __dirname: string;

const files = [
  "Bids.csv",
  "TitanicSurvival.csv",
  "chickweed.csv",
  "edcT.csv",
  "mecter.csv",
  "treering.csv",
];

const fileStrings: string[] = [];

declare const Buffer: any;

// Uses native node libraries to encode
function nativeEncode(str: string) {
  return Buffer.from(str).toString('base64');
}
// Uses native node libraries to decode
function nativeDecode(str: string) {
  return Buffer.from(str, 'base64').toString();
}

beforeAll(async () => {
  for (const f of files) {
    const fileContents = await fs.readFile(path.resolve(__dirname, 'testData', f));
    fileStrings.push(fileContents.toString());
  }
});

test("Encode and decode a simple string", () => {
  const str = "The quick brown fox jumped over the lazy dog and then got eaten for his trouble.";
  const b64Str = nativeEncode(str);
  expect(base64.encode(str)).toEqual(b64Str);
  expect(base64.decode(b64Str)).toEqual(str);
  expect(base64.decode(base64.encode(str))).toEqual(str);
});

test("Encode and decode of large files should work", () => {
  for (const fStr of fileStrings) {
    const b64fStr = nativeEncode(fStr);

    expect(base64.encode(fStr)).toEqual(b64fStr);
    expect(base64.decode(b64fStr)).toEqual(fStr);
    expect(base64.decode(base64.encode(fStr))).toEqual(fStr);
  }
});
