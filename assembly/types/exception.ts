import { AbortState } from "./abort";
import { UnreachableState } from "./unreachable";
import { DISCRIMINATOR, ErrorState } from "./error";

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
  public get msg(): string | null { return this.type == ExceptionType.Abort ? this.msg : null; };
  public get fileName(): string | null { return this.type == ExceptionType.Abort ? this.fileName : null; };
  public get lineNumber(): i32 { return this.type == ExceptionType.Abort ? this.lineNumber : -1; };
  public get columnNumber(): i32 { return this.type == ExceptionType.Abort ? this.columnNumber : -1; };

  // Error
  public get message(): string | null { return (this.type == ExceptionType.Error && (ErrorState.isErrorType || ErrorState.hasMessage)) ? this.message : null; };
  public get name(): string | null { return (this.type == ExceptionType.Error && ErrorState.isErrorType) ? this.name : null; };
  public get stack(): string | null { return (this.type == ExceptionType.Error && ErrorState.isErrorType) ? this.stack : null; };

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
    } else if (this.type == ExceptionType.Error && ErrorState.hasMessage) {
      out = "Error: " + ErrorState.message;
    }
    return out;
  }
  // @ts-ignore: inline
  @inline is<T>(): boolean {
    if (this.type != ExceptionType.Error) return false;
    return ErrorState.discriminator == DISCRIMINATOR<T>();
  }
  // @ts-ignore: inline
  @inline as<T>(): T {
    if (this.type != ExceptionType.Error) return changetype<T>(0);
    if (ErrorState.discriminator != DISCRIMINATOR<T>()) return changetype<T>(0);
    return load<T>(ErrorState.storage);
  }
  rethrow(): void {
    if (this.type == ExceptionType.Abort) {
      abort(this.msg, this.fileName, this.lineNumber, this.columnNumber);
    } else if (this.type == ExceptionType.Unreachable) {
      unreachable();
    } else if (this.type == ExceptionType.Error) {
      abort(ErrorState.hasMessage ? ErrorState.message : "", ErrorState.fileName, ErrorState.lineNumber, ErrorState.columnNumber);
    }
  }
  private __try_rethrow(): void {
    if (this.type == ExceptionType.Abort) {
      AbortState.abort(this.msg, this.fileName, this.lineNumber, this.columnNumber);
    } else if (this.type == ExceptionType.Unreachable) {
      UnreachableState.unreachable();
    } else if (this.type == ExceptionType.Error) {
      ExceptionState.Failures++;
      ExceptionState.Type = ExceptionType.Error;
    }
  }
}
