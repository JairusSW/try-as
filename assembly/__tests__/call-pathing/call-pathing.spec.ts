// Comprehensive call-pathing matrix for `expect(() => …).toThrow()`-style
// closures (https://github.com/JairusSW/try-as/issues/1). Every case runs a
// closure through a try/catch matcher and asserts whether an exception is
// observed. The closures reach their throw/abort through every call shape the
// linker has to follow: plain cross-module calls, multi-hop chains, abort
// chains, internally-swallowed throws, rethrows, conditionals, namespace and
// nested-namespace members, instance/static method dispatch, generics, generic
// methods, re-exports, nested/stored closures, and loops. A miss in any of
// these leaves the callee un-rewritten and fatally traps the module.

import { Exception } from "../../index";
import { deep, mid, top, abortMid, swallow, rethrows, maybe, safe, A, Service, genericFail, genericPair, Box } from "./shapes";
import { reexportedMid } from "./reexport";

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
      console.log("BAD  " + this.label + " :: expected " + (this.expectThrow ? "throw" : "no-throw") + " but got " + (threw ? "throw(" + msg + ")" : "no-throw"));
    }
  }
}

function shouldThrow(label: string): Check {
  return new Check(label, true);
}
function shouldNotThrow(label: string): Check {
  return new Check(label, false);
}

// 1: direct throw in closure
shouldThrow("direct-throw").on((): void => {
  throw new Error("x");
});

// 2: one hop
shouldThrow("one-hop").on((): void => {
  mid();
});

// 3: three hops cross-module
shouldThrow("three-hops").on((): void => {
  top();
});

// 4: abort chain
shouldThrow("abort-chain").on((): void => {
  abortMid();
});

// 5: callee swallows internally -> no throw escapes
shouldNotThrow("swallowed").on((): void => {
  swallow();
});

// 6: callee catches then rethrows
shouldThrow("rethrow").on((): void => {
  rethrows();
});

// 7: conditional throw, taken
shouldThrow("conditional-taken").on((): void => {
  maybe(true);
});

// 8: conditional throw, not taken
shouldNotThrow("conditional-not-taken").on((): void => {
  maybe(false);
});

// 9: non-throwing call only
shouldNotThrow("safe-call").on((): void => {
  const x = safe();
  if (x != 42) throw new Error("unreachable");
});

// 10: non-throwing call THEN throwing call (unroll ordering)
shouldThrow("safe-then-throw").on((): void => {
  const x = safe();
  if (x == 42) mid();
});

// 11: namespace member
shouldThrow("namespace").on((): void => {
  A.fails();
});

// 12: nested namespace member
shouldThrow("nested-namespace").on((): void => {
  A.B.fails();
});

// 13: instance method dispatch
shouldThrow("instance-method").on((): void => {
  const s = new Service();
  s.run();
});

// 14: static method returning instance, then instance method
shouldThrow("static-factory-then-method").on((): void => {
  const s = Service.make();
  s.run();
});

// 15: static method that throws
shouldThrow("static-method").on((): void => {
  Service.boom();
});

// 16: generic function
shouldThrow("generic").on((): void => {
  genericFail<i32>();
});

// 17: generic function, two type params
shouldThrow("generic-2").on((): void => {
  genericPair<string, i32>();
});

// 18: generic class instance method
shouldThrow("generic-class-method").on((): void => {
  const b = new Box<i32>();
  b.open();
});

// 19: re-exported through an index module
shouldThrow("reexported").on((): void => {
  reexportedMid();
});

// 20: nested arrow inside the closure
shouldThrow("nested-arrow").on((): void => {
  const inner = (): void => {
    mid();
  };
  inner();
});

// 21: closure stored in a variable, then asserted
const stored = (): void => {
  mid();
};
shouldThrow("stored-closure").on(stored);

// 22: loop body throws
shouldThrow("loop-body").on((): void => {
  for (let i = 0; i < 3; i++) {
    if (i == 2) deep();
  }
});

console.log("---");
console.log("passed: " + passed.toString() + " failed: " + failed.toString());
if (failed > 0) process.exit(1);
