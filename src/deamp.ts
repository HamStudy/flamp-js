// JavaScript Amateur Multicast Protocol AMP-2 Version 3
// Implemented from specification document
// http://www.w1hkj.com/files/flamp/Amp-2.V3.0.Protocol.pdf
// • Version 1.0.0 - W5ALT, Walt Fair, Jr. (Derived From)
// • Version 2.0.0 - W1HKJ, Dave Freese, w1hkj@w1hkj.com
// • Version 2.0.1 - W1HKJ, Dave Freese, w1hkj@w1hkj.com, 5 Oct 2012
// • Version 3.0.0 - KK5VD, Robert Stiles, kk5vd@yahoo.com, 21 April 2013
// • Javascript Implementation by KV9G, Michael Stufflebeam cpuchip@gmail.com, 29 June 2018
//

// tslint:disable:max-classes-per-file

import { crc16 as crc16JS } from './crc16';
import { HTypes, LTypes } from './amp';


let crc16 = crc16JS;

export class Block { // Protocol Block
  static fromBuffer(ltype: LTypes, buffer: string): Block | null {
    const block = new Block();
    block.ltype = ltype;
    let findBlockInfo = new RegExp(`<${block.ltype} (\\d+) (.+)>({(.+):(.+)}|{(.*)})`);
    let blockInfo = findBlockInfo.exec(buffer);
    if (!blockInfo) { return null; }

    block.size = Number(blockInfo[1]);
    block.data = buffer.substr(blockInfo.index + blockInfo[0].length, block.size - blockInfo[3].length);
    block.buffer = `${blockInfo[0]}${block.data}`;
    block.checksum = blockInfo[2];
    block.hash = blockInfo[4] || blockInfo[6];
    let blockNumOrHType = blockInfo[5];
    if (blockNumOrHType in HTypes) {
      block.htype = blockNumOrHType;
    } else if (blockNumOrHType) {
      block.blockNum = Number(blockNumOrHType);
    }

    // Validate Protocol Block with checksum
    if (!block.data || !block.checksum) { return null; }
    try {
      if (crc16(block.getHashString() + block.data) === block.checksum) {
        return block;
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  }

  buffer!: string;
  checksum!: string; // crc16 of hash:# + data
  blockNum?: number; // Data block number
  data!: string;
  hash!: string;
  htype?: string;
  ltype!: LTypes;
  size!: number;

  getHashString() {
    return "{" + this.hash + (this.blockNum ? ':' + this.blockNum : "") + "}";
  }
}

export class File {
  fromCallsign: string | null = null;
  blocks: Block[] = [];
  name?: string;
  size?: number;
  hash?: string;
  constructor(firstBlock: Block) {
    this.hash = firstBlock.hash;
    this.addBlock(firstBlock);
  }
  toBlob() {
    let content = this.getDataBlocks().map((b) => b.data).join('');
    if (content.length !== this.size) {
      console.error('File size is not correct', content.length, this.size);
      return null;
    }
    return new Blob([content], {type: 'text/plain'});
  }
  getBody() {
    let content = this.getDataBlocks().map((b) => b.data).join('');
    if (content.length !== this.size) {
      console.error('File size is not correct', content.length, this.size);
      return null;
    }
    return content;
  }
  addBlock(inBlock: Block): boolean {
    switch (inBlock.ltype) {
      case LTypes.FILE:
        this.name = inBlock.data.split(':')[1];
        break;
      case LTypes.ID:
        this.fromCallsign = inBlock.data;
        break;
      case LTypes.SIZE:
        this.size = Number(inBlock.data.split(' ')[0]);
        break;
      default:
        break;
    }
    this.blocks.push(inBlock);
    let contentLength = this.getDataBlocks().reduce((s, b) => s += b.data.length, 0)
    return this.size !== (void 0) && contentLength === this.size;
  }
  getBlocks() {
    return this.blocks;
  }
  getDataBlocks() {
    return this.blocks.filter((block) => block.ltype === LTypes.DATA);
  }
}

export interface Files {
  [K: string]: File;
}

export type ReceivedFileCallback = (file: File) => void;

export class Deamp {
  private PROGRAM = "JSAMP";
  private VERSION = "0.0.1";

  // Fields used in receiving.

  private receivedFiles: Files = {};
  private inputBuffer: string = "";

  private receivedFileCallback?: ReceivedFileCallback;

  constructor(opts?: {
    receivedFileCallback?: ReceivedFileCallback,
  }) {
    if (opts && opts.receivedFileCallback) {
      this.setReceivedFileCallback(opts.receivedFileCallback);
    }
  }

  setReceivedFileCallback(callback: ReceivedFileCallback) {
    this.receivedFileCallback = function receivedFileCallback(file: File) {
      callback(file);
    };
  }

  setCrc16(crc: typeof crc16) {
    crc16 = crc;
  }

  clearBuffer() {
    this.inputBuffer = '';
  }

  ingestString(inString: string) {
    this.inputBuffer += inString;
    this.lookForBlocks();
    return;
  }

  lookForBlocks(): void {
    for (let key in LTypes) {
      let ltype = LTypes[key] as LTypes;
      if (this.inputBuffer.indexOf(LTypes[ltype]) === -1) { continue; }
      let block = Block.fromBuffer(ltype, this.inputBuffer);
      while (block) {
        this.addBlockToFiles(block);
        let blockBufferIdx = this.inputBuffer.indexOf(block.buffer);
        let s1 = this.inputBuffer.substr(0, blockBufferIdx);
        let s2 = this.inputBuffer.substr(blockBufferIdx + block.buffer.length);
        this.inputBuffer = s1 + s2;

        if (this.inputBuffer.indexOf(LTypes[ltype]) === -1) { break; }
        block = Block.fromBuffer(ltype, this.inputBuffer);
      }
    }
  }

  addBlockToFiles(inBlock: Block) {
    if (!this.receivedFiles[inBlock.hash]) {
      this.receivedFiles[inBlock.hash] = new File(inBlock);
    } else {
      let fileCompleted = this.receivedFiles[inBlock.hash].addBlock(inBlock);
      if (fileCompleted && this.receivedFileCallback) {
        let file = this.receivedFiles[inBlock.hash];
        this.receivedFileCallback(file);
      }
    }
  }

  getFilesEntries() { return Object.keys(this.receivedFiles); }
  getFile(fileHash: string) {
    return this.receivedFiles[fileHash];
  }
  getFileContents(fileHash: string) {
    let file = this.getFile(fileHash);
    let contents = file.getDataBlocks().map((block) => block.data);
    return contents.join("");
  }
}
