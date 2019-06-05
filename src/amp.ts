// JavaScript Amateur Multicast Protocol AMP-2 Version 3
// Implemented from specification document
// http://www.w1hkj.com/files/flamp/Amp-2.V3.0.Protocol.pdf
// • Version 1.0.0 - W5ALT, Walt Fair, Jr. (Derived From)
// • Version 2.0.0 - W1HKJ, Dave Freese, w1hkj@w1hkj.com
// • Version 2.0.1 - W1HKJ, Dave Freese, w1hkj@w1hkj.com, 5 Oct 2012
// • Version 3.0.0 - KK5VD, Robert Stiles, kk5vd@yahoo.com, 21 April 2013
// • Javascript Implementation by KV9G, Michael Stufflebeam cpuchip@gmail.com, 29 June 2018
//

import moment from 'moment';
import { Block } from './block';
import { crc16 } from './crc16';

import { Compressor }  from './compressor';

import * as base91 from './base91';
import * as base64 from './base64';
import * as lzma from './lzma';

export const lzmaCompressedPrefix = '\u0001LZMA';
export const MODIFIED_TIME_FORMAT = "YYYYMMDDHHmmss";

const unprintableRegex = /[^ -~\n\r]+/;
function hasNotPrintable(c: string) : boolean {
  return unprintableRegex.test(c);
}

function assertUnreachable(x: never): never {
    throw new Error("Invalid case");
}

export enum LTypes {
  FILE = "FILE",
  ID = "ID",
  DTTM = "DTTM",
  SIZE = "SIZE",
  DESC = "DESC",
  DATA = "DATA",
  PROG = "PROG",
  CNTL = "CNTL",
}
export enum ControlWord {
  EOF = "EOF",
  EOT = "EOT",
}
export enum BaseEncode {
  b64 = 'base64',
  b91 = 'base91',
  // b128 = 'base128',
  // b256 = 'base256',
}
export enum CompressionType {
  LZMA = 'LZMA',
}
export interface IOptions {
  compression?: CompressionType | false,
  forceCompress?: boolean;
  base?: BaseEncode,
  fromCallsign?: string,
  toCallsign?: string,
  filename: string,
  fileModifiedTime: Date,
  inputBuffer: string,
  blkSize: number,
  skipProgram?: boolean,
  useEOF?: boolean,
  useEOT?: boolean,
}

export class Amp {
  static getHash(filename: string, modified: Date, compressed: boolean, baseConversion: BaseEncode | '', blockSize: number) {
    // | DTS : FN |C| B |BS|
    // DTS = Date/Time Stamp
    // FN = File Name
    // C = Compression 1=ON,0=OFF
    // B = Base Conversion (base64, base128, or base256)
    // BS = Block Size, 1 or more characters
    // | = Field separator.
    let DTS = moment(modified).format(MODIFIED_TIME_FORMAT);
    return crc16(`${DTS}:${filename}${compressed ? '1' : '0'}${baseConversion}${blockSize}`);

  }
  private fromCallsign: string | null;
  private toCallsign: string | null;
  private filename: string;
  private fileModifiedTime: Date;
  private inputBuffer: string;
  private blkSize: number;

  private PROGRAM = "JSAMP";
  private VERSION = "0.0.1";

  private base: '' | BaseEncode = "";
  private compression: CompressionType | false = false;
  private forceCompress = false;
  private blocks: {
    [LTypes.PROG]?: Block;
    [LTypes.FILE]?: Block;
    [LTypes.ID]?: Block;
    [LTypes.SIZE]?: Block;
    [key: number]: Block; // Data blocks
    [ControlWord.EOF]?: Block;
    [ControlWord.EOT]?: Block;
  } = {};
  hash: string = '';
  private dataBlockCount = 0;

  private skipProgram: boolean = false;
  private useEOF: boolean = true;
  private useEOT: boolean = true;

  // Fields used in receiving.
  private receivedFiles: any = {};

  constructor(
    opts: IOptions,
  ) {
    this.fromCallsign = opts.fromCallsign || null;
    this.toCallsign = opts.toCallsign || null;
    this.filename = opts.filename;
    this.fileModifiedTime = opts.fileModifiedTime;
    this.blkSize = opts.blkSize;
    this.compression = opts.compression || false;
    this.forceCompress == !!opts.forceCompress;

    this.skipProgram = !!opts.skipProgram;
    this.useEOF = opts.useEOF !== false;
    this.useEOT = opts.useEOT !== false;
    
    if (opts.base) {
      this.setBase(opts.base);
    }
    this.inputBuffer = opts.inputBuffer;

    this.hash = Amp.getHash(this.filename, this.fileModifiedTime, !!this.compression, this.base, this.blkSize);

    this.dataBlockCount = this.quantizeMessage();

    this.blocks[LTypes.PROG] = Block.MakeBlock({keyword: LTypes.PROG, hash: this.hash, data: `${this.PROGRAM} ${this.VERSION}`});
    this.blocks[LTypes.FILE] = Block.MakeBlock({keyword: LTypes.FILE, hash: this.hash, data: `${moment(this.fileModifiedTime).format(MODIFIED_TIME_FORMAT)}:${this.filename}`});
    this.blocks[LTypes.ID] = Block.MakeBlock({keyword: LTypes.ID, hash: this.hash, data: this.fromCallsign || ''});
    this.blocks[LTypes.SIZE] = Block.MakeBlock({keyword: LTypes.SIZE, hash: this.hash, data: `${this.inputBuffer.length} ${this.dataBlockCount} ${this.blkSize}`});
    this.blocks[ControlWord.EOF] = Block.MakeBlock({keyword: LTypes.CNTL, hash: this.hash, controlWord: ControlWord.EOF});
    this.blocks[ControlWord.EOT] = Block.MakeBlock({keyword: LTypes.CNTL, hash: this.hash, controlWord: ControlWord.EOT});
  }

