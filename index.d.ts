export declare enum ExceptionType {
  None = 0,
  Abort = 1,
  Throw = 2,
  Unreachable = 3,
}

export declare namespace ExceptionState {
  let Failures: number;
  let Type: ExceptionType;
  let DefaultValue: number;
  function shouldCatch(mask: number): boolean;
}

export declare class Exception {
  type: ExceptionType;

  msg: string | null;
  fileName: string | null;
  lineNumber: number;
  columnNumber: number;

  message: string | null;
  name: string | null;
  stack: string | null;

  constructor(type: ExceptionType);
  toString(): string;
  is<T>(): boolean;
  as<T>(): T;
  rethrow(): never;
  __try_rethrow(): void;
  clone(): Exception;
}

export declare namespace AbortState {
  let msg: string | null;
  let fileName: string | null;
  let lineNumber: number;
  let columnNumber: number;
  function reset(): void;
  function abort(msg?: string | null, fileName?: string | null, lineNumber?: string, columnNumber?: string): void;
}

export declare namespace UnreachableState {
  function reset(): void;
  function unreachable(): void;
}

export declare const enum Discriminator {
  Bool = 0,
  I8 = 1,
  I16 = 2,
  I32 = 3,
  I64 = 4,
  U8 = 5,
  U16 = 6,
  U32 = 7,
  U64 = 8,
  F32 = 9,
  F64 = 10,
  UnmanagedRef = 11,
  ManagedRef = 12,
}

export declare function DISCRIMINATOR<T>(): Discriminator;

export declare namespace ErrorState {
  let message: string;
  let name: string;
  let stack: string | null;
  let managed: object | null;

  let fileName: string | null;
  let lineNumber: number;
  let columnNumber: number;

  let storage: number;
  let discriminator: number;

  let isErrorType: boolean;
  let hasMessage: boolean;

  function reset(): void;
  function error<T>(error: T, fileName: string, lineNumber: string, columnNumber: string): void;
}
