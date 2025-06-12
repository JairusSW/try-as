import {
  AbortState as __AbortState
} from "./types/abort";
export function foo(): void {
  __AbortState.abort("Aborted from foo");
  return;
}
export function __try_foo(): void {
  if (__ExceptionState.Failures > 0) {
    if (isBoolean<void>()) return false;
else if (isInteger<void>() || isFloat<void>()) return 0;
else if (isManaged<void>() || isReference<void>()) return changetype<void>(0);
else return;
  }
  __AbortState.abort("Aborted from foo");
  return;
}
export namespace FOO {
  export function foo(): void {
    abort("Aborted from FOO.foo");
  }
}
export namespace JSON {
  export function parse<T>(s: string): T {
    throw new Error("not implemented");
  }
}
