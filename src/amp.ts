// JavaScript Amateur Multicast Protocol AMP-2 Version 3
// Implemented from specification document
// http://www.w1hkj.com/files/flamp/Amp-2.V3.0.Protocol.pdf
// • Version 1.0.0 - W5ALT, Walt Fair, Jr. (Derived From)
// • Version 2.0.0 - W1HKJ, Dave Freese, w1hkj@w1hkj.com
// • Version 2.0.1 - W1HKJ, Dave Freese, w1hkj@w1hkj.com, 5 Oct 2012
// • Version 3.0.0 - KK5VD, Robert Stiles, kk5vd@yahoo.com, 21 April 2013
// • Javascript Implementation by KV9G, Michael Stufflebeam cpuchip@gmail.com, 29 June 2018
//

import { Block } from './block';
import { crc16 } from './crc16';

import { Compressor }  from './compressor';

import * as base91 from './base91';
import * as base64 from './base64';
import * as lzma from './lzma';

export const lzmaCompressedPrefix = '\u0001LZMA';
export const MODIFIED_TIME_REGEX = /(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/;
/**
 * Takes a date and returns a string in format YYYYMMDDhhmmss
*/
export function dateToString(d: Date): string {
  const year = d.getFullYear();
  const month = (`0${d.getMonth()+1}`).slice(-2);
  const day = (`0${d.getDate()}`).slice(-2);
  const hours = (`0${d.getHours()}`).slice(-2);
  const minutes = (`0${d.getMinutes()}`).slice(-2);
  const seconds = (`0${d.getSeconds()}`).slice(-2);
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}
/**
 * Takes a string in format YYYYMMDDhhmmss and returns a date
*/
export function stringToDate(str: string): Date {
  return new Date(str.replace(MODIFIED_TIME_REGEX, '$1-$2-$3T$4:$5:$6'));
}

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
  compression?: CompressionType | false;
  forceCompress?: boolean;
  base?: BaseEncode;
  fromCallsign?: string;
  toCallsign?: string;
  filename: string;
  fileDescription?: string;
  fileModifiedTime: Date;
  inputBuffer: string;
  blkSize: number;
  skipProgram?: boolean;
  useEOF?: boolean;
  useEOT?: boolean;
}

export class Amp {
  static toString(blocks: Amp['blocks'], fromCallsign = '', toCallsign = '') {
    if (!Object.keys(blocks || {}).length) { return ''; }
    let preProtocolHeaders: string;
    if (toCallsign && fromCallsign) {
      preProtocolHeaders = `${toCallsign} DE ${fromCallsign}\n\n`;
    } else if (toCallsign) {
      preProtocolHeaders = `${toCallsign} DE ME\n\n`;
    } else if (fromCallsign) {
      preProtocolHeaders = `QST DE ${fromCallsign}\n\n`;
    } else {
      preProtocolHeaders = "QST\n\n";
    }
    const blockStrings: string[] = [];
    if (preProtocolHeaders) { blockStrings.push(preProtocolHeaders); }

    // Looping through the keywords in a specific order to build the output string
    for (let key of [
      LTypes.PROG,
      LTypes.FILE,
      LTypes.ID,
      LTypes.SIZE,
      LTypes.DESC,
      LTypes.DATA,
      ControlWord.EOF,
      ControlWord.EOT
    ]) {
      if (key === LTypes.DATA) {
        for (const k of Object.keys(blocks)) {
          if (isNaN(Number(k))) { continue; }
          const block = blocks[k as any as number];
          blockStrings.push(block.toString());
        }
        continue;
      }
      let block = blocks[key as any];
      if (key === LTypes.ID) {
        if (!fromCallsign) { continue; }

        if (!block || fromCallsign !== block.data) {
          let hash = '';
          if (block) {
            hash = block.hash;
          } else {
            let k = Object.keys(blocks)[0];
            if (k) {
              hash = blocks[k as any].hash;
            }
          }
          if (hash) {
            block = Block.MakeBlock({keyword: LTypes.ID, hash, data: fromCallsign});
          }
        }
      }
      if (!block) { continue; }
      blockStrings.push(block.toString());
    }

    if (fromCallsign) { blockStrings.push(fromCallsign); }
    return blockStrings.join('\n');
  }

