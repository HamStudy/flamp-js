
import * as base64 from './base64';

declare function require(m: string): any;
const fs = require('fs').promises;
const path = require('path');
declare const __dirname: string;

let files = [
  "Bids.csv", 
  "TitanicSurvival.csv", 
  "chickweed.csv", 
  "edcT.csv", 
  "mecter.csv", 
  "treering.csv", 
];

let fileStrings = [] as string[];

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
  for (let f of files) {
    let fileContents = await fs.readFile(path.resolve(__dirname, 'testData', f));
    fileStrings.push(fileContents.toString());
  }
});

test("Encode and decode a simple string", () => {
  let str = "The quick brown fox jumped over the lazy dog and then got eaten for his trouble.";
  let b64Str = nativeEncode(str);
  expect(base64.encode(str)).toEqual(b64Str);
  expect(base64.decode(b64Str)).toEqual(str);
  expect(base64.decode(base64.encode(str))).toEqual(str);
});

test("Encode and decode of large files should work", () => {
  for (let fStr of fileStrings) {
    let b64fStr = nativeEncode(fStr);

    expect(base64.encode(fStr)).toEqual(b64fStr);
    expect(base64.decode(b64fStr)).toEqual(fStr);
    expect(base64.decode(base64.encode(fStr))).toEqual(fStr);
  }
});