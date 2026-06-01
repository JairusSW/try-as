// Regression test for https://github.com/JairusSW/try-as/issues/1
//
// `expect((): void => { ... }).toThrow()` must catch exceptions raised by
// functions the closure *calls* (especially across a module boundary), not
// just a literal `throw`/`abort` written directly in the closure body. Before
// the fix, the call gate in the source pass only followed calls when a tracked
// function or active try was in scope; an anonymous arrow sets `parentFn` but
// not `lastFn`, so calls inside the closure were never followed and the
// callee's throw/abort hit the real `abort` and fatally trapped the module.

import { describe } from "./lib";
import { Exception } from "../index";
import { mid, abortMid, NS, Parser, genericFail } from "./closure-throw-shapes";

function expect(routine: () => void): ThrowExpectation {
  return new ThrowExpectation(routine);
}

class ThrowExpectation {
  constructor(private readonly routine: () => void) {}

  toThrow(): void {
    let threw = false;
    try {
      this.routine();
    } catch (e) {
      threw = true;
      console.log('  threw "' + (e as Exception).toString() + '"');
    }
    if (!threw) {
      console.log("  (expected throw) -> any exception");
      console.log("  (received throw) -> no exception");
      process.exit(1);
    }
  }
}

describe("toThrow catches a direct throw in the closure", () => {
  expect((): void => {
    throw new Error("boom");
  }).toThrow();
});

describe("toThrow catches a cross-module throw chain (closure -> mid -> deep)", () => {
  expect((): void => {
    mid();
  }).toThrow();
});

describe("toThrow catches a cross-module abort chain (closure -> abortMid -> abortDeep)", () => {
  expect((): void => {
    abortMid();
  }).toThrow();
});

describe("toThrow catches a throw from a namespace member call", () => {
  expect((): void => {
    NS.fails();
  }).toThrow();
});

describe("toThrow catches a throw from instance method dispatch", () => {
  expect((): void => {
    const p = new Parser();
    p.parse();
  }).toThrow();
});

describe("toThrow catches a throw from a generic function call", () => {
  expect((): void => {
    genericFail<i32>();
  }).toThrow();
});
