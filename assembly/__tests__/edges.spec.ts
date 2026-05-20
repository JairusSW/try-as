import { describe, expect } from "./lib";
import { Exception, ExceptionType } from "../index";

// ---------------------------------------------------------------------------
// Throw using `as<T>()` on an Exception whose payload was never captured.

describe("Should return default i32 when no Throw is active", () => {
  try {
    abort("not-throw");
  } catch (e) {
    const err = e as Exception;
    expect(err.type.toString()).toBe(ExceptionType.Abort.toString());
    // as<i32> on a non-Throw exception returns default
    expect(err.as<i32>().toString()).toBe("0");
  }
});

// ---------------------------------------------------------------------------
// Re-entrancy: throw inside catch inside try inside catch...

describe("Should handle deeply nested throw-from-catch chain", () => {
  let depths: i32 = 0;
  try {
    try {
      try {
        abort("d1");
      } catch (e) {
        depths++;
        abort("d2");
      }
    } catch (e) {
      depths++;
      abort("d3");
    }
  } catch (e) {
    depths++;
    expect((e as Exception).toString()).toBe("abort: d3");
  }
  expect(depths.toString()).toBe("3");
});

// ---------------------------------------------------------------------------
// Generic function with a throwing call.

function genericIdentity<T>(v: T): T {
  return v;
}

function genericThrow<T>(): T {
  abort("generic-throw");
  return changetype<T>(0);
}

describe("Should catch abort from generic instantiation", () => {
  let caught = false;
  try {
    // Statement-position call.
    genericThrow<i32>();
  } catch (e) {
    caught = true;
    expect((e as Exception).toString()).toBe("abort: generic-throw");
  }
  expect(caught.toString()).toBe("true");
});

describe("Should leave normal generic functions alone", () => {
  expect(genericIdentity<i32>(42).toString()).toBe("42");
});

// ---------------------------------------------------------------------------
// Throw inside a function called from within a try (deeper nesting).

function level3(): void {
  abort("level-3");
}
function level2(): void {
  level3();
}
function level1(): void {
  level2();
}

describe("Should propagate abort across three-deep call chain", () => {
  let caught = false;
  try {
    level1();
  } catch (e) {
    caught = true;
    expect((e as Exception).toString()).toBe("abort: level-3");
  }
  expect(caught.toString()).toBe("true");
});

// ---------------------------------------------------------------------------
// Throw inside arrow function (closure-like).

function runCallback(cb: () => void): void {
  cb();
}

describe("Should propagate abort from an arrow-function callback", () => {
  let caught = false;
  try {
    runCallback((): void => {
      abort("from-arrow");
    });
  } catch (e) {
    caught = true;
    expect((e as Exception).toString()).toBe("abort: from-arrow");
  }
  expect(caught.toString()).toBe("true");
});

// ---------------------------------------------------------------------------
// Exception.type for unreachable should be Unreachable.

describe("Should expose Unreachable exception type correctly", () => {
  try {
    unreachable();
  } catch (e) {
    const err = e as Exception;
    expect(err.type.toString()).toBe(ExceptionType.Unreachable.toString());
  }
});

// ---------------------------------------------------------------------------
// is<T>() / as<T>() round-trip across rethrow.

describe("Should preserve typed payload across explicit rethrow chain", () => {
  let outerCaught = false;
  try {
    try {
      throw 42;
    } catch (e) {
      throw e;
    }
  } catch (e) {
    outerCaught = true;
    const err = e as Exception;
    expect(err.is<i32>().toString()).toBe("true");
    expect(err.as<i32>().toString()).toBe("42");
  }
  expect(outerCaught.toString()).toBe("true");
});

// ---------------------------------------------------------------------------
// Failures counter doesn't leak across describes.

describe("Should not leak Failures across uncaught propagation", () => {
  // First, throw and catch.
  try {
    abort("first");
  } catch (e) {
    expect((e as Exception).toString()).toBe("abort: first");
  }
  // Now run a second try with no abort — should not "catch" anything stale.
  let secondCaught = false;
  try {
    // do nothing
  } catch (e) {
    secondCaught = true;
  }
  expect(secondCaught.toString()).toBe("false");
});

// ---------------------------------------------------------------------------
// Calling abort with msg + fileName only (line/col left as defaults).

describe("Should preserve fileName when abort is given msg + file", () => {
  try {
    abort("with-file", "myfile.ts");
  } catch (e) {
    const err = e as Exception;
    expect(err.msg!).toBe("with-file");
    expect(err.fileName!).toBe("myfile.ts");
    expect(err.toString()).toBe("abort: with-file in myfile.ts");
  }
});

// ---------------------------------------------------------------------------
// Calling abort with the full documented signature (msg, fileName, i32 line,
// i32 col).  Until bug 6 was fixed, the transformed `__AbortState.abort`
// took strings for line/col and rejected i32 literals at compile time.

describe("Should preserve file/line/column when abort takes all args", () => {
  try {
    abort("with-loc", "myfile.ts", 10, 20);
  } catch (e) {
    const err = e as Exception;
    expect(err.msg!).toBe("with-loc");
    expect(err.fileName!).toBe("myfile.ts");
    expect(err.lineNumber.toString()).toBe("10");
    expect(err.columnNumber.toString()).toBe("20");
    expect(err.toString()).toBe("abort: with-loc in myfile.ts in (10:20)");
  }
});
