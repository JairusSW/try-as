import { Exception } from "./types/exception";

export namespace FOO {
  export function foo(): void {
    abort("Aborted from FOO.foo");
  }
}

function foo(): void {
  abort("Aborted from foo");
}

class BAR {
  bar(): void {
    abort("Aborted from BAR.prototype.bar");
  }
  static bar(): void {
    abort("Aborted from BAR.bar");
  }
}

try {
  FOO.foo();
  foo();
  BAR.bar();
  new BAR().bar();
  throw new Error("throw from my error");
} catch (e) {
  const err = e as Exception;
  console.log("Caught " + err.toString());
  // throw e
} finally {
  console.log("Finally.");
}