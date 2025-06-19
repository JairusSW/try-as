import { Exception } from "./types/exception";

export namespace FOO {
  export function foo(): void {
    abort("Aborted from FOO.foo");
  }
}

export function foo(): void {
  abort("Aborted from foo");
}

try {
  FOO.foo();
  // throw new MyError("throw from my error");
} catch (e) {
  const err = e as Exception;
  console.log("Caught " + err.toString());
  throw e
} finally {
  console.log("Finally.");
}