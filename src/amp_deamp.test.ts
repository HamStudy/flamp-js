
import {
  Amp, CompressionType, BaseEncode
} from './amp';

import {
  Deamp
} from './deamp';

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
let testFile = `bib,time in,time out
1,01:05,01:55
2,01:05,01:55
3,01:05,01:55
4,01:05,01:55
5,01:05,01:55
6,01:05,01:55
7,01:05,01:55
8,01:05,01:55
9,01:05,01:55
10,01:05,01:55
11,01:05,01:55
12,01:05,01:55
13,01:05,01:55
14,01:05,01:55`;

test("Simple file amp and deamp", () => {
  let amp = new Amp({
    blkSize: 64,
    compression: CompressionType.LZMA, // Should be ignored, the file is too small
    filename: "testFile.txt",
    fileModifiedTime: new Date(),
    inputBuffer: testFile,
    skipProgram: true,
    useEOF: false,
    useEOT: false,
  });

  expect(amp).toBeTruthy();

  let blockCount  = amp.getDataBlockCount();
  let blocksToXmit = [...Array(blockCount).keys()].map(n=>n+1);
  blocksToXmit.sort(() => Math.random() - 0.5);

  let fileAmpString = amp.toString(blocksToXmit);

  let deamp = new Deamp();
  const onNewFileFn = jest.fn();
  const onFileUpdateFn = jest.fn();
  const onFileCompleteFn = jest.fn();
  deamp.newFileEvent.on(onNewFileFn);
  deamp.fileUpdateEvent.on(onFileUpdateFn);
  deamp.fileCompleteEvent.on(onFileCompleteFn);

  deamp.ingestString(fileAmpString);
  let fileHash = amp.buildHashString().substr(1,4);

  expect(onNewFileFn).toHaveBeenCalledTimes(1);
  expect(onFileUpdateFn).toHaveBeenCalledTimes(7);
  expect(onFileCompleteFn).toHaveBeenCalledTimes(1);
  expect(onFileUpdateFn).toHaveBeenCalledWith({
    blockCount: 4,
    blockSize: 64,
    blocksNeeded: [],
    blocksSeen: [1, 2, 3, 4],
    filename: "testFile.txt",
    hash: fileHash,
  });

  let outFile = deamp.getFile(fileHash);

  expect(outFile.getContent()).toEqual(testFile);
});

test("Compressed base91 file amp and deamp", () => {
  let amp = new Amp({
    blkSize: 64,
    compression: CompressionType.LZMA, // Should be ignored, the file is too small
    forceCompress: true,
    base: BaseEncode.b91,
    filename: "testFile.txt",
    fileModifiedTime: new Date(),
    inputBuffer: testFile,
    skipProgram: true,
    useEOF: false,
    useEOT: false,
  });

  expect(amp).toBeTruthy();

  let blockCount  = amp.getDataBlockCount();
  let blocksToXmit = [...Array(blockCount).keys()].map(n=>n+1);
  blocksToXmit.sort(() => Math.random() - 0.5);

  let fileAmpString = amp.toString(blocksToXmit);

  let deamp = new Deamp();
  const onNewFileFn = jest.fn();
  const onFileUpdateFn = jest.fn();
  const onFileCompleteFn = jest.fn();
  deamp.newFileEvent.on(onNewFileFn);
  deamp.fileUpdateEvent.on(onFileUpdateFn);
  deamp.fileCompleteEvent.on(onFileCompleteFn);

  deamp.ingestString(fileAmpString);
  let fileHash = amp.buildHashString().substr(1,4);

  expect(onNewFileFn).toHaveBeenCalledTimes(1);
  expect(onFileCompleteFn).toHaveBeenCalledTimes(1);
  expect(onFileUpdateFn).toHaveBeenCalledTimes(7);
  expect(onFileUpdateFn).toHaveBeenLastCalledWith({
    blockCount: blockCount,
    blockSize: 64,
    blocksNeeded: [],
    blocksSeen: blocksToXmit.sort((a, b) => a - b),
    filename: "testFile.txt",
    hash: fileHash,
  });
  expect(onFileCompleteFn).toHaveBeenCalledTimes(1);

  let outFile = deamp.getFile(fileHash);

  expect(outFile.getContent()).toEqual(testFile);
});

