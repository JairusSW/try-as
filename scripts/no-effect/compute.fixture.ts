// No try/catch anywhere. Everything here is called outside any try/catch, so
// its output must be byte-for-byte identical whether or not try-as is enabled.
// verify-no-effect.sh compiles this with AND without the transform and diffs
// the program output.

function safeAdd(a: i32, b: i32): i32 {
  return a + b;
}

// can throw, but is only ever called with valid input below
function mayThrow(x: i32): i32 {
  if (x < 0) abort("negative");
  return x * 2;
}

function deep(): void {
  throw new Error("deep");
}
function mid(): void {
  deep();
}

function compute(): i32 {
  return safeAdd(mayThrow(3), mayThrow(4)); // 6 + 8 = 14
}

console.log(compute().toString());
console.log(mayThrow(10).toString()); // 20

// `mid`/`deep` exist and could throw, but are only reached on a false branch,
// so nothing throws — output is deterministic.
if (compute() < 0) mid();
console.log("done");
