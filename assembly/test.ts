// import { foo } from "./foo";

import { FOO, foo } from "./foo";
// import { JSON } from "json-as"

// function callFoo(): void {
//   foo();
//   console.log("this should never execute!");
// }

// function bar(): void {

// }
// function callCallFoo(): void {
//   callFoo();
//   console.log("this should never execute!");
// }
// try {
//   // Do something
//   // foo();
//   callFoo();
//   // callCallFoo();
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

class Vec3 {
  
}
try {
  foo()
} catch (e) {
  console.log("Caught Error: " + e.toString())
}