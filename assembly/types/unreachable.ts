import { ExceptionState, ExceptionType } from "./exception";

export namespace UnreachableState {
  // @ts-ignore: inline
  @inline export function reset(): void {
    ExceptionState.Failures = 0;
  }
  // @ts-ignore: inline
  @inline export function unreachable(): void {
    ExceptionState.Failures++;
    ExceptionState.Type = ExceptionType.Unreachable;
  }
}
