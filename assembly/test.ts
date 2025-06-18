// import { JSON } from "json-as/assembly/index";
// import { ErrorState } from "./types/error";
import { Exception } from "./types/exception";
// import { JSON } from "./foo";
// function parse<T>(s: string): T {
//   if (isNullable<T>())bar();
//   throw new Error("not implemented");
// }

// function bar(): void {
//   abort("Aborted from bar");
// }
// @json
// class Vec3 {
//   x: f32 = 0.0;
//   y: f32 = 0.0;
//   z: f32 = 0.0;
// }

class Foo {
  foo(): void {
    throw new MyError("throw from my error");
  }
}
class MyError extends Error {}

const foo = new Foo();
try {
  // foo.foo();
  throw new MyError("throw from my error");
} catch (e) {
  const err = e as Exception;
  console.log("Caught " + err.toString());
  throw e
} finally {
  console.log("Finally.");
}