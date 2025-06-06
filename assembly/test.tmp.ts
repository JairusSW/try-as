import {
  ErrorState as __ErrorState
} from "./types/error";
import {
  UnreachableState as __UnreachableState
} from "./types/unreachable";
import {
  AbortState as __AbortState
} from "./types/abort";
import {
  Exception as __Exception,
  ExceptionState as __ExceptionState
} from "./types/exception";
import {
  foo
} from "./foo";
do {
  __try_nestedAbortingFunction();
  if (__ExceptionState.Failures > 0) {
    break;
  }
} while (false);
if (__ExceptionState.Failures > 0) do {
  let e = new __Exception(__ExceptionState.Type);
  __ExceptionState.Failures--;
  console.log(e.toString());
} while (false);
;
function abortingFunction(): void {
  __AbortState.abort("Aborted from abortingFunction");
  return;
}
function __try_abortingFunction(): void {
  if (__ExceptionState.Failures > 0) {
    return;
  }
  __AbortState.abort("Aborted from abortingFunction");
  return;
}
function nestedAbortingFunction(): void {
  do {
    __try_abortingFunction();
    if (__ExceptionState.Failures > 0) {
      break;
    }
  } while (false);
  if (__ExceptionState.Failures > 0) do {
    let e = new __Exception(__ExceptionState.Type);
    __ExceptionState.Failures--;
    __AbortState.abort("Aborted from nestedAbortingFunction");
    return;
  } while (false);
;
}
function __try_nestedAbortingFunction(): void {
  if (__ExceptionState.Failures > 0) {
    return;
  }
  do {
    __try_abortingFunction();
    if (__ExceptionState.Failures > 0) {
      break;
    }
  } while (false);
  if (__ExceptionState.Failures > 0) do {
    let e = new __Exception(__ExceptionState.Type);
    __ExceptionState.Failures--;
    __AbortState.abort("Aborted from nestedAbortingFunction");
    return;
  } while (false);
;
}
