import { foo } from "./foo";

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

try {
  nestedAbortingFunction();
} catch (e) {
  console.log(e.toString());
}

function abortingFunction(): void {
  abort("Aborted from abortingFunction");
}

function nestedAbortingFunction(): void {
  try {
    abortingFunction();
  } catch (e) {
    abort("Aborted from nestedAbortingFunction");
  }
}
