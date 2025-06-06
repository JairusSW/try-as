import { AbortState } from "./abort";
import { ErrorState } from "./error";

export enum ExceptionType {
  None,
  Abort,
  Error,
  Unreachable,
}

export namespace ExceptionState {
  export let Failures: i32 = 0;
  export let Type: ExceptionType = ExceptionType.None;
}

export class Exception {
  public type: ExceptionType;
  // Abort
  public msg: string | null = AbortState.msg;
  public fileName: string | null = AbortState.fileName;
  public lineNumber: i32 = AbortState.lineNumber;
  public columnNumber: i32 = AbortState.columnNumber;

  // Error
  public message: string = ErrorState.message;
  public name: string = ErrorState.name;
  public stack: string | null = ErrorState.stack;

  constructor(type: ExceptionType) {
    this.type = type;
  }
  toString(): string {
    let out = "";
    if (this.type == ExceptionType.Abort) {
      out = "abort";
      if (AbortState.msg) out += ": " + AbortState.msg!;
      if (AbortState.fileName) out += " in " + AbortState.fileName!;
      if (AbortState.lineNumber) out += ` in (${AbortState.lineNumber}:${AbortState.columnNumber})`;
    } else if (this.type == ExceptionType.Unreachable) {
      out = "unreachable";
    } else if (this.type == ExceptionType.Error) {
      out = "Error: " + ErrorState.message;
    }
    return out;
  }
}
