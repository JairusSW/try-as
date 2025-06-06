import { ExceptionState, ExceptionType } from "./exception";

export namespace ErrorState {
  export let message: string = "";
  export let name: string = "";
  export let stack: string | null = null;
  // @ts-ignore: inline
  @inline export function reset(): void {
    ExceptionState.Failures = 0;
    ErrorState.message = "";
    ErrorState.name = "";
    ErrorState.stack = null;
  }
  // @ts-ignore: inline
  @inline export function error(message: string = ""): void {
    ExceptionState.Failures++;
    ExceptionState.Type = ExceptionType.Error;

    ErrorState.message = message;
  }
}
