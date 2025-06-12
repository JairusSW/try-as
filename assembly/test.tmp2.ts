import {
  FOO,
  foo,
  __try_foo
} from "./foo";
import {
  ExceptionState as __ExceptionState,
  Exception as __Exception
} from "./types/exception";
class Vec3 {}
do {
  foo();
} while (false);
if (__ExceptionState.Failures > 0) {
  let e = new __Exception(__ExceptionState.Type);
  __ExceptionState.Failures--;
  console.log("Caught Error: " + e.toString());
}
function bar(): void {
  abort("Aborted from bar");
}
