import { LTypes, ControlWord } from './amp';
import { crc16 } from './crc16';

interface MakeBlockStandardOptions {
  keyword: LTypes.PROG | LTypes.FILE | LTypes.ID | LTypes.SIZE | LTypes.DESC;
  hash: string;
  data: string;
}
interface MakeBlockControlOptions {
  keyword: LTypes.CNTL;
  hash: string;
  controlWord: ControlWord;
}
interface MakeBlockDataOptions {
  keyword: LTypes.DATA;
  hash: string;
  data: string;
  blockNum: number;
}

export type MakeBlockOptions = MakeBlockStandardOptions | MakeBlockControlOptions | MakeBlockDataOptions;

export class Block { // Protocol Block
  hash: string;
  controlWord?: ControlWord;
  blockNum?: number; // Data block number

  constructor(
    public keyword: LTypes,
    public data: string
  ) {
    let closeBrace = data.indexOf('}');
    let blockStuff = data.substring(1, closeBrace).split(':');
    this.hash = blockStuff[0];
    this.data = this.data.substring(closeBrace + 1);

    if (this.keyword === LTypes.DATA) {
      this.blockNum = parseInt(blockStuff[1], 10);
    } else if (this.keyword === LTypes.CNTL) {
      this.controlWord = blockStuff[1] as ControlWord;
    }
  }

  static MakeBlock(opts: MakeBlockOptions)  {
    switch(opts.keyword) {
      case LTypes.DATA:
        return new this(opts.keyword, `{${opts.hash}:${opts.blockNum||0}}${opts.data}`);
      case LTypes.CNTL:
        return new this(opts.keyword, `{${opts.hash}:${opts.controlWord}}`);
      default:
        return new this(opts.keyword, `{${opts.hash}}${opts.data}`);
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
