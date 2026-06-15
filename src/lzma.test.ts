
import * as lzma from './lzma';

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

beforeAll(async () => {
  for (const f of files) {
    const fileContents = await readFile(resolve(__dirname, 'testData', f));
    fileStrings.push(fileContents.toString());
  }
});

test("Encode and decode a simple string", () => {
  const str = "The quick brown fox jumped over the lazy dog and then got eaten for his trouble.";
  expect(lzma.decodeSync(lzma.encodeSync(str))).toEqual(str);
});

test("Encode and decode of large files should work", () => {
  for (const fStr of fileStrings) {
    expect(lzma.decodeSync(lzma.encodeSync(fStr))).toEqual(fStr);
  }
});
