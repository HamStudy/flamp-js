import { LTypes, ControlWord } from './amp';
import { crc16 } from './crc16';

export class Block { // Protocol Block

  private static decodeBlock(keyword: LTypes, buffer: string): Block | null {
    // The block starts at the beginning of the buffer
    let blockToken = `<${keyword} `;

    let lengthEnd = buffer.indexOf(' ', blockToken.length);
    if (lengthEnd < -1) { return null; }
    let byteCount = parseInt(buffer.substring(blockToken.length, lengthEnd + 1), 10);
    if (isNaN(byteCount)) { return null; }
    let tagEnd = buffer.indexOf(">");

    // We now know the exact size and shape of the block, so let's trim the fat:
    if (buffer.length < tagEnd + 1 + byteCount) {
      return null;
    }
    buffer = buffer.substring(0, tagEnd + 1 + byteCount);

    let tag = buffer.substring(0, tagEnd);

    let data = buffer.substring(tagEnd + 1);
    let bracedArea = [""];
    if (data.startsWith('{')) {
      bracedArea = data.substring(1, data.indexOf('}')).split(':');
      data = data.substring(data.indexOf('}')+1);
    }
    let expectedChecksum = tag.substr(-4);
    let hash = bracedArea[0];

    let block = new Block(keyword, hash, data);
    block.hash = bracedArea[0];
    let blockNumOrHType = bracedArea[1];
    if (blockNumOrHType in ControlWord) {
      block.controlWord = blockNumOrHType as ControlWord;
    } else if (blockNumOrHType) {
      block.blockNum = Number(blockNumOrHType);
    }

    // Validate Protocol Block with checksum
    if (!block.checksum || !expectedChecksum) { return null; }
    try {
      if (block.checksum === expectedChecksum && block.toString() === buffer) {
        return block;
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  }
  static fromBuffer(keyword: LTypes, buffer: string): Block | null {

    // Parse the block info
    let blockToken = `<${keyword} `;
    
    let blockStart: number;
    while ((blockStart = buffer.indexOf(blockToken)) > -1) {
      // as long as we've found something that looks like it could be our
      // block...
      let tmpBuffer = buffer.substr(blockStart, 500); // 500 should be *plenty*
      let block = this.decodeBlock(keyword, tmpBuffer);
      if (block) {
        return block;
      } else {
        // Discard this one, try again
        buffer = buffer.substr(blockStart + blockToken.length);
      }
    }
    
    // If we got here there weren't none to find
    return null;
  }

  controlWord?: ControlWord;
  blockNum?: number; // Data block number

  constructor(keyword: LTypes.DATA, hash: string, data: string, blockNum: number)
  constructor(keyword: LTypes.CNTL, hash: string, controlWord: ControlWord)
  constructor(keyword: string, hash: string, data: string)
  constructor(
    public keyword: string,
    public hash: string,
    public data: string,
    blockNumOrControlWord?: number,
  ) {
    if (this.keyword === LTypes.DATA) {
      this.blockNum = blockNumOrControlWord as number;
    } else if (this.keyword === LTypes.CNTL) {
      this.controlWord = data as ControlWord;
    }
  }

  get checksum(): string { // crc16 of hash:# + data
    return crc16(this.getHashString() + this.data);
  }
  get byteCount(): number {
    return this.getHashString().length + this.data.length;
  }

  getHashString() {
    let hash: string;
    switch (this.keyword) {
      case LTypes.DATA:
        hash = `{${this.hash}:${this.blockNum}}`
        break;
      case LTypes.CNTL:
        hash = `{${this.hash}:${this.controlWord}}`
        break;
    
      default:
        hash = `{${this.hash}}`;
        break;
    }
    return hash;
  }

  toString() {
    return `<${this.keyword} ${this.byteCount} ${this.checksum}>${this.getHashString()}${this.data}`;
  }
}
