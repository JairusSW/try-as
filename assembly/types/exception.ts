import { AbortState } from "./abort";
import { UnreachableState } from "./unreachable";
import { Discriminator, DISCRIMINATOR, ErrorState } from "./error";

export enum ExceptionType {
  None,
  Abort,
  Throw,
  Unreachable,
}

export namespace ExceptionState {
  export let Failures: i32 = 0;
  export let Type: ExceptionType = ExceptionType.None;
  export let DefaultValue: usize = memory.data(8);

  // @ts-ignore: inline
  @inline export function shouldCatch(mask: i32): bool {
    if (Failures <= 0) return false;
    if (Type == ExceptionType.Abort) return (mask & (1 << ExceptionType.Abort)) != 0;
    if (Type == ExceptionType.Throw) return (mask & (1 << ExceptionType.Throw)) != 0;
    if (Type == ExceptionType.Unreachable) return (mask & (1 << ExceptionType.Unreachable)) != 0;
    return false;
  }
}

export class Exception {
  public type: ExceptionType;

  // Abort
  public msg: string | null = null;
  public fileName: string | null = null;
  public lineNumber: i32 = -1;
  public columnNumber: i32 = -1;

  // Error
  public message: string | null = null;
  public name: string | null = null;
  public stack: string | null = null;
  private discriminator: i32 = 0;
  private storage: ArrayBuffer | null = null;
  private managed: Object | null = null;

  constructor(type: ExceptionType) {
    this.type = type;

    if (type == ExceptionType.Abort) {
      this.msg = AbortState.msg;
      this.fileName = AbortState.fileName;
      this.lineNumber = AbortState.lineNumber;
      this.columnNumber = AbortState.columnNumber;
    } else if (type == ExceptionType.Throw) {
      if (ErrorState.isErrorType || ErrorState.hasMessage) {
        this.message = ErrorState.message;
      }
      if (ErrorState.isErrorType) {
        this.name = ErrorState.name;
        this.stack = ErrorState.stack;
      }
      this.fileName = ErrorState.fileName;
      this.lineNumber = ErrorState.lineNumber;
      this.columnNumber = ErrorState.columnNumber;

      this.discriminator = ErrorState.discriminator;
      this.managed = ErrorState.managed;
      this.storage = new ArrayBuffer(8);
      store<u64>(changetype<usize>(this.storage), load<u64>(ErrorState.storage));
    }
  }

  toString(): string {
    let out = "";
    if (this.type == ExceptionType.Abort) {
      out = "abort";
      if (this.msg) out += ": " + this.msg!;
      if (this.fileName) out += " in " + this.fileName!;
      if (this.lineNumber >= 0 && this.columnNumber >= 0) out += ` in (${this.lineNumber}:${this.columnNumber})`;
    } else if (this.type == ExceptionType.Unreachable) {
      out = "unreachable";
    } else if (this.type == ExceptionType.Throw && this.message) {
      out = "Error: " + this.message!;
    }
    return out;
  }

  // @ts-ignore: inline
  @inline is<T>(): boolean {
    if (this.type != ExceptionType.Throw) return false;
    return this.discriminator == DISCRIMINATOR<T>();
  }

  // @ts-ignore: inline
  @inline as<T>(): T {
    if (this.type != ExceptionType.Throw) return load<T>(ExceptionState.DefaultValue);
    if (this.discriminator != DISCRIMINATOR<T>()) return load<T>(ExceptionState.DefaultValue);
    if (!this.storage) return load<T>(ExceptionState.DefaultValue);
    return load<T>(changetype<usize>(this.storage));
  }

  rethrow(): void {
    if (this.type == ExceptionType.Abort) {
      abort(this.msg, this.fileName, this.lineNumber, this.columnNumber);
    } else if (this.type == ExceptionType.Unreachable) {
      unreachable();
    } else if (this.type == ExceptionType.Throw) {
      abort(this.message, this.fileName, this.lineNumber, this.columnNumber);
    }
    abort("Invalid exception type", this.fileName, this.lineNumber, this.columnNumber);
  }

  __try_rethrow(): void {
    if (this.type == ExceptionType.Abort) {
      AbortState.abort(this.msg, this.fileName, this.lineNumber.toString(), this.columnNumber.toString());
    } else if (this.type == ExceptionType.Unreachable) {
      UnreachableState.unreachable();
    } else if (this.type == ExceptionType.Throw) {
      ErrorState.message = this.message ? this.message! : "";
      ErrorState.name = this.name ? this.name! : "";
      ErrorState.stack = this.stack;
      ErrorState.fileName = this.fileName;
      ErrorState.lineNumber = this.lineNumber;
      ErrorState.columnNumber = this.columnNumber;
      ErrorState.discriminator = this.discriminator;
      ErrorState.managed = this.managed;
      ErrorState.hasMessage = this.message != null;
      ErrorState.isErrorType = this.name != null || this.stack != null;

      if (this.storage != null) {
        store<u64>(ErrorState.storage, load<u64>(changetype<usize>(this.storage)));
      } else {
        store<u64>(ErrorState.storage, 0);
      }

      ExceptionState.Failures++;
      ExceptionState.Type = ExceptionType.Throw;
    }
  }

  clone(): Exception {
    let copy = new Exception(this.type);
    copy.msg = this.msg;
    copy.fileName = this.fileName;
    copy.lineNumber = this.lineNumber;
    copy.columnNumber = this.columnNumber;
    copy.message = this.message;
    copy.name = this.name;
    copy.stack = this.stack;
    copy.discriminator = this.discriminator;
    copy.managed = this.managed;
    if (this.storage != null) {
      copy.storage = new ArrayBuffer(8);
      store<u64>(changetype<usize>(copy.storage), load<u64>(changetype<usize>(this.storage)));
    } else {
      copy.storage = null;
    }
    return copy;
  }


  @unsafe private __visit(cookie: u32): void {
    if (this.discriminator >= Discriminator.ManagedRef && this.managed != null) {
      let ptr = changetype<usize>(this.managed);
      // @ts-ignore
      if (ptr) __visit(ptr, cookie);
    }
  }
}
