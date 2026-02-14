import { Exception, ExceptionState, ExceptionType } from "./exception";

// Taken from https://github.com/MaxGraey/as-variant/blob/main/assembly/index.ts
export const enum Discriminator {
  Bool,
  I8,
  I16,
  I32,
  I64,
  U8,
  U16,
  U32,
  U64,
  F32,
  F64,
  UnmanagedRef,
  ManagedRef,
}

// @ts-ignore: decorator
@inline
export function DISCRIMINATOR<T>(): Discriminator {
  if (isManaged<T>()) return Discriminator.ManagedRef + idof<T>();
  if (isReference<T>()) return Discriminator.UnmanagedRef;
  // @ts-ignore: type
  const value: T = 0;
  if (value instanceof bool) return Discriminator.Bool;
  if (value instanceof i8) return Discriminator.I8;
  if (value instanceof i16) return Discriminator.I16;
  if (value instanceof i32) return Discriminator.I32;
  if (value instanceof i64) return Discriminator.I64;
  if (value instanceof u8) return Discriminator.U8;
  if (value instanceof u16) return Discriminator.U16;
  if (value instanceof u32) return Discriminator.U32;
  if (value instanceof u64) return Discriminator.U64;
  if (value instanceof f32) return Discriminator.F32;
  if (value instanceof f64) return Discriminator.F64;
  return unreachable();
}

export namespace ErrorState {
  export let message: string = "";
  export let name: string = "";
  export let stack: string | null = null;
  export let managed: Object | null = null;

  export let fileName: string | null = null;
  export let lineNumber: i32 = -1;
  export let columnNumber: i32 = -1;

  export let storage: usize = memory.data(8);
  export let discriminator: i32 = 0;

  export let isErrorType: bool = false;
  export let hasMessage: bool = false;

  // @ts-ignore: inline
  @inline export function reset(): void {
    ExceptionState.Failures = 0;
    ErrorState.message = "";
    ErrorState.name = "";
    ErrorState.stack = null;
    ErrorState.managed = null;
    ErrorState.fileName = null;
    ErrorState.lineNumber = -1;
    ErrorState.columnNumber = -1;
    ErrorState.discriminator = 0;
    ErrorState.isErrorType = false;
    ErrorState.hasMessage = false;
  }
  // @ts-ignore: inline
  @inline export function error<T>(error: T, fileName: string, lineNumber: string, columnNumber: string): void {
    ExceptionState.Failures++;
    ExceptionState.Type = ExceptionType.Throw;

    ErrorState.fileName = fileName;
    ErrorState.lineNumber = i32.parse(lineNumber);
    ErrorState.columnNumber = i32.parse(columnNumber);

    if (idof<T>() == idof<Exception>()) return;

    ErrorState.discriminator = DISCRIMINATOR<T>();
    store<T>(ErrorState.storage, error);
    if (isManaged<T>()) {
      ErrorState.managed = changetype<Object>(changetype<usize>(error));
    } else {
      ErrorState.managed = null;
    }

    if (idof<T>() == idof<Error>()) {
      ErrorState.isErrorType = true;
      ErrorState.message = (error as Error).message;
      ErrorState.stack = (error as Error).stack as string | null;
      ErrorState.hasMessage = true;
      return;
    }

    // @ts-ignore: defined
    if (isDefined(error.toString)) {
      // @ts-ignore: defined
      ErrorState.message = error.toString();
      ErrorState.hasMessage = true;
      return;
    }

    ErrorState.hasMessage = false;
    ErrorState.isErrorType = false;
  }
}
