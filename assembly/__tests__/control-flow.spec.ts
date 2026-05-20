import { describe, expect } from "./lib";
import { Exception } from "../index";

// ----------------------------------------------------------------------------
// Return-value propagation (statement position works; expression position is
// a known limitation tracked separately).

function abortsVoid(): void {
  abort("abortsVoid");
}

describe("Should catch abort from a void function at statement position", () => {
  let caught = false;
  try {
    abortsVoid();
  } catch (e) {
    caught = true;
    expect((e as Exception).toString()).toBe("abort: abortsVoid");
  }
  expect(caught.toString()).toBe("true");
});

// ----------------------------------------------------------------------------
// Throw inside loops.

describe("Should catch throw from inside while-loop body", () => {
  let iterations = 0;
  let caught = false;
  try {
    let i = 0;
    while (i < 5) {
      iterations++;
      if (i == 2) abort("while-boom");
      i++;
    }
  } catch (e) {
    caught = true;
    expect((e as Exception).toString()).toBe("abort: while-boom");
  }
  expect(caught.toString()).toBe("true");
  expect(iterations.toString()).toBe("3");
});

describe("Should catch throw from inside for-loop body", () => {
  let last: i32 = -1;
  let caught = false;
  try {
    for (let i = 0; i < 5; i++) {
      last = i;
      if (i == 3) abort("for-boom");
    }
  } catch (e) {
    caught = true;
    expect((e as Exception).toString()).toBe("abort: for-boom");
  }
  expect(caught.toString()).toBe("true");
  expect(last.toString()).toBe("3");
});

describe("Should catch throw from inside do-while-loop body", () => {
  let iterations = 0;
  let caught = false;
  try {
    let i = 0;
    do {
      iterations++;
      if (i == 1) abort("do-boom");
      i++;
    } while (i < 5);
  } catch (e) {
    caught = true;
    expect((e as Exception).toString()).toBe("abort: do-boom");
  }
  expect(caught.toString()).toBe("true");
  expect(iterations.toString()).toBe("2");
});

// ----------------------------------------------------------------------------
// Multiple sequential throws – state hygiene.

describe("Should reset state between sequential uncaught throws", () => {
  for (let i = 0; i < 3; i++) {
    try {
      abort("iter-" + i.toString());
    } catch (e) {
      expect((e as Exception).toString()).toBe("abort: iter-" + i.toString());
    }
  }
});

// ----------------------------------------------------------------------------
// Exception.is<T>() and as<T>() with wrong types.

describe("Should report is<T>() false for mismatched primitive type", () => {
  try {
    throw 7;
  } catch (e) {
    const err = e as Exception;
    expect(err.is<i32>().toString()).toBe("true");
    expect(err.is<i64>().toString()).toBe("false");
    expect(err.is<f64>().toString()).toBe("false");
    expect(err.is<bool>().toString()).toBe("false");
  }
});

describe("Should return default value for as<T>() of mismatched type", () => {
  try {
    throw 12345;
  } catch (e) {
    const err = e as Exception;
    expect(err.as<i32>().toString()).toBe("12345");
    // Wrong type should yield zero-default per ExceptionState.DefaultValue
    expect(err.as<i64>().toString()).toBe("0");
    expect(err.as<f64>().toString()).toBe("0.0");
    expect(err.as<bool>().toString()).toBe("false");
  }
});

describe("Should return default for is<T>() / as<T>() on Abort exception", () => {
  try {
    abort("not-a-throw");
  } catch (e) {
    const err = e as Exception;
    expect(err.is<i32>().toString()).toBe("false");
    // as<T>() of non-Throw exception should return default
    expect(err.as<i32>().toString()).toBe("0");
  }
});

// ----------------------------------------------------------------------------
// clone() should preserve primitive payload.

describe("Should preserve primitive payload through clone()", () => {
  let cloned: Exception | null = null;
  try {
    throw 99;
  } catch (e) {
    cloned = (e as Exception).clone();
  }
  expect((cloned != null).toString()).toBe("true");
  if (cloned) {
    expect(cloned.is<i32>().toString()).toBe("true");
    expect(cloned.as<i32>().toString()).toBe("99");
  }
});

describe("Should preserve f64 payload through clone()", () => {
  let cloned: Exception | null = null;
  try {
    throw 3.14;
  } catch (e) {
    cloned = (e as Exception).clone();
  }
  expect((cloned != null).toString()).toBe("true");
  if (cloned) {
    expect(cloned.is<f64>().toString()).toBe("true");
    expect(cloned.as<f64>().toString()).toBe("3.14");
  }
});

// ----------------------------------------------------------------------------
// Conditional branches.

describe("Should catch throw from inside an if-branch", () => {
  const flag = true;
  let caught = false;
  try {
    if (flag) {
      abort("if-branch");
    } else {
      abort("else-branch");
    }
  } catch (e) {
    caught = true;
    expect((e as Exception).toString()).toBe("abort: if-branch");
  }
  expect(caught.toString()).toBe("true");
});

describe("Should catch throw from inside an else-branch", () => {
  const flag = false;
  let caught = false;
  try {
    if (flag) {
      abort("if-branch");
    } else {
      abort("else-branch");
    }
  } catch (e) {
    caught = true;
    expect((e as Exception).toString()).toBe("abort: else-branch");
  }
  expect(caught.toString()).toBe("true");
});

// ----------------------------------------------------------------------------
// Static methods.

class StaticThrow {
  static go(): void {
    abort("static-go");
  }
}

describe("Should catch abort from a static method", () => {
  try {
    StaticThrow.go();
  } catch (e) {
    expect((e as Exception).toString()).toBe("abort: static-go");
  }
});

// ----------------------------------------------------------------------------
// Try with only finally (no catch) — failure should still propagate.

function callsTryFinally(): void {
  try {
    abort("only-finally");
  } finally {
    // no catch, no other action
  }
}

describe("Should propagate failure across try-finally without catch", () => {
  let outerCaught = false;
  try {
    callsTryFinally();
  } catch (e) {
    outerCaught = true;
    expect((e as Exception).toString()).toBe("abort: only-finally");
  }
  expect(outerCaught.toString()).toBe("true");
});

// ----------------------------------------------------------------------------
// Switch case statements.

describe("Should catch throw from inside a switch case", () => {
  const which: i32 = 2;
  let caught = false;
  try {
    switch (which) {
      case 1:
        abort("case-1");
        break;
      case 2:
        abort("case-2");
        break;
      default:
        abort("default-case");
    }
  } catch (e) {
    caught = true;
    expect((e as Exception).toString()).toBe("abort: case-2");
  }
  expect(caught.toString()).toBe("true");
});