  toString(blockList?: number[], includeHeaders = true) {
    let blockStrings: string[] = [];

    let preProtocolHeaders: string;
    if (this.toCallsign && this.fromCallsign) {
      preProtocolHeaders = `${this.toCallsign} ${this.toCallsign} DE ${this.fromCallsign}\n\n`;
    } else if (this.toCallsign) {
      preProtocolHeaders = `${this.toCallsign} ${this.toCallsign} DE ME\n\n`;
    } else if (this.fromCallsign) {
      preProtocolHeaders = `QST QST QST DE ${this.fromCallsign}\n\n`;
    } else {
      preProtocolHeaders = "QST QST QST\n\n";
    }
    // Looping through the keywords in a specific order to build the output string
    for (let key of [
      LTypes.PROG,
      LTypes.FILE,
      LTypes.ID,
      LTypes.SIZE,
      LTypes.DATA,
      ControlWord.EOF,
      ControlWord.EOT
    ]) {
      if (
        (key === LTypes.PROG && this.skipProgram)
        || (key === LTypes.ID && !this.fromCallsign)
        || (key === ControlWord.EOF && !this.useEOF)
        || (key === ControlWord.EOT && !this.useEOT)
      ) { continue; }

      if ((!blockList || includeHeaders) && this.blocks[key as any]) {
        blockStrings.push(this.blocks[key as any].toString());
      }

      if (key === LTypes.DATA) {
        for (let idx of (blockList && blockList.sort() || [...Array(this.dataBlockCount).keys()].map(i => i+1))) {
          if (this.blocks[idx]) {
            blockStrings.push(this.blocks[idx].toString());
          }
        }
      }
    }
    if (includeHeaders) {
      blockStrings.unshift(preProtocolHeaders);
      blockStrings.push(preProtocolHeaders);
    }
    return blockStrings.join('\n');
  }
  getDataBlockCount() { return this.dataBlockCount; }

  /**
   * The base to use for transmitting the data, if any
   * @param base base64 or base91
   */
  setBase(base: '' | BaseEncode) {
    this.base = base;
  }

  quantizeMessage() {
    let actualBuffer = this.inputBuffer;

    let needsBase = hasNotPrintable(actualBuffer);
    if (needsBase && !this.base) {
      // For our purposes we're forcing some base conversion if there are unprintable characters
      this.base = BaseEncode.b91;
    }

    // Apply compression if any
    if (this.compression === CompressionType.LZMA) {
      let c = Compressor.getCompressor(); // get the default compressor
      try {
        let newBuffer = c.compress(actualBuffer);
        if (newBuffer.length < actualBuffer.length - 200) {
          // If compression doesn't save us at least 200 bytes it's not worth while
          actualBuffer = newBuffer;
        }
      } catch(e) {
        console.error('Compression failed, continuing without compression', e);
      }
      if (!this.base) {
        // If we compreessed then we need to base encode it
        this.base = BaseEncode.b91;
      }
    }

    // Apply base64 or base91 encoding here
    if (this.base) {
      switch (this.base) {
        case BaseEncode.b64:
          actualBuffer = `[b64:start]${base64.encode(actualBuffer)}[b64:end]`;
          break;
        case BaseEncode.b91:
          actualBuffer = `[b91:start]${base91.encode(actualBuffer)}[b91:end]`;
          break;
        default:
          return assertUnreachable(this.base);
      }
    }

    if (actualBuffer.length > this.inputBuffer.length
      && !needsBase && !this.forceCompress) {
      // If all characters were printable and it's shorter without the conversion
      // then let's just send it without
      actualBuffer = this.inputBuffer;
    }

    let numbOfBlocks = Math.floor(actualBuffer.length / this.blkSize);
    if (actualBuffer.length % this.blkSize > 0) {
      numbOfBlocks++;
    }
    let blockNum = 1;
    let start = 0;
    while (start < actualBuffer.length) {
      let block = Block.MakeBlock({
        keyword: LTypes.DATA,
        hash: this.hash,
        data: actualBuffer.slice(start, start + this.blkSize),
        blockNum});
      this.blocks[blockNum] = block;
      start += this.blkSize;
      blockNum++;
    }

    return numbOfBlocks;
  }

}
