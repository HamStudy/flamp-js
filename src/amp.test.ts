
import { crc16 } from './crc16';
import {
  Amp
} from './amp';

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

test("Create an AMP instance and do stuff", () => {
  const blkSize = 64;
  const filename = "testFile.txt";
  const fileModifiedTime = new Date("2019-06-02T06:53:28.452Z");
  let amp = new Amp({
    blkSize: 64,
    compression: false,
    filename: filename,
    fileModifiedTime: fileModifiedTime,
    inputBuffer: testFile
  });
  let ampString  = amp.toString();
  expect(amp.hash).toEqual('6074')
  expect((amp as any).filename).toEqual(filename);
  expect((amp as any).fileModifiedTime).toEqual(fileModifiedTime);
  expect((amp as any).blkSize).toEqual(blkSize);

  expect(amp).toBeTruthy();

  let blocksToFetch = [1,2,3,4];
  let str = amp.toString(blocksToFetch);

  for (let blNum of blocksToFetch) {
    let startIdx = blkSize * (blNum - 1);
    let substr = `:${blNum}}${testFile.substr(startIdx, 4)}`;
    expect(str.indexOf(substr)).toBeGreaterThan(-1);
  }
});