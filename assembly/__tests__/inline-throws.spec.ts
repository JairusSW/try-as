// Regression coverage for throws inside `@inline` functions.
//
// try-as used to leave `@inline` throws raw (uncatchable) — a body carrying the
// lowered throw (state-update + `return` breaker) is control flow that AS can't
// inline into an expression slot (`out.push(f(x))`, a coverage `(__COVER, f(x))`,
// etc.). Fix: keep the ORIGINAL `@inline` for non-exception callers (still
// inlined, full speed) and emit a NON-inline `__try_<name>` shadow for
// exception-context callers — a real call sidesteps the inliner, so its breaker
// is legal and the throw is catchable. This is the json-as leaf-validator shape:
// `deserializeFloatArray_NAIVE` (non-inline) -> `@inline deserializeFloat_NAIVE`
// -> `@inline validateJSONNumber` -> throw, all inlined into a `push(...)` arg.
import { describe, expect } from "./lib";
import { Exception } from "../index";

// @ts-ignore: inline
@inline function inlineThrow(x: i32): i32 {
  if (x < 0) throw new Error("inline-negative");
  return x * 2;
}

describe("@inline throw at STATEMENT position is catchable", () => {
  let caught = false;
  try {
    inlineThrow(-1);
  } catch (e) {
    caught = true;
    expect((e as Exception).toString()).toBe("Error: inline-negative");
  }
  expect(caught.toString()).toBe("true");
});

describe("@inline throw in a VARIABLE INITIALIZER is catchable", () => {
  let caught = false;
  try {
    const v = inlineThrow(-1);
  } catch (e) {
    caught = true;
  }
  expect(caught.toString()).toBe("true");
});

describe("@inline throw in a RETURN value is catchable", () => {
  let caught = false;
  try {
    returnsInlineThrow(-1);
  } catch (e) {
    caught = true;
  }
  expect(caught.toString()).toBe("true");
});
function returnsInlineThrow(x: i32): i32 {
  return inlineThrow(x);
}

// --- the leaf-validator-in-expression-position shape (the number/string
//     element case): non-inline scanner pushes the result of nested @inline
//     functions, the innermost of which throws ---------------------------

// @ts-ignore: inline
@inline function validateElem(x: i32): void {
  if (x < 0) throw new Error("bad-element");
}
// @ts-ignore: inline
@inline function parseElem(x: i32): i32 {
  validateElem(x); // nested @inline call
  return x + 100;
}
function parseAll(items: i32[]): i32[] {
  const out = new Array<i32>();
  for (let i = 0; i < items.length; i++) {
    out.push(parseElem(items[i])); // nested @inline chain in an ARG slot
  }
  return out;
}

describe("nested @inline throw in a push() arg is catchable", () => {
  let caught = false;
  try {
    parseAll([1, -5, 3]);
  } catch (e) {
    caught = true;
    expect((e as Exception).toString()).toBe("Error: bad-element");
  }
  expect(caught.toString()).toBe("true");
});

describe("valid input through the @inline chain returns correctly (no false reject)", () => {
  const r = parseAll([1, 2, 3]);
  expect(r.length.toString()).toBe("3");
  expect(r[0].toString()).toBe("101");
  expect(r[2].toString()).toBe("103");
});

// --- the original @inline still works for the NON-exception (no try) path:
//     it should inline and run at full speed; on valid input it just returns --

function sumValid(items: i32[]): i32 {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    total += parseElem(items[i]); // no surrounding try — uses the original @inline
  }
  return total;
}

describe("@inline original path (no try) still computes correctly", () => {
  expect(sumValid([1, 2, 3]).toString()).toBe("306"); // (101+102+103)
});

// --- @inline abort()/unreachable() (not just throw) ----------------------

// @ts-ignore: inline
@inline function inlineAbort(x: i32): i32 {
  if (x == 0) abort("inline-abort");
  return x;
}

describe("@inline abort() is catchable", () => {
  expect(inlineAbort(7).toString()).toBe("7");
  let caught = false;
  try {
    inlineAbort(0);
  } catch (e) {
    caught = true;
    expect((e as Exception).toString()).toBe("abort: inline-abort");
  }
  expect(caught.toString()).toBe("true");
});
