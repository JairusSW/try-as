// `boom` is used INSIDE a try (so try-as instruments it) AND called OUTSIDE any
// try. The outside-try call must behave exactly like raw AssemblyScript: trap.
// If try-as routed the outside-try call through the instrumented body, the
// abort would be swallowed (Failures set, function returns) and execution would
// continue past it — printing VIOLATION. verify-no-effect.sh asserts the
// program prints the "caught"/"about to" lines, then traps (non-zero exit),
// and never prints VIOLATION.

function boom(): void {
  abort("boom");
}

function useInTry(): bool {
  let caught = false;
  try {
    boom();
  } catch (e) {
    caught = true;
  }
  return caught;
}

if (!useInTry()) {
  console.log("FAIL: try did not catch");
  process.exit(1);
}
console.log("caught inside try");

console.log("about to call boom() outside try");
boom(); // must trap here
console.log("VIOLATION: execution continued after an uncaught throw");
