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

import moment from 'moment';
import { crc16 as crc16JS } from './crc16';
import { HTypes, LTypes, MODIFIED_TIME_FORMAT, lzmaCompressedPrefix } from './amp';

import  *  as lzma from './lzma';

import * as base91 from './base91';
import * as base64 from './base64';
import { TypedEvent } from './TypedEvent';

(window as any).moment = moment;

let crc16 = crc16JS;

export interface NewFileEvent {
  /** This is the only thing guaranteed on this event */
  hash: string;
}

/**
 * Fired every time a new block is received;
 * Fields which aren't known will be undefined.
 * If you don't have filename or blockCount then
 * the header block(s) haven't been received yet
 * or were missed
 */
export interface FileUpdateEvent {
  hash: string;
  /** The filename, if we know it */
  filename?: string;
  /** An array of block numbers which we haven't seen yet (if known) */
  blocksNeeded?: number[];
  /** 
   * An array of block numbers we've seen; this is knowable even 
   * if we don't know how many there are total, so we're including
   * it. Until we have a valid "SIZE" record we can't say how many
   * there are overall, but we can start collecting information about it
   */
  blocksSeen?: number[];
  /** The total number of blocks expected (if known) */
  blockCount?: number;
  /** The size of each block (if known) */
  blockSize?: number;
  /** The size of the file (if known) */
  fileSize?: number;
}

/**
 * Fired when a file is complete and ready to
 * read. In order for this to fire we need to receive:
 *   * The filename (FILE record)
 *   * The file size (SIZE record)
 *   * All data blocks
 * 
 * After you have processed the file you should call
 * deleteFile(hash) to free the memory used by the file
 */
export interface FileCompleteEvent {
  filename: string;
  hash: string;
}

// Apply startsWith / endsWith polyfills if needed; this is a browser after all =]
(function (sp) {

    if (!sp.startsWith)
      sp.startsWith = function (str) {
        return !!(str && this) && !this.lastIndexOf(str, 0)
      }
  
    if (!sp.endsWith)
      sp.endsWith = function (str) {
        var offset = str && this ? this.length - str.length : -1
        return offset >= 0 && this.lastIndexOf(str, offset) === offset
      }
  
  })(String.prototype);

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
  headerBlocks: Block[] = [];
  dataBlock: {[blockNum: number]: Block|undefined} = {};
  name?: string;
  size?: number;
  blockCount?: number;
  blockSize?: number;
  hash: string;
  modified?: Date;
  constructor(firstBlock: Block) {
    this.hash = firstBlock.hash;
    this.addBlock(firstBlock);
  }
  getOrderedDataBlocks() {
    if (!this.blockCount) {
      throw new Error("Missing file header");
    }
    // Blocks are ordered 1 .. blockCount and we may be missing some
    let orderedBlocks = [...Array(this.blockCount).keys()].map(i => this.dataBlock[i+1]);

    return orderedBlocks;
  }
  getNeededBlocks() : number[] {
    let blocks = this.getOrderedDataBlocks();

    return Object.keys(blocks).map(b => (blocks[Number(b)] ? null : b)).filter(b => !b) as any;
  }
  getRawContent() {
    if (!this.blockCount) {
      throw new Error("Missing file header");
    }
    let blocks = this.getOrderedDataBlocks();
    if (blocks.some(b => !b)) {
      // We're missing one or more blocks!
      throw new Error("Can't get content when we are missing blocks");
    }
    return (<Block[]>blocks).map(b => b.data).join('');
  }
  getContent() {
    let content = this.getRawContent();
    if (content.length !== this.size) {
      console.error('File size is not correct', content.length, this.size);
      return null;
    }

    if (content.startsWith('[b') && content.endsWith(':end]')) {
      let endOfStart = content.indexOf(']') + 1;
      let tag = content.substring(0, endOfStart);
      content = content.substring(endOfStart, content.lastIndexOf('['));
      switch(tag) {
        case '[b64:start]':
          content = base64.decode(content);
          break;
        case '[b91:start]':
          content = base91.decode(content);
          break;
      }
    }
    if (content.startsWith(lzmaCompressedPrefix)) {
      let lzmaContent = content.substring(lzmaCompressedPrefix.length);
      content = lzma.decodeSync(lzmaContent);
    }
    return content;
  }
  toBlob() {
    let content = this.getContent();
    return new Blob([content as any], {type: 'text/plain'});
  }

  getUpdateRecord() : FileUpdateEvent {
    return {
      hash: this.hash,
      filename: this.name,
      blockCount: this.blockCount,
      blockSize: this.blockSize,
      fileSize: this.size,
      blocksSeen: Object.keys(this.dataBlock).map(n => Number(n)),
      blocksNeeded: this.blockSize ? this.getNeededBlocks() : void 0,
    };
  }
  /**
   * Adds a received block to the file; returns true if the block
   * is new (has not been received already for this file)
   * @param inBlock 
   */
  addBlock(inBlock: Block): boolean {
    let isNew = false;
    switch (inBlock.ltype) {
      case LTypes.FILE:
        this.name = inBlock.data.substr(15);
        this.modified = moment(inBlock.data.substr(0, 14), MODIFIED_TIME_FORMAT).toDate();
        break;
      case LTypes.ID:
        this.fromCallsign = inBlock.data;
        break;
      case LTypes.SIZE:
        let pieces = inBlock.data.split(' ').map(v => parseInt(v, 10));
        this.size = pieces[0];
        this.blockCount = pieces[1];
        this.blockSize = pieces[2];
        break;
      case LTypes.DATA:
        return this.addDataBlock(inBlock);
      default:
        break;
    }
    if (!this.headerBlocks.find(b => b.ltype === inBlock.ltype && b.checksum === inBlock.checksum)) {
      this.headerBlocks.push(inBlock);
      return true;
    }
    return false;
  }
  addDataBlock(inBlock: Block): boolean {
    let blockNum = inBlock.blockNum as number;
    if (!this.dataBlock[blockNum]) {
      this.dataBlock[blockNum] = inBlock;
      return true;
    }

    return false;
  }

  isComplete() : boolean {
    if (!this.name || !this.blockCount) {
      return false
    }
    try {
      let rawContent = this.getRawContent();
      return rawContent.length === this.size;
    } catch {
      return false;
    }
  }
}

