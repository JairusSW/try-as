// Regression coverage for DEEP call-chain tracing.
//
// Previously the linker only followed calls inside a named function or a try
// block — calls inside an anonymous arrow/closure body (which sets parentFn
// but not lastFn) were not traced, so a throw down a deep chain reached from a
// closure stayed a raw abort. The fix traces calls whenever we're inside ANY
// tracked body (lastFn / lastTry / parentFn). This is the shape behind
// `expect((): void => { lib.parse(bad) }).toThrow()`.
//
// Also covers the propagation FIXPOINT: a call site must be redirected to a
// callee's `__try_` shadow regardless of the order the callee was first
// resolved in — the failure mode was a dispatcher that branches on a
// compile-time constant and returns one of several throwing helpers, where the
// branch visited first "won" and the others were left calling the raw original.
import { describe, expect } from "./lib";
import { Exception } from "../index";

// --- deep, multi-hop, generic free-function chain ------------------------

function level4<T>(x: i32): T {
  throw new Error("deep-chain-boom");
}
function level3<T>(x: i32): T {
  return level4<T>(x);
}
function level2<T>(x: i32): T {
  return level3<T>(x);
}
function level1<T>(x: i32): T {
  return level2<T>(x);
}

describe("deep generic free-fn chain is catchable", () => {
  let caught = false;
  try {
    level1<i32>(0);
  } catch (e) {
    caught = true;
    expect((e as Exception).toString()).toBe("Error: deep-chain-boom");
  }
  expect(caught.toString()).toBe("true");
});

// --- deep chain reached from a CLOSURE passed to a higher-order fn --------

function runClosure(fn: () => void): void {
  fn();
}

describe("deep chain reached through a closure is catchable", () => {
  let caught = false;
  try {
    runClosure((): void => {
      level1<i32>(0);
    });
  } catch (e) {
    caught = true;
  }
  expect(caught.toString()).toBe("true");
});

// Module-level flag: AS has no capturing closures, so a closure can only touch
// module scope (this mirrors json-as's `toThrow` closures, which capture nothing).
let CLOSURE_RAN = false;
function markRan(): void {
  CLOSURE_RAN = true;
}

describe("closure body that does NOT throw still runs (no false positive)", () => {
  CLOSURE_RAN = false;
  runClosure((): void => {
    markRan();
  });
  expect(CLOSURE_RAN.toString()).toBe("true");
});

// --- dispatcher branching on a compile-time constant, each branch a
//     DIFFERENT throwing helper (exercises the order-independent fixpoint) --

const enum Mode {
  A,
  B,
  C,
}
// @ts-ignore: compile-time constant selects exactly one branch per instantiation
const MODE: Mode = Mode.B;

function helperA<T>(x: i32): T {
  throw new Error("helper-A");
}
function helperB<T>(x: i32): T {
  throw new Error("helper-B");
}
function helperC<T>(x: i32): T {
  throw new Error("helper-C");
}

function dispatch<T>(x: i32): T {
  if (MODE == Mode.A) return helperA<T>(x);
  else if (MODE == Mode.B) return helperB<T>(x);
  return helperC<T>(x);
}

describe("compile-time-constant dispatcher to throwing helpers is catchable", () => {
  let caught = false;
  try {
    dispatch<i32>(0);
  } catch (e) {
    caught = true;
    expect((e as Exception).toString()).toBe("Error: helper-B");
  }
  expect(caught.toString()).toBe("true");
});

// --- a deep chain where only the LEAF throws and intermediate hops are
//     pure pass-throughs that also return values (propagation through
//     value-returning intermediates) -------------------------------------

function leafThrow(x: i32): i32 {
  if (x < 0) throw new Error("leaf-negative");
  return x * 2;
}
function mid(x: i32): i32 {
  return leafThrow(x) + 1;
}
function top(x: i32): i32 {
  return mid(x) + 1;
}

describe("throw in a deep value-returning chain propagates and is catchable", () => {
  expect(top(5).toString()).toBe("12"); // valid path: (5*2)+1+1
  let caught = false;
  try {
    top(-1);
  } catch (e) {
    caught = true;
    expect((e as Exception).toString()).toBe("Error: leaf-negative");
  }
  expect(caught.toString()).toBe("true");
});
