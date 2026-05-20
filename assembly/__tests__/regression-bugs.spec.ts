// Regression coverage for previously-broken cases.  Each describe pins
// a specific fix in place — if any of them ever flips back to failing,
// the bug surveyed below has returned.

import { describe, expect } from "./lib";
import { Exception } from "../index";

// ---------------------------------------------------------------------------
// REGRESSION 1: a throwing function used in an expression slot (assignment,
// initializer, return) is rewritten to `__try_<name>` so its failure still
// propagates.  Previously the rename was reverted and the un-instrumented
// function ran, trapping the wasm module on raw `abort()`.
// Fix: transform/src/types/callref.ts (keep rename in expression position).

function throwingI32(): i32 {
  abort("throwingI32");
  return 42;
}

describe("Throwing function in assignment expression is catchable", () => {
  let caught = false;
  let received: i32 = -1;
  try {
    received = throwingI32();
  } catch (e) {
    caught = true;
    expect((e as Exception).toString()).toBe("abort: throwingI32");
  }
  expect(caught.toString()).toBe("true");
  // Assignment still happens with the breaker-default (0).  Suppressing
  // the inert write would require wrapping the enclosing statement and
  // is not currently in scope.
  expect(received.toString()).toBe("0");
});

// ---------------------------------------------------------------------------
// REGRESSION 2: a call to a method inherited (not overridden) from a base
// class is rewritten through `__try_<name>` even when only the base owns
// the method.  Previously matchesClass only checked the immediate parent
// class and missed inherited methods.
// Fix: transform/src/passes/replacer.ts matchesClass walks classExtends.

class BaseThrower {
  trigger(): void {
    abort("base-trigger");
  }
}
class DerivedThrower extends BaseThrower {}

describe("Derived-class call to inherited throwing method is catchable", () => {
  const obj = new DerivedThrower();
  let caught = false;
  try {
    obj.trigger();
  } catch (e) {
    caught = true;
    expect((e as Exception).toString()).toBe("abort: base-trigger");
  }
  expect(caught.toString()).toBe("true");
});

// ---------------------------------------------------------------------------
// REGRESSION 3: when a catch block re-aborts, the trailing finally still
// runs.  Previously the catch's breaker was a function-return that skipped
// the finally entirely.
// Fix: catch body is wrapped in its own do/while; catch-body abort breakers
// use `break` (transform/src/passes/source.ts + transform/src/types/tryref.ts).

describe("Trailing finally runs even when catch re-aborts", () => {
  let finallyRan = false;
  let outerCaught = false;
  try {
    try {
      abort("inner");
    } catch (e) {
      abort("rethrown");
    } finally {
      finallyRan = true;
    }
  } catch (e) {
    outerCaught = true;
    expect((e as Exception).toString()).toBe("abort: rethrown");
  }
  expect(finallyRan.toString()).toBe("true");
  expect(outerCaught.toString()).toBe("true");
});

// ---------------------------------------------------------------------------
// REGRESSION 4: an abort inside a user-defined constructor surfaces through
// the `new` expression as a regular Exception.  Previously constructors
// were skipped entirely by the linker (no rewrites) and the raw abort
// trapped the wasm module.
// Fix: transform/src/passes/source.ts (visit constructor MethodDeclarations)
// + transform/src/types/methodref.ts (no rename / no sibling for ctors).

class ThrowingCtor {
  public value: i32 = 0;
  constructor(arg: i32) {
    if (arg < 0) abort("ctor-negative");
    this.value = arg;
  }
}

describe("Constructor abort is catchable from new expression", () => {
  let caught = false;
  try {
    new ThrowingCtor(-1);
  } catch (e) {
    caught = true;
    expect((e as Exception).toString()).toBe("abort: ctor-negative");
  }
  expect(caught.toString()).toBe("true");
});

// ---------------------------------------------------------------------------
// REGRESSION 5: a property getter that aborts is catchable.  Previously
// getter/setter methods were renamed to `__try_<name>` and AS couldn't
// resolve the property-access call, so the raw body ran and trapped.
// Fix: transform/src/types/methodref.ts skips the rename for get/set.

class ThrowingProp {
  private _v: i32 = 0;
  get value(): i32 {
    abort("get-throw");
    return this._v;
  }
}

describe("Property getter abort is catchable", () => {
  const obj = new ThrowingProp();
  let caught = false;
  try {
    // The read lands on the breaker-default (0); the failure still
    // propagates and the catch fires.
    const v = obj.value;
    if (v != 0) expect(v.toString()).toBe("never-reached");
  } catch (e) {
    caught = true;
    expect((e as Exception).toString()).toBe("abort: get-throw");
  }
  expect(caught.toString()).toBe("true");
});
