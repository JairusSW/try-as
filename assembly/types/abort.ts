import { ExceptionState, ExceptionType } from "./exception";

export namespace AbortState {
  export let msg: string | null = null;
  export let fileName: string | null = null;
  export let lineNumber: i32 = -1;
  export let columnNumber: i32 = -1;
  // @ts-ignore: inline
  @inline export function reset(): void {
    ExceptionState.Failures = 0;
    AbortState.msg = null;
    AbortState.fileName = null;
    AbortState.lineNumber = -1;
    AbortState.columnNumber = -1;
  }
  // @ts-ignore: inline
  @inline export function abort(msg: string | null = null, fileName: string | null = null, lineNumber: i32 = 0, columnNumber: i32 = 0): void {
    ExceptionState.Failures++;
    ExceptionState.Type = ExceptionType.Abort;

    AbortState.msg = msg;
    AbortState.fileName = fileName;
    AbortState.lineNumber = lineNumber;
    AbortState.columnNumber = columnNumber;
  }
}
