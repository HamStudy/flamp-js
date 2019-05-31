
interface LZMALib {
  compress(str: string, mode: number, on_finish: (res: string | Uint8Array, err?: Error) => void, on_progress?: (percent: number) => void): void;
  compress(str: string, mode: number): string | Uint8Array;
  decompress(byte_arr: Uint8Array, on_finish: (result: string | Uint8Array, err?: Error) => void, on_progress?: (percent: number) => void): any;
  decompress(byte_arr: Uint8Array): string | Uint8Array;
}

declare const lib: LZMALib;

export = lib;