xtest("Large file amp uncompressed then deamp", () => {
  let fileNo = 3;
  let curFile = fileStrings[fileNo]; // large file
  let blockSize = 64;

  let amp = new Amp({
    blkSize: blockSize,
    compression: false, // Should be ignored, the file is too small
    filename: files[fileNo],
    fileModifiedTime: new Date(),
    inputBuffer: curFile,
    skipProgram: true,
    useEOF: false,
    useEOT: false,
    base: BaseEncode.b91
  });

  let blockCount  = amp.getDataBlockCount();
  expect(blockCount).toBe(Math.ceil(curFile.length / blockSize));
  let blocksToXmit = [...Array(blockCount).keys()].map(n=>n+1);
  // shuffle the block order to make sure out-of-order receive works
  blocksToXmit.sort(() => Math.random() - 0.5);

  let fileAmpString = amp.toString(blocksToXmit);

  let deamp = new Deamp();
  const onNewFileFn = jest.fn();
  const onFileUpdateFn = jest.fn();
  const onFileCompleteFn = jest.fn();
  deamp.newFileEvent.on(onNewFileFn);
  deamp.fileUpdateEvent.on(onFileUpdateFn);
  deamp.fileCompleteEvent.on(onFileCompleteFn);

  deamp.ingestString(fileAmpString);
  let fileHash = amp.buildHashString().substr(1,4);

  expect(onNewFileFn).toHaveBeenCalledTimes(1);
  expect(onFileCompleteFn).toHaveBeenCalledTimes(1);
  expect(onFileUpdateFn).toHaveBeenLastCalledWith({
    blockCount: blockCount,
    blockSize: blockSize,
    blocksNeeded: [],
    blocksSeen: blocksToXmit.sort((a, b) => a - b),
    filename: files[fileNo],
    hash: fileHash,
  });

  let outFile = deamp.getFile(fileHash);

  expect(outFile.getContent()).toEqual(curFile);
});

xtest("Large file amp compressed then deamp", () => {
  let fileNo = 3;
  let curFile = fileStrings[fileNo]; // large file
  let blockSize = 64;

  let amp = new Amp({
    blkSize: blockSize,
    compression: CompressionType.LZMA, // Should be ignored, the file is too small
    filename: files[fileNo],
    fileModifiedTime: new Date(),
    inputBuffer: curFile,
    skipProgram: true,
    useEOF: false,
    useEOT: false,
    base: BaseEncode.b64
  });

  let blockCount  = amp.getDataBlockCount();
  // Without compression this is how big it would be
  expect(blockCount).toBeLessThan(Math.ceil(curFile.length / blockSize));
  let blocksToXmit = [...Array(blockCount).keys()].map(n=>n+1);
  // shuffle the block order to make sure out-of-order receive works
  blocksToXmit.sort(() => Math.random() - 0.5);

  let fileAmpString = amp.toString(blocksToXmit);

  let deamp = new Deamp();
  const onNewFileFn = jest.fn();
  const onFileUpdateFn = jest.fn();
  const onFileCompleteFn = jest.fn();
  deamp.newFileEvent.on(onNewFileFn);
  deamp.fileUpdateEvent.on(onFileUpdateFn);
  deamp.fileCompleteEvent.on(onFileCompleteFn);

  deamp.ingestString(fileAmpString);
  let fileHash = amp.buildHashString().substr(1,4);

  expect(onNewFileFn).toHaveBeenCalledTimes(1);
  expect(onFileCompleteFn).toHaveBeenCalledTimes(1);
  expect(onFileUpdateFn).toHaveBeenLastCalledWith({
    blockCount: blockCount,
    blockSize: blockSize,
    blocksNeeded: [],
    blocksSeen: blocksToXmit.sort((a, b) => a - b),
    filename: files[fileNo],
    hash: fileHash,
  });

  let outFile = deamp.getFile(fileHash);

  expect(outFile.getContent()).toEqual(curFile);
});