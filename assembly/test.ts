// import { foo } from "./foo";

// import { expect } from "./__tests__/lib";
// import { describe } from "./__tests__/lib";
// import { JSON } from "./foo";
// import { FOO, foo } from "./foo";
import { JSON } from "json-as";

// function callFoo(): void {
//   foo();
//   console.log("this should never execute!");
// }
// function callCallFoo(): void {
//   callFoo();
//   console.log("this should never execute!");
// }
// try {
//   // Do something
//   foo();
//   callFoo();
//   callCallFoo();
//   console.log("This should not execute");
// } catch (e) {
//   console.log("Got an error: " + e.toString());
//   // try {
//   //   foo();
//   // } catch (e) {
//   //   console.log("Got another error: " + e.toString());
//   // }
// } finally {
//   console.log("Gracefully shutting down...");
//   process.exit(0);
// }

// describe("Should handle immediate abort call", (): void => {
//   try {
//     abort("This should abort");
//   } catch (e) {
//     expect(e.toString()).toBe("abort: This should abort");
//   }
// });
class Vec3 {
  x: f32 = 0.0;
  y: f32 = 0.0;
  z: f32 = 0.0;
}

try {
  JSON.parse<Vec3>('{"x": 1,"y":2,"z":3}');
} catch (e) {
  console.log("Caught an Error: " + e.toString());
} finally {
  console.log("Finally.");
}
function describe(description: string, routine: () => void): void {
  routine();
}
describe("Should handle immediate abort call", (): void => {
  try {
    abort("This should abort");
  } catch (e) {
    console.log(e.toString());
    // expect(e.toString()).toBe("abort: This should abort");
  }
});
// namespace BAR {
//   export function bar(): void {
//     abort("Aborted from BAR.bar");
//   }
// }
// export function bar(): void {
//   abort("Aborted from bar");
// }
// try {
//   // foo();
//   // FOO.foo();
//   // bar();
//   BAR.bar();
//   console.log("This should not execute");
// } catch (e) {
//   console.log(e.toString());
// }

// function abortingFunction(): void {
//   abort("Aborted from abortingFunction");
// }

// function nestedAbortingFunction(): void {
//   try {
//     abortingFunction();
//   } catch (e) {
//     abort("Aborted from nestedAbortingFunction");
//   }
// }

// class Vec3 {

// }

// export function main(): void {
// try {
//   // FOO.foo();
//   expect("true").toBe("true");
// } catch (e) {
//   console.log("Caught Error: " + e.toString())
// }
// }
// main();
function bar(): void {
  abort("Aborted from bar");
}
