// Throwing calls in ARGUMENT position — `something(a, thisThrows())`.
//
// The throwing call must be followed/rewritten wherever it sits in an argument
// list (first/middle/last, nested, alongside literals, both args), and a throw
// mid-expression must SHORT-CIRCUIT the rest of the enclosing block rather than
// letting the following statements run with the failure already flagged.

import { Exception } from "../index";

let passed = 0;
let failed = 0;

class Check {
  constructor(
    private label: string,
    private expectThrow: bool,
  ) {}
  on(routine: () => void): void {
    let threw = false;
    let msg = "";
    try {
      routine();
    } catch (e) {
      threw = true;
      msg = (e as Exception).toString();
    }
    if (threw == this.expectThrow) {
      passed++;
      console.log("ok   " + this.label + (threw ? " -> " + msg : ""));
    } else {
      failed++;
      console.log("BAD  " + this.label + " :: expected " + (this.expectThrow ? "throw" : "no-throw") + " got " + (threw ? "throw(" + msg + ")" : "no-throw"));
    }
  }
}
function shouldThrow(label: string): Check {
  return new Check(label, true);
}
function shouldNotThrow(label: string): Check {
  return new Check(label, false);
}

function thisThrows(): i32 {
  abort("arg-throw");
  return 0;
}
function safeVal(): i32 {
  return 7;
}
// clean callees — never throw on their own
function combine(a: i32, b: i32): i32 {
  return a + b;
}
function combine3(a: i32, b: i32, c: i32): i32 {
  return a + b + c;
}
class Wrapped {
  constructor(public v: i32) {}
  read(): i32 {
    return this.v;
  }
}
function wrap(a: i32, b: i32): Wrapped {
  return new Wrapped(a + b);
}

// --- following the throwing arg in every position --------------------------

shouldThrow("second-arg").on((): void => {
  combine(safeVal(), thisThrows());
});
shouldThrow("first-arg").on((): void => {
  combine(thisThrows(), safeVal());
});
shouldThrow("middle-arg").on((): void => {
  combine3(safeVal(), thisThrows(), safeVal());
});
shouldThrow("literal-and-throw").on((): void => {
  combine(42, thisThrows());
});
shouldThrow("both-args-throw").on((): void => {
  combine(thisThrows(), thisThrows());
});
shouldThrow("nested-arg-call").on((): void => {
  combine(safeVal(), combine(safeVal(), thisThrows()));
});
shouldThrow("variable-initializer").on((): void => {
  const r = combine(safeVal(), thisThrows());
  if (r != 0) thisThrows();
});
shouldThrow("method-chain-receiver").on((): void => {
  const r = wrap(safeVal(), thisThrows()).read();
  if (r != 0) thisThrows();
});
shouldNotThrow("no-throw-args").on((): void => {
  const x = combine(safeVal(), safeVal());
  if (x != 14) thisThrows();
});

// --- short-circuit: statements AFTER the throw must not run ----------------

let sideEffect = 0;
function bump(): i32 {
  sideEffect = 99;
  return 1;
}

shouldThrow("short-circuit-expression-statement").on((): void => {
  sideEffect = 0;
  combine(safeVal(), thisThrows()); // throws mid-arg
  bump(); // must be skipped
});
// (verified below: sideEffect stayed 0)

shouldThrow("short-circuit-variable-statement").on((): void => {
  const r = combine(safeVal(), thisThrows()); // throws in initializer
  bump(); // must be skipped
  if (r != 0) bump();
});

console.log("---");
console.log("passed: " + passed.toString() + " failed: " + failed.toString());
console.log("sideEffect (want 0): " + sideEffect.toString());
if (failed > 0 || sideEffect != 0) process.exit(1);
