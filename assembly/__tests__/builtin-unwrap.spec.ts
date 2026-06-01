// A throwing call sitting directly in an AS builtin arg slot
// (`inline.always(...)`, `inline.never(...)`, `unchecked(...)`) must stay
// catchable. The builtin inlines the callee body into its expression position,
// which would bypass the `__try_` shadow and leave a deep throw as a raw abort.
// The transform drops the wrapper and calls the `__try_` shadow normally
// (trading the forced inline / unchecked context for catchability). This must
// hold for ALL the wrapper builtins, not just inline.always.
import { describe, expect } from "./lib";
import { Exception } from "../index";

function boom<T>(): T {
  throw new Error("builtin-unwrap-boom");
}

describe("Throwing call in inline.always(...) is catchable", () => {
  let caught = false;
  try {
    inline.always(boom<i32>());
  } catch (e) {
    caught = true;
    expect((e as Exception).toString()).toBe("Error: builtin-unwrap-boom");
  }
  expect(caught.toString()).toBe("true");
});

describe("Throwing call in inline.never(...) is catchable", () => {
  let caught = false;
  try {
    inline.never(boom<i32>());
  } catch (e) {
    caught = true;
    expect((e as Exception).toString()).toBe("Error: builtin-unwrap-boom");
  }
  expect(caught.toString()).toBe("true");
});

describe("Throwing call in unchecked(...) is catchable", () => {
  let caught = false;
  try {
    unchecked(boom<i32>());
  } catch (e) {
    caught = true;
    expect((e as Exception).toString()).toBe("Error: builtin-unwrap-boom");
  }
  expect(caught.toString()).toBe("true");
});

// A throwing call wrapped in a non-inlining builtin (changetype reinterprets a
// VALUE, it does not inline a body) stays catchable via the ordinary
// expression-position `__try_` redirect — no wrapper unwrap needed.
function boomPtr(): usize {
  throw new Error("changetype-boom");
}

describe("Throwing call in changetype<T>(...) is catchable", () => {
  let caught = false;
  try {
    const v = changetype<i32>(boomPtr());
  } catch (e) {
    caught = true;
    expect((e as Exception).toString()).toBe("Error: changetype-boom");
  }
  expect(caught.toString()).toBe("true");
});

// --- a NON-throwing call in a builtin arg slot still works (no false reject;
//     the original @inline stays inlined for the happy path) --------------

function readValue(p: i32): i32 {
  return p + 1;
}

describe("Non-throwing inline.always(...) returns correctly", () => {
  expect(inline.always(readValue(41)).toString()).toBe("42");
});

// --- a builtin wrapping a call whose DEEP chain throws is catchable -------

function deepBoom2(x: i32): i32 {
  return deepBoom1(x);
}
function deepBoom1(x: i32): i32 {
  throw new Error("inline-deep-boom");
}

describe("inline.always over a deep throwing chain is catchable", () => {
  let caught = false;
  try {
    inline.always(deepBoom2(0));
  } catch (e) {
    caught = true;
    expect((e as Exception).toString()).toBe("Error: inline-deep-boom");
  }
  expect(caught.toString()).toBe("true");
});

// --- type-query builtins (isString/isInteger/…) sit in CONDITIONS, never
//     wrap a throwing call; the throw lives in the branch and must still be
//     traced + catchable -------------------------------------------------

function guardedThrow<T>(x: i32): void {
  if (isString<T>()) {
    throw new Error("string-branch");
  } else if (isInteger<T>()) {
    throw new Error("integer-branch");
  }
}

describe("throw guarded by isString<T>() is traced and catchable", () => {
  let caught = false;
  try {
    guardedThrow<string>(0);
  } catch (e) {
    caught = true;
    expect((e as Exception).toString()).toBe("Error: string-branch");
  }
  expect(caught.toString()).toBe("true");
});

describe("throw guarded by isInteger<T>() is traced and catchable", () => {
  let caught = false;
  try {
    guardedThrow<i32>(0);
  } catch (e) {
    caught = true;
    expect((e as Exception).toString()).toBe("Error: integer-branch");
  }
  expect(caught.toString()).toBe("true");
});
