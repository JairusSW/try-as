import { ErrorState as __ErrorState } from "./types/error";
import { UnreachableState as __UnreachableState } from "./types/unreachable";
import { AbortState as __AbortState } from "./types/abort";
import { Exception as __Exception, ExceptionState as __ExceptionState } from "./types/exception";
export function foo(): void {
  abort("Aborted from foo");
}

export function __try_foo(): void {
  __AbortState.abort("Aborted from foo");
}
