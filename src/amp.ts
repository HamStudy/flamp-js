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
import { crc16 as crc16JS } from './crc16';

import * as base91 from './base91';
import * as base64 from './base64';
import * as lzma from './lzma';

let crc16 = crc16JS;

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
export enum HTypes {
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
  base?: BaseEncode,
  fromCallsign?: string,
  toCallsign?: string,
  filename: string,
  fileModifiedTime: Date,
  inputBuffer: string,
  blkSize: number,
}

export class Amp {
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
  private blocks: any[] = [];
  private packagedBlocks: any[] = [];
  private prefixBlocks: any[] = [];
  private postfixBlocks: any[] = [];
  private headerString: string = '';
  private headerStringHash: string = '';
  private numbOfBlocks: number = 0;

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
    if (opts.base) {
      this.setBase(opts.base);
    }
    /*
    //Type checking the input buffer:
    if (typeof inputBuffer != "object") {
        throw(new Error("inputBuffer is not an object."));
    }
    if (!(inputBuffer instanceof Array) && !(inputBuffer instanceof Uint8Array)) {
        throw(new Error("inputBuffer is not an array or an Uint8Array."));
    }
    */
    this.inputBuffer = opts.inputBuffer;

    // Initialize the resampler:
    this.headerString = this.buildHeaderStr();
    // console.log('\n\n\nheader string', this.headerString, '\n\n\n');
    this.headerStringHash = crc16(this.headerString); // this goes in the {} after each < > tag
  }

  setCrc16(crc: typeof crc16) {
    crc16 = crc;
  }

  prepareBlocks() {
    this.numbOfBlocks = this.quantizeMessage();
    let preString = "QST QST QST\n\n";
    if (this.toCallsign && this.fromCallsign) {
      preString = `${this.toCallsign} ${this.toCallsign} DE ${this.fromCallsign}\n\n`;
    } else if (this.toCallsign) {
      preString = `${this.toCallsign} ${this.toCallsign} DE ME\n\n`;
    } else if (this.fromCallsign) {
      preString = `QST QST QST DE ${this.fromCallsign}\n\n`;
    }
    this.prefixBlocks.push(preString);
    this.buildHeaderBlocks();
    this.buildIDBlock();
    this.buildBlocks();
    this.buildFooterBlocks();
    this.postfixBlocks.push(preString);
    return this.packagedBlocks.length;
  }
  getBlockCount() { return this.packagedBlocks.length; }
  getBlocks(blockList?: number[]) {
    // If provided, blockList is a list of the blocks which will be returned in order
    let blocksToReturn: string[];
    if (blockList) {
      blocksToReturn = blockList.map((idx) => this.packagedBlocks[idx]);
    } else {
      blocksToReturn = this.packagedBlocks;
    }
    return `${this.prefixBlocks.join('')}${blocksToReturn.join('')}${this.postfixBlocks.join('')}`;
  }

  /**
   * The base to use for transmitting the data, if any
   * @param base base64 or base91
   */
  setBase(base: '' | BaseEncode) {
    this.base = base;
  }

  // | DTS : FN |C| B |BS|
  // DTS = Date/Time Stamp
  // FN = File Name
  // C = Compression 1=ON,0=OFF
  // B = Base Conversion (base64, base128, or base256)
  // BS = Block Size, 1 or more characters
  // | = Field separator.
  buildHeaderStr() {
    let headerStr = this.getFormattedDate() + ":" + this.filename;
    if (this.compression) {
      headerStr += "1";
    } else if (this.compression === false) {
      headerStr += "0";
    }
    if (this.base) {
      headerStr += this.base; // base64 or base128 or base256
    }
    headerStr += this.blkSize;

    return headerStr;
  }
  getFormattedDate() {
    if (this.fileModifiedTime) {
      return moment(this.fileModifiedTime).format(MODIFIED_TIME_FORMAT);
    }
    // Use current time if no file time.
    return moment().format(MODIFIED_TIME_FORMAT);
  }
  buildHashString(chunkOrHtype?: string) {
    let hash = this.headerStringHash;
    if (chunkOrHtype) {
      hash += `:${chunkOrHtype}`;
    }
    return `{${hash}}`;
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
      let newBuffer = lzmaCompressedPrefix;
      newBuffer += lzma.encodeSync(actualBuffer, 2);
      if (newBuffer.length < actualBuffer.length - 200) {
        // If compression doesn't save us at least 200 bytes it's not worth while
        actualBuffer = newBuffer;
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

    if (actualBuffer.length > this.inputBuffer.length && !needsBase) {
      // If all characters were printable and it's shorter without the conversion
      // then let's just send it without
      actualBuffer = this.inputBuffer;
    }

    let numbOfBlocks = Math.floor(actualBuffer.length / this.blkSize);
    if (actualBuffer.length % this.blkSize > 0) {
      numbOfBlocks++;
    }
    this.blocks = [];
    let start = 0;
    while (start < actualBuffer.length) {
      this.blocks.push(actualBuffer.slice(start, start + this.blkSize));
      start += this.blkSize;
    }

    return numbOfBlocks;
  }
  buildBlocks(blockList?: number[]) {
    // If blockList is provided, it should be an array of the zero indexed blocks which should be prepared
    this.packagedBlocks = this.blocks.map((blk, idx) => {
        let pBlock = `<${LTypes.DATA} `;
        let blockText = this.buildHashString(String(idx + 1));
        blockText += blk;
        pBlock += blockText.length;
        pBlock += " " + crc16(blockText) + ">";
        pBlock += blockText + "\n";
        return pBlock;
    });
  }
  buildHeaderBlocks() {
    // PROGRAM BLOCK
    let pBlock = `<${LTypes.PROG} `;
    let blockText = this.buildHashString();
    blockText += this.PROGRAM + " " + this.VERSION;
    pBlock += blockText.length;
    pBlock += ` ${crc16(blockText)}>`;
    pBlock += `${blockText}\n`;
    this.prefixBlocks.push(pBlock);

    // FILE BLOCK
    pBlock = `<${LTypes.FILE} `;
    blockText = this.buildHashString();
    blockText += this.getFormattedDate() + ":" + this.filename;
    pBlock += blockText.length;
    pBlock += ` ${crc16(blockText)}>`;
    pBlock += `${blockText}\n`;
    this.prefixBlocks.push(pBlock);

    // SIZE BLOCK
    let sizeString = `${this.blocks.join('').length} ${this.numbOfBlocks} ${this.blkSize}`;
    pBlock = `<${LTypes.SIZE} `;
    blockText = this.buildHashString();
    blockText += sizeString;
    pBlock += blockText.length;
    pBlock += ` ${crc16(blockText)}>`;
    pBlock += `${blockText}\n`;
    this.prefixBlocks.push(pBlock);
  }

  buildIDBlock() {
    // ID BLOCK
    let pBlock = `<${LTypes.ID} `;
    let blockText = this.buildHashString();
    blockText += this.fromCallsign;
    pBlock += blockText.length;
    pBlock += ` ${crc16(blockText)}>`;
    pBlock += `${blockText}\n`;
    this.prefixBlocks.push(pBlock);
  }
  buildFooterBlocks() {
    // CONTROL EOF
    let pBlock = `<${LTypes.CNTL} `;
    let blockText = this.buildHashString(HTypes.EOF);
    pBlock += blockText.length;
    pBlock += ` ${crc16(blockText)}>`;
    pBlock += `${blockText}\n`;
    this.postfixBlocks.push(pBlock);

    // CONTROL EOT
    pBlock = `<${LTypes.CNTL} `;
    blockText = this.buildHashString(HTypes.EOT);
    pBlock += blockText.length;
    pBlock += ` ${crc16(blockText)}>`;
    pBlock += `${blockText}\n`;
    this.postfixBlocks.push(pBlock);
  }
}
