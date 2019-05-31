
import * as base91 from './base91';

declare function require(m: string): any;
const fs = require('fs').promises;
const path = require('path');
const npm91 = require('node-base91');
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
  return npm91.encode(str);
}
// Uses native node libraries to decode
function nativeDecode(str: string) {
  return npm91.decode(str).toString();
}

beforeAll(async () => {
  for (let f of files) {
    let fileContents = await fs.readFile(path.resolve(__dirname, 'testData', f));
    fileStrings.push(fileContents.toString());
  }
});

test("Encode and decode a simple string", () => {
  let str = "The quick brown fox jumped over the lazy dog and then got eaten for his trouble.";
  expect(nativeDecode(nativeEncode(str))).toEqual(str);
  let b91Str = nativeEncode(str);
  expect(base91.encode(str)).toEqual(b91Str);
  expect(base91.decode(b91Str)).toEqual(str);
  expect(base91.decode(base91.encode(str))).toEqual(str);
});

test("Encode and decode of large files should work", () => {
  for (let fStr of fileStrings) {
    let b91fStr = nativeEncode(fStr);

    expect(nativeDecode(nativeEncode(fStr))).toEqual(fStr);
    expect(base91.encode(fStr)).toEqual(b91fStr);
    expect(base91.decode(b91fStr)).toEqual(fStr);
    expect(base91.decode(base91.encode(fStr))).toEqual(fStr);
  }
});