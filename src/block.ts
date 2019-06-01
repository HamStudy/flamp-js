import { LTypes, ControlWord } from './amp';
import { crc16 } from './crc16';

export class Block { // Protocol Block
  static fromBuffer(keyword: LTypes, buffer: string): Block | null {
    let findBlockInfo: RegExp;
    switch (keyword) {
      case LTypes.DATA:
        findBlockInfo = new RegExp(`<${keyword} (\\d+) ([0-9,a-f,A-F]{4})>({([0-9,a-f,A-F]{4}):(\\d+)})`);
        break;
      case LTypes.CNTL:
        findBlockInfo = new RegExp(`<${keyword} (\\d+) ([0-9,a-f,A-F]{4})>({([0-9,a-f,A-F]{4}):(${ControlWord.EOF}|${ControlWord.EOT})})`);
    
      default:
        findBlockInfo = new RegExp(`<${keyword} (\\d+) ([0-9,a-f,A-F]{4})>({([0-9,a-f,A-F]{4})})`);
        break;
    }
    let blockInfo = findBlockInfo.exec(buffer);
    if (!blockInfo) { return null; }

    const byteCount = Number(blockInfo[1]);
    const expectedChecksum = blockInfo[2];
    const hash = blockInfo[4];
    const blockData = buffer.substr(blockInfo.index + blockInfo[0].length, byteCount - blockInfo[3].length);

    const block = new Block(
      keyword,
      hash,
      blockData,
    );

    if (keyword === LTypes.DATA) {
      block.blockNum = Number(blockInfo[5]);
    } else if (keyword === LTypes.CNTL) {
      block.controlWord = blockInfo[5] as ControlWord;
    }


    // Validate Protocol Block with checksum
    if (!block.checksum || !expectedChecksum) { return null; }
    try {
      if (block.checksum === expectedChecksum && block.toString() === `${blockInfo[0]}${blockData}`) {
        return block;
      }
    } catch (e) {
      console.error(e);
    }
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
