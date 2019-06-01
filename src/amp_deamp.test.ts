
import {
  Amp
} from './amp';

import {
  Deamp
} from './deamp';

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

test("Stream an amp instance", () => {
  let amp = new Amp({
    blkSize: 64,
    compression: false,
    filename: "testFile.txt",
    fileModifiedTime: new Date(),
    inputBuffer: testFile
  });

  expect(amp).toBeTruthy();

  let blockCount  = amp.getDataBlockCount();
  let blocksToXmit = [...Array(blockCount).keys()].map(n=>n+1);

  let fileAmpString = amp.toString(blocksToXmit);

  let deamp = new Deamp();
  const onNewFileFn = jest.fn();
  const onFileUpdateFn = jest.fn();
  const onFileCompleteFn = jest.fn();
  deamp.newFileEvent.on(onNewFileFn);
  deamp.fileUpdateEvent.on(onFileUpdateFn);
  deamp.fileCompleteEvent.on(onFileCompleteFn);

  deamp.ingestString(fileAmpString);

  expect(onNewFileFn).toHaveBeenCalledTimes(1);
  expect(onFileUpdateFn).toHaveBeenCalledTimes(8);
  expect(onFileUpdateFn).toHaveBeenCalledWith({
    blockCount: 4,
    blockSize: 64,
    blocksNeeded: [],
    blocksSeen: [1, 2, 3, 4],
    filename: "testFile.txt",
    fileSize: 221,
    hash: amp.buildHashString().substr(1,4),
  });
  expect(onFileCompleteFn).toHaveBeenCalledTimes(1);

});
