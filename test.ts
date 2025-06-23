// class MyError extends Error {}
// try {
//   throw new MyError("throw from my error")
// } catch (e) {
//   if (e instanceof MyError) {
//     console.log("Caught MyError: " + e.message);
//   }
//   throw e
// } finally {
//   console.log("Finally.");
// }

console.log(new Error("message").toString());
