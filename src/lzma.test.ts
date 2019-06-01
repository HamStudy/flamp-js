
import * as lzma from './lzma';

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

beforeAll(async () => {
  for (let f of files) {
    let fileContents = await fs.readFile(path.resolve(__dirname, 'testData', f));
    fileStrings.push(fileContents.toString());
  }
});

test("Encode and decode a simple string", () => {
  let str = "The quick brown fox jumped over the lazy dog and then got eaten for his trouble.";
  expect(lzma.decodeSync(lzma.encodeSync(str))).toEqual(str);
});

test("Encode and decode of large files should work", () => {
  for (let fStr of fileStrings) {
    expect(lzma.decodeSync(lzma.encodeSync(fStr))).toEqual(fStr);
  }
});