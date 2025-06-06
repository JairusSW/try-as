import {
  ErrorState as __ErrorState
} from "../types/error";
import {
  UnreachableState as __UnreachableState
} from "../types/unreachable";
import {
  AbortState as __AbortState
} from "../types/abort";
import {
  Exception as __Exception,
  ExceptionState as __ExceptionState
} from "../types/exception";
import {
  deepImportedFunction,
  importedFunction
} from "./imports";
import {
  describe,
  expect
} from "./lib";
describe("Should handle immediate abort call", (): void => {
  do {
    __AbortState.abort("This should abort");
    break;
  } while (false);
  if (__ExceptionState.Failures > 0) do {
    let e = new __Exception(__ExceptionState.Type);
    __ExceptionState.Failures--;
    expect(e.toString()).toBe("abort: This should abort");
  } while (false);
;
});
describe("Should execute finally block", () => {
  let finallyExecuted = false;
  do {
    __AbortState.abort("This should abort");
    break;
  } while (false);
  if (__ExceptionState.Failures > 0) do {
    let e = new __Exception(__ExceptionState.Type);
    __ExceptionState.Failures--;
    expect(e.toString()).toBe("abort: This should abort");
  } while (false);
;
  {
    finallyExecuted = true;
  }
  expect(finallyExecuted.toString()).toBe("true");
});
describe("Should catch abort inside catch block", () => {
  do {
    do {
      __AbortState.abort("This should abort");
      break;
    } while (false);
    if (__ExceptionState.Failures > 0) do {
      let e = new __Exception(__ExceptionState.Type);
      __ExceptionState.Failures--;
      __AbortState.abort("Abort from catch block");
      break;
    } while (false);
;
  } while (false);
  if (__ExceptionState.Failures > 0) do {
    let e = new __Exception(__ExceptionState.Type);
    __ExceptionState.Failures--;
    expect(e.toString()).toBe("abort: Abort from catch block");
  } while (false);
;
});
describe("Should handle multiple abort calls", () => {
  do {
    __AbortState.abort("First abort");
    break;
  } while (false);
  if (__ExceptionState.Failures > 0) do {
    let e = new __Exception(__ExceptionState.Type);
    __ExceptionState.Failures--;
    expect(e.toString()).toBe("abort: First abort");
  } while (false);
;
  do {
    __AbortState.abort("Second abort");
    break;
  } while (false);
  if (__ExceptionState.Failures > 0) do {
    let e = new __Exception(__ExceptionState.Type);
    __ExceptionState.Failures--;
    expect(e.toString()).toBe("abort: Second abort");
  } while (false);
;
});
describe("Should handle abort in nested try/catch blocks", () => {
  do {
    do {
      __AbortState.abort("Inner abort");
      break;
    } while (false);
    if (__ExceptionState.Failures > 0) do {
      let e = new __Exception(__ExceptionState.Type);
      __ExceptionState.Failures--;
      expect(e.toString()).toBe("abort: Inner abort");
      __AbortState.abort("Outer abort");
      break;
    } while (false);
;
  } while (false);
  if (__ExceptionState.Failures > 0) do {
    let e = new __Exception(__ExceptionState.Type);
    __ExceptionState.Failures--;
    expect(e.toString()).toBe("abort: Outer abort");
  } while (false);
;
});
describe("Should handle abort in finally block", () => {
  do {
    do {
      __AbortState.abort("Abort in try block");
      break;
    } while (false);
    if (__ExceptionState.Failures > 0) do {
      let e = new __Exception(__ExceptionState.Type);
      __ExceptionState.Failures--;
      expect(e.toString()).toBe("abort: Abort in try block");
    } while (false);
;
    {
      __AbortState.abort("Abort in finally block");
      break;
    }
  } while (false);
  if (__ExceptionState.Failures > 0) do {
    let e = new __Exception(__ExceptionState.Type);
    __ExceptionState.Failures--;
    expect(e.toString()).toBe("abort: Abort in finally block");
  } while (false);
;
});
describe("Should handle no errors and execute finally block with abort", () => {
  do {
    do {} while (false);
    {
      __AbortState.abort("Abort in finally");
      break;
    }
  } while (false);
  if (__ExceptionState.Failures > 0) do {
    let e = new __Exception(__ExceptionState.Type);
    __ExceptionState.Failures--;
    expect(e.toString()).toBe("abort: Abort in finally");
  } while (false);
;
});
describe("Should handle abort without a message", () => {
  do {
    __AbortState.abort();
    break;
  } while (false);
  if (__ExceptionState.Failures > 0) do {
    let e = new __Exception(__ExceptionState.Type);
    __ExceptionState.Failures--;
    expect(e.toString()).toBe("abort");
  } while (false);
;
});
describe("Should catch abort in nested try block", () => {
  do {
    do {
      __AbortState.abort("Abort inside nested try");
      break;
    } while (false);
    if (__ExceptionState.Failures > 0) do {
      let e = new __Exception(__ExceptionState.Type);
      __ExceptionState.Failures--;
      expect(e.toString()).toBe("abort: Abort inside nested try");
    } while (false);
;
  } while (false);
  if (__ExceptionState.Failures > 0) do {
    let e = new __Exception(__ExceptionState.Type);
    __ExceptionState.Failures--;
    expect("Final Catch").toBe("abort: This should not execute");
  } while (false);
;
});
describe("Should handle abort from a called function", () => {
  do {
    __try_abortingFunction();
    if (__ExceptionState.Failures > 0) {
      break;
    }
  } while (false);
  if (__ExceptionState.Failures > 0) do {
    let e = new __Exception(__ExceptionState.Type);
    __ExceptionState.Failures--;
    expect(e.toString()).toBe("abort: Aborted from abortingFunction");
  } while (false);
;
});
describe("Should handle abort from a nested function call", () => {
  do {
    __try_nestedAbortingFunction();
    if (__ExceptionState.Failures > 0) {
      break;
    }
  } while (false);
  if (__ExceptionState.Failures > 0) do {
    let e = new __Exception(__ExceptionState.Type);
    __ExceptionState.Failures--;
    expect(e.toString()).toBe("abort: Aborted from nestedAbortingFunction");
  } while (false);
;
});
describe("Should handle abort from an imported function", () => {
  do {
    importedFunction();
  } while (false);
  if (__ExceptionState.Failures > 0) do {
    let e = new __Exception(__ExceptionState.Type);
    __ExceptionState.Failures--;
    expect(e.toString()).toBe("abort: Aborted from importedFunction");
  } while (false);
;
});
describe("Should handle abort from a deeply nested imported function", () => {
  do {
    deepImportedFunction();
  } while (false);
  if (__ExceptionState.Failures > 0) do {
    let e = new __Exception(__ExceptionState.Type);
    __ExceptionState.Failures--;
    expect(e.toString()).toBe("abort: Aborted from deepImportedFunction");
  } while (false);
;
});
describe("Should abort in finally after successful imported function", () => {
  do {
    do {
      expect(true.toString()).toBe("true");
    } while (false);
    {
      __AbortState.abort("Abort after imported function");
      break;
    }
  } while (false);
  if (__ExceptionState.Failures > 0) do {
    let e = new __Exception(__ExceptionState.Type);
    __ExceptionState.Failures--;
    expect(e.toString()).toBe("abort: Abort after imported function");
  } while (false);
;
});
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
