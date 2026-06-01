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

// ---------------------------------------------------------------------------
// REGRESSION 6: an EMPTY catch block still consumes the exception.  Previously
// `try { throws } catch {}` only generated the lowered try loop when the catch
// body was non-empty, so `__ExceptionState.Failures` was never decremented and
// the "swallowed" exception leaked back out to the caller (and ultimately
// trapped).  Fix: transform/src/types/tryref.ts generates the `shouldCatch`
// guard + `Failures--` whenever a catch clause is present, empty or not.

function swallows(): void {
  try {
    abort("swallowed");
  } catch (e) {
    // intentionally empty — should still clear the exception state
  }
}

describe("Empty catch swallows the exception (no leak to caller)", () => {
  let leaked = false;
  try {
    swallows();
  } catch (e) {
    leaked = true;
  }
  expect(leaked.toString()).toBe("false");
});

describe("Execution continues normally after an empty catch swallows", () => {
  let reached = false;
  swallows();
  reached = true;
  expect(reached.toString()).toBe("true");
});

// ---------------------------------------------------------------------------
// REGRESSION 7: a call into a NESTED namespace function is resolved and
// rewritten.  Previously nested namespaces were never registered under their
// parent, so `findLocalNs` couldn't walk `Outer.Inner.boom` — the call was
// left un-rewritten and the raw abort trapped the wasm module.
// Fix: transform/src/passes/source.ts nests namespace refs under their parent.

namespace Outer {
  export namespace Inner {
    export function boom(): void {
      abort("nested-ns-abort");
    }
    export namespace Deeper {
      export function boom(): void {
        abort("deeper-ns-abort");
      }
    }
  }
}

describe("Call into a nested namespace function is catchable", () => {
  let caught = false;
  try {
    Outer.Inner.boom();
  } catch (e) {
    caught = true;
    expect((e as Exception).toString()).toBe("abort: nested-ns-abort");
  }
  expect(caught.toString()).toBe("true");
});

describe("Call into a three-level nested namespace function is catchable", () => {
  let caught = false;
  try {
    Outer.Inner.Deeper.boom();
  } catch (e) {
    caught = true;
    expect((e as Exception).toString()).toBe("abort: deeper-ns-abort");
  }
  expect(caught.toString()).toBe("true");
});

// ---------------------------------------------------------------------------
// REGRESSION 8: a function literal passed to ANY higher-order call is a
// deferred value, so the receiver is not marked exception-bearing (never
// renamed to a never-generated `__try_<name>`) merely because the closure it
// receives can throw — the closure runs only when later invoked. This is the
// general root-cause fix; it is NOT special-cased to test matchers like
// `expect` / `describe`. A non-matcher `deferClosure` that just stores and
// returns the closure must compile and stay opaque, while the closure's own
// body is still rewritten so invoking it later is catchable.
// Fix: transform/src/passes/source.ts (visitFunctionDeclaration walks each
// function-literal body in an isolated exception-stack scope).

function deferClosure(fn: () => void): () => void {
  // returns the closure WITHOUT invoking it
  return fn;
}

describe("Deferred closure does not make its non-matcher receiver throw", () => {
  let reached = false;
  const held = deferClosure((): void => {
    abort("deferred-abort");
  });
  // deferClosure never called the closure, so nothing threw and we get here.
  reached = true;
  expect(reached.toString()).toBe("true");

  // Invoking the held closure DOES throw, and the rewritten body is catchable.
  let caught = false;
  try {
    held();
  } catch (e) {
    caught = true;
    expect((e as Exception).toString()).toBe("abort: deferred-abort");
  }
  expect(caught.toString()).toBe("true");
});

// ---------------------------------------------------------------------------
// REGRESSION 9: a throwing call passed as an EAGER argument to a clean
// (non-throwing) callee must NOT rename that callee to `__try_<name>`. The
// shadow is only generated for a callee that throws on its own, so renaming a
// clean receiver dangles — and at EXPRESSION position there is no `isDefined`
// fallback, so it fails to compile (`Cannot find name '__try_wrap'`). This is
// the `expect(JSON.parse(bad)).toBe(x)` shape from json-as, generalized: the
// throwing arg is rewritten on its own and the enclosing checkpoint catches
// the failure; the clean callee site stays as-is.
// Fix: transform/src/types/callref.ts (gate the rewrite on the callee itself
// throwing — `this.calling.hasException`).

function throwingArg(): i32 {
  abort("eager-arg-abort");
  return 0;
}

class Wrapped {
  constructor(public value: i32) {}
  // never throws on its own
  read(): i32 {
    return this.value;
  }
}

// clean factory (does not throw) — mirrors as-test's `expect(...)`
function wrap(v: i32): Wrapped {
  return new Wrapped(v);
}

describe("Throwing eager arg to a clean callee at expression position is catchable", () => {
  let caught = false;
  try {
    // `wrap(...)` sits at expression position (receiver of `.read()`) with a
    // throwing eager argument — `wrap` must stay un-renamed and compile.
    const r = wrap(throwingArg()).read();
    if (r != 0) expect(r.toString()).toBe("never-reached");
  } catch (e) {
    caught = true;
    expect((e as Exception).toString()).toBe("abort: eager-arg-abort");
  }
  expect(caught.toString()).toBe("true");
});

// ---------------------------------------------------------------------------
// REGRESSION 10: a throw mid-expression (a throwing call in an ARGUMENT or a
// variable initializer) must SHORT-CIRCUIT the rest of the block — the
// statements after it must not run with `__ExceptionState.Failures` already
// set. A throwing call in a non-statement slot has no statement `ref` of its
// own to anchor an unroll check to, so without help the following statements
// executed. Fix: the linker tracks the enclosing block-level statement
// (transform/src/passes/source.ts, transform/src/globals/globals.ts) and
// CallRef anchors `if (Failures > 0) <breaker>` after it
// (transform/src/types/callref.ts).

function throwsI32(): i32 {
  abort("midexpr-abort");
  return 0;
}
function take2(a: i32, b: i32): i32 {
  return a + b;
}

let regr10SideEffect = 0;
function regr10Bump(): i32 {
  regr10SideEffect = 99;
  return 1;
}

describe("Throw in an argument short-circuits the following statement", () => {
  regr10SideEffect = 0;
  let caught = false;
  try {
    take2(1, throwsI32()); // throws mid-argument
    regr10Bump(); // must be skipped
  } catch (e) {
    caught = true;
    expect((e as Exception).toString()).toBe("abort: midexpr-abort");
  }
  expect(caught.toString()).toBe("true");
  expect(regr10SideEffect.toString()).toBe("0"); // 0 => the following statement was skipped
});

describe("Throw in a variable initializer short-circuits the following statement", () => {
  regr10SideEffect = 0;
  let caught = false;
  try {
    const v = take2(1, throwsI32()); // throws in initializer
    regr10Bump(); // must be skipped
    if (v != 0) regr10Bump();
  } catch (e) {
    caught = true;
    expect((e as Exception).toString()).toBe("abort: midexpr-abort");
  }
  expect(caught.toString()).toBe("true");
  expect(regr10SideEffect.toString()).toBe("0");
});
