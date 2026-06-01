// Regression coverage for abort()/unreachable() (and throw) sitting in an
// EXPRESSION position — most importantly as the direct value of a `return`.
//
// The bug: try-as lowered `return unreachable()` via the statement path
// (`isRefStatement` is true because the REF is a Return), so `replaceRef` set
// the return's VALUE slot to a two-statement array, emitting malformed
// `return __UnreachableState.unreachable()if (…) …`. AS then asserted while
// compiling it, which manifested downstream as "build worker exited
// unexpectedly". It only surfaced once deep call-chain tracing started
// reaching tails like `deserializeArbitrary`'s `return unreachable()`.
//
// Fix: when abort/unreachable is the direct value of a `return`, emit
// `return (stateCall, <typed default>)` — a valid typed value that sets the
// exception state. If ANY of these specs miscompiles, the file fails to build
// (so building at all is half the test); the asserts confirm catchability and
// that the typed default keeps the value slot well-formed for every return
// type.
import { describe, expect } from "./lib";
import { Exception } from "../index";

// --- `return unreachable()` tails, one per return-type family ------------

function dispatchI32(x: i32): i32 {
  if (x == 1) return 10;
  if (x == 2) return 20;
  return unreachable();
}

function dispatchF64(x: i32): f64 {
  if (x == 1) return 1.5;
  return unreachable();
}

function dispatchBool(x: i32): bool {
  if (x == 1) return true;
  return unreachable();
}

function dispatchStr(x: i32): string {
  if (x == 1) return "one";
  return unreachable();
}

class Boxed {
  constructor(public v: i32) {}
}

function dispatchRef(x: i32): Boxed {
  if (x == 1) return new Boxed(1);
  return unreachable();
}

function dispatchVoid(x: i32): void {
  if (x == 1) return;
  unreachable();
}

// --- `return abort(...)` tails -------------------------------------------

function dispatchAbortI32(x: i32): i32 {
  if (x == 1) return 10;
  return abort("no i32 match");
}

function dispatchAbortStr(x: i32): string {
  if (x == 1) return "one";
  return abort("no string match");
}

describe("return unreachable() (i32) compiles and is catchable", () => {
  // valid path returns the right value (no false rejection)
  expect(dispatchI32(2).toString()).toBe("20");
  let caught = false;
  try {
    dispatchI32(99);
  } catch (e) {
    caught = true;
  }
  expect(caught.toString()).toBe("true");
});

describe("return unreachable() (f64) is catchable", () => {
  expect(dispatchF64(1).toString()).toBe("1.5");
  let caught = false;
  try {
    dispatchF64(99);
  } catch (e) {
    caught = true;
  }
  expect(caught.toString()).toBe("true");
});

describe("return unreachable() (bool) is catchable", () => {
  expect(dispatchBool(1).toString()).toBe("true");
  let caught = false;
  try {
    dispatchBool(99);
  } catch (e) {
    caught = true;
  }
  expect(caught.toString()).toBe("true");
});

describe("return unreachable() (string) is catchable", () => {
  expect(dispatchStr(1)).toBe("one");
  let caught = false;
  try {
    dispatchStr(99);
  } catch (e) {
    caught = true;
  }
  expect(caught.toString()).toBe("true");
});

describe("return unreachable() (reference) is catchable", () => {
  expect(dispatchRef(1).v.toString()).toBe("1");
  let caught = false;
  try {
    dispatchRef(99);
  } catch (e) {
    caught = true;
  }
  expect(caught.toString()).toBe("true");
});

describe("unreachable() tail (void) is catchable", () => {
  let caught = false;
  try {
    dispatchVoid(99);
  } catch (e) {
    caught = true;
  }
  expect(caught.toString()).toBe("true");
});

describe("return abort() (i32) is catchable with message", () => {
  expect(dispatchAbortI32(1).toString()).toBe("10");
  let caught = false;
  try {
    dispatchAbortI32(99);
  } catch (e) {
    caught = true;
    expect((e as Exception).toString()).toBe("abort: no i32 match");
  }
  expect(caught.toString()).toBe("true");
});

describe("return abort() (string) is catchable with message", () => {
  let caught = false;
  try {
    dispatchAbortStr(99);
  } catch (e) {
    caught = true;
    expect((e as Exception).toString()).toBe("abort: no string match");
  }
  expect(caught.toString()).toBe("true");
});

// --- reached through a CLOSURE passed to a higher-order fn (the json-as
//     `expect((): void => { parse(bad) }).toThrow()` shape: deep tracing must
//     follow the closure body into the dispatch tail) ---------------------

function invoke(fn: () => void): void {
  fn();
}

describe("return unreachable() reached via a closure is catchable", () => {
  let caught = false;
  try {
    invoke((): void => {
      dispatchI32(99);
    });
  } catch (e) {
    caught = true;
  }
  expect(caught.toString()).toBe("true");
});

// abort/unreachable in a non-return expression slot (variable initializer):
function initAbort(x: i32): i32 {
  const v: i32 = x == 1 ? 5 : abort("init abort");
  return v;
}

describe("abort() in a variable initializer is catchable", () => {
  expect(initAbort(1).toString()).toBe("5");
  let caught = false;
  try {
    initAbort(99);
  } catch (e) {
    caught = true;
  }
  expect(caught.toString()).toBe("true");
});