export interface Files {
  [K: string]: File;
}

export class Deamp {
  private PROGRAM = "JSAMP";
  private VERSION = "0.0.1";

  // Fields used in receiving.

  public newFileEvent = new TypedEvent<NewFileEvent>();
  public fileUpdateEvent = new TypedEvent<FileUpdateEvent>();
  public fileCompleteEvent = new TypedEvent<FileCompleteEvent>();
  private receivedFiles: Files = {};
  private inputBuffer: string = "";

  constructor(opts?: {}) {
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
      let block: ReturnType<typeof Block.fromBuffer>;
      while (block = Block.fromBuffer(ltype, this.inputBuffer)) {
        this.addBlockToFiles(block);
        let blockBufferIdx = this.inputBuffer.indexOf(block.buffer);
        let s1 = this.inputBuffer.substring(0, blockBufferIdx);
        let s2 = this.inputBuffer.substring(blockBufferIdx + block.buffer.length);
        this.inputBuffer = s1 + s2;

        if (this.inputBuffer.indexOf(LTypes[ltype]) === -1) { break; }
      }
    }
  }

  addBlockToFiles(inBlock: Block) {
    let isNewBlock = false;
    let file = this.receivedFiles[inBlock.hash];
    if (!this.receivedFiles[inBlock.hash]) {
      file = this.receivedFiles[inBlock.hash] = new File(inBlock);
      isNewBlock = true;
      this.newFileEvent.emit({
        hash: inBlock.hash
      });
    } else {
      isNewBlock = file.addBlock(inBlock)
    }
    if (isNewBlock) {
      this.fileUpdateEvent.emit(file.getUpdateRecord());
      if (file.isComplete()) {
        this.fileCompleteEvent.emit({
          hash: file.hash,
          filename: file.name as string,
        })
      }
    }
  }

  getFilesEntries() { return Object.keys(this.receivedFiles); }
  /**
   * Gets the file but leaves it in memory
   * @param fileHash 
   */
  getFile(fileHash: string) {
    return this.receivedFiles[fileHash];
  }
  /**
   * Retrieves the file and frees all related memory
   * @param fileHash 
   */
  popFile(fileHash: string) {
    let file = this.receivedFiles[fileHash];
    delete this.receivedFiles[fileHash];
    return file;
  }
  /**
   * Gets the file contents by hash
   * @param fileHash 
   */
  getFileContents(fileHash: string) {
    let file = this.getFile(fileHash);
    let contents = file.getContent();
    return contents;
  }
}
