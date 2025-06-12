
import { AbortState as __AbortState } from "./types/abort";
export function foo(): void {
  abort("Aborted from foo");
}

export namespace FOO {
  export function foo(): void {
    abort("Aborted from FOO.foo");
  }
}

export namespace JSON {
  export function parse<T>(s: string): T {
    throw new Error("not implemented")
  }
}