  static getHash(filename: string, modified: Date, compressed: boolean, baseConversion: BaseEncode | '', blockSize: number) {
    // | DTS : FN |C| B |BS|
    // DTS = Date/Time Stamp
    // FN = File Name
    // C = Compression 1=ON,0=OFF
    // B = Base Conversion (base64, base128, or base256)
    // BS = Block Size, 1 or more characters
    // | = Field separator.
    let DTS = dateToString(modified);
    return crc16(`${DTS}:${filename}${compressed ? '1' : '0'}${baseConversion}${blockSize}`);
  }
  fromCallsign: string | null;
  toCallsign: string | null;
  filename: string;
  fileDescription: string;
  fileModifiedTime: Date;
  inputBuffer: string;
  blkSize: number;

  PROGRAM = "JSAMP";
  VERSION = "1.1.6";

  base: '' | BaseEncode = "";
  compression: CompressionType | false = false;
  private forceCompress = false;
  blocks: {
    [LTypes.PROG]?: Block;
    [LTypes.ID]?: Block;
    [LTypes.FILE]?: Block;
    [LTypes.DESC]?: Block;
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
    this.fileDescription = opts.fileDescription || '';
    this.fileModifiedTime = opts.fileModifiedTime;
    this.blkSize = opts.blkSize;
    this.compression = opts.compression || false;
    this.forceCompress = !!opts.forceCompress;

    this.skipProgram = !!opts.skipProgram;
    this.useEOF = opts.useEOF !== false;
    this.useEOT = opts.useEOT !== false;
    
    if (opts.base) {
      this.setBase(opts.base);
    }
    this.inputBuffer = opts.inputBuffer;

    this.hash = Amp.getHash(this.filename, this.fileModifiedTime, !!this.compression, this.base, this.blkSize);

    this.makeBlocks();
  }

  makeBlocks() {
    this.blocks = {};
    this.dataBlockCount = this.quantizeMessage();

    if (!this.skipProgram) {
      this.blocks[LTypes.PROG] = Block.MakeBlock({keyword: LTypes.PROG, hash: this.hash, data: `${this.PROGRAM} ${this.VERSION}`});
    }
    this.blocks[LTypes.FILE] = Block.MakeBlock({keyword: LTypes.FILE, hash: this.hash, data: `${dateToString(this.fileModifiedTime)}:${this.filename}`});
    if (this.fromCallsign) {
      this.blocks[LTypes.ID] = Block.MakeBlock({keyword: LTypes.ID, hash: this.hash, data: this.fromCallsign});
    }
    if (this.fileDescription) {
      this.blocks[LTypes.DESC] = Block.MakeBlock({keyword: LTypes.DESC, hash: this.hash, data: this.fileDescription});
    }
    this.blocks[LTypes.SIZE] = Block.MakeBlock({keyword: LTypes.SIZE, hash: this.hash, data: `${this.inputBuffer.length} ${this.dataBlockCount} ${this.blkSize}`});
    if (this.useEOF) {
      this.blocks[ControlWord.EOF] = Block.MakeBlock({keyword: LTypes.CNTL, hash: this.hash, controlWord: ControlWord.EOF});
    }
    if (this.useEOT) {
      this.blocks[ControlWord.EOT] = Block.MakeBlock({keyword: LTypes.CNTL, hash: this.hash, controlWord: ControlWord.EOT});
    }
  }

  toString(dataBlockList?: number[], includeHeaders = true) {
    const blocks: Amp['blocks'] = {};
    for (const key of Object.keys(this.blocks)) {
      if (
        (isNaN(Number(key)) ? !includeHeaders : (!dataBlockList || dataBlockList.indexOf(Number(key)) === -1))
        || (key === LTypes.PROG && this.skipProgram)
        || (key === LTypes.ID && !this.fromCallsign)
        || (key === LTypes.DESC && !this.fileDescription)
        || (key === ControlWord.EOF && !this.useEOF)
        || (key === ControlWord.EOT && !this.useEOT)
      ) {
        continue;
      }
      blocks[key as any] = this.blocks[key as any];
    }
    return Amp.toString(blocks, this.fromCallsign || '', this.toCallsign || '');
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
        if (newBuffer.length < actualBuffer.length - 200 && !this.forceCompress) {
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
