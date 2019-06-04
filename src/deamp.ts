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
import { Block } from './block';
import { crc16 as crc16JS } from './crc16';
import { LTypes, MODIFIED_TIME_FORMAT, lzmaCompressedPrefix } from './amp';

import  *  as lzma from './lzma';

import * as base91 from './base91';
import * as base64 from './base64';
import { TypedEvent } from './TypedEvent';
import { Compressor } from './compressor';

(window as any).moment = moment;

let crc16 = crc16JS;

enum ParserState {
  LOOKFORBLOCK,
  BLOCKTAG,
  DATA
};

function bad(b: never) : never {
  throw new Error("Invalid state!");
}

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
  
  })(String.prototype)


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
  completeFired: boolean = false;
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

    return Object.keys(blocks).map(b => (blocks[Number(b)] ? null : b)).filter(b => !!b) as any;
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
    let c = Compressor.getDecompressor(content);
    if (c) {
      content = c.decompress(content);
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
    switch (inBlock.keyword) {
      case LTypes.FILE:
        this.name = inBlock.data.substring(15);
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
    if (!this.headerBlocks.find(b => b.keyword === inBlock.keyword && b.checksum === inBlock.checksum)) {
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
      // Raw content length will be less than
      // the size if we are compressed or encoded,
      // so we don't use that check anymore.
      // let rawContent = this.getRawContent();
      // return rawContent.length === this.size;
      //
      // When we have no needed blocks and we know
      // the name and the block count then WE ARE DONE!
      let needed = this.getNeededBlocks();
      return needed.length == 0;
    } catch {
      return false;
    }
  }
}

export interface Files {
  [K: string]: File;
}

const BlockTagValidChars = /^[A-Za-z0-9 ]$/;
const BlockTagRegex = /^([A-Za-z]+) ([0-9]+) ([0-9A-Fa-f]+)$/;

export class Deamp {
  private PROGRAM = "JSAMP";
  private VERSION = "0.0.1";

  private parserState = ParserState.LOOKFORBLOCK;
  private parserData = {
    dataStart: 0,
    dataLen: 0,
    checksum: "",
    tagname: LTypes.ID,
  };

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

  pruneInputBuffer() {
    let buffer = this.inputBuffer;
    let lookAgain = true;

    while (lookAgain) {
      lookAgain = false;
      let firstBracket = buffer.indexOf('<');
      if (firstBracket > -1) {
        // Discard everything up to the first bracket
        buffer = buffer.substr(firstBracket);
        let closeBracket = buffer.indexOf('>', 1);
        if (closeBracket < 0 || closeBracket > 30) {
          // This isn't a valid block
          buffer = buffer.substr(1); // Drop the bracket, try again
          lookAgain = true;
        }
      } else {
        buffer = '';
      }
    }
    // If it isn't in the last 300 characters then it's not going to be used
    this.inputBuffer = buffer.substr(-300);
  }

  /**
   * This should only be called for unit tests
   */
  __getInputBuffer() {
    return this.inputBuffer;
  }

  ingestString(inString: string) {
    for (let char of inString.split('')) {
      let block = this._processInput(char);
      if (block) {
        this.addBlockToFiles(block);
      }
    }
    return;
  }

  // Left intentionally public to allow us to test it separately
  _processInput(oneChar: string) : Block | undefined {
    switch(this.parserState) {
      case ParserState.LOOKFORBLOCK:
        // Default state, we haven't found anything yet
        if (oneChar == '<') {
          // Hey, this could be the start of a beautiful tag!
          this.inputBuffer = oneChar;
          this.parserState = ParserState.BLOCKTAG;
        }
        break;
      case ParserState.BLOCKTAG:
        // We might be inside a block, so we're looking for
        // useful things
        if (BlockTagValidChars.test(oneChar)) {
          // This is something which could very well go inside a block tag! Way cool!
          this.inputBuffer += oneChar;
          if (this.inputBuffer.length > 25) {
            // Seriously, if we're 25 characters in with no > there is no way
            // this is a real tag, so let's just drop out and try again
            this.inputBuffer = "";
            this.parserState = ParserState.LOOKFORBLOCK;
          }
        } else if (oneChar == '>') {
          // Hey, we've found the end of the block tag; wonder what it is and if it is valid?
          let blockTagContent = this.inputBuffer.substring(1);
          let search = BlockTagRegex.exec(blockTagContent);
          if (search && Object.values(LTypes).indexOf(search[1].toUpperCase()) > -1) {
            // Hey, this might actually be a real tag!
            this.parserData.tagname = search[1].toUpperCase() as LTypes;
            let dataLen = this.parserData.dataLen = parseInt(search[2], 10);
            let checksum = this.parserData.checksum = search[3];
            if (isNaN(dataLen) || checksum.length != 4) {
              // Oops, malformed!
              this.parserState = ParserState.LOOKFORBLOCK;
              this.inputBuffer = "";
              return;
            }

            this.inputBuffer += '>';
            this.parserData.dataStart = this.inputBuffer.length;
            this.parserState = ParserState.DATA;
          } else {
            // Not a valid tag! Discard and go back to the old state
            this.inputBuffer = "";
            this.parserState = ParserState.LOOKFORBLOCK;
          }
        } else {
          // This isn't a close tag and it's not valid for inside a block,
          // so the block we're "in" is just a sad, sad illusion. Drop back
          // but make sure we process this char in case it's the beginning of
          // a real block
          this.inputBuffer = "";
          this.parserState = ParserState.LOOKFORBLOCK;
          return this._processInput(oneChar);
        }
        break;
      case ParserState.DATA:
        // We've got a potentially valid block and we know how long it is,
        // and we haven't reached the end yet
        this.inputBuffer += oneChar;

        // Check to see if that takes us to the end or not
        let dataLen = this.inputBuffer.length - this.parserData.dataStart;
        if (dataLen == this.parserData.dataLen) {
          // We have received a full block! (well, maybe... let's double check)
          let data = this.inputBuffer.substr(this.parserData.dataStart, dataLen);
          let block = new Block(
            this.parserData.tagname,
            data);
          if (block.checksum != this.parserData.checksum) {
            // We got the block and checked it and .... it was bad.
            // Oops.
            // Well, toss this one and try again -- but keep in mind
            // that we might actually need something from the data!
            this.parserState = ParserState.LOOKFORBLOCK;
            this.inputBuffer = "";

            if (data.indexOf('<')) {
              // There might be another block in there!
              this.ingestString(data.substr(data.indexOf('<')));
            }
          } else {
            // Sweet! We found a complete block. Reset and continue!
            this.inputBuffer = "";
            this.parserState = ParserState.LOOKFORBLOCK;
            return block;
          }
        }
        break;
      default:
        return bad(this.parserState);
    }
  }

  addBlockToFiles(inBlock: Block) {
    let isNewBlock = false;
    let file = this.receivedFiles[inBlock.hash];
    if (!file) {
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
      if (file.isComplete() && !file.completeFired) {
        this.fileCompleteEvent.emit({
          hash: file.hash,
          filename: file.name as string,
        });
        file.completeFired = true;
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
