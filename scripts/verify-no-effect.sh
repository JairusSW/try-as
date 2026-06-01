#!/bin/bash
# Verifies that enabling try-as has NO EFFECT on functions called outside a
# try/catch block:
#   1. A try-free program produces identical output with and without the
#      transform (no behavioral change to normal code).
#   2. A throw reached outside any try/catch traps RAW — it is not swallowed by
#      try-as turning it into a Failures bump + return — even when the same
#      function is instrumented for use inside a try elsewhere.
set -uo pipefail

cd "$(dirname "$0")/.."
mkdir -p ./build/no-effect
DIR=./scripts/no-effect
WASI=./node_modules/@assemblyscript/wasi-shim/asconfig.json
fail=0

echo "== 1. try-free program: output identical with vs without try-as =="
npx asc "$DIR/compute.fixture.ts" -o ./build/no-effect/compute_off.wasm --config "$WASI" >/dev/null 2>&1 || { echo "  build (off) failed"; exit 1; }
npx asc "$DIR/compute.fixture.ts" --transform ./transform -o ./build/no-effect/compute_on.wasm --config "$WASI" >/dev/null 2>&1 || { echo "  build (on) failed"; exit 1; }
off=$(wasmtime ./build/no-effect/compute_off.wasm 2>&1)
on=$(wasmtime ./build/no-effect/compute_on.wasm 2>&1)
if [ "$off" == "$on" ]; then
  echo "  OK — identical output:"
  echo "$on" | sed 's/^/    /'
else
  echo "  MISMATCH:"
  diff <(echo "$off") <(echo "$on") | sed 's/^/    /'
  fail=1
fi

echo "== 2. throw outside try traps raw (not swallowed) =="
npx asc "$DIR/trap.fixture.ts" --transform ./transform -o ./build/no-effect/trap.wasm --config "$WASI" >/dev/null 2>&1 || { echo "  build failed"; exit 1; }
out=$(wasmtime ./build/no-effect/trap.wasm 2>&1)
code=$?
echo "$out" | sed 's/^/    /'
if echo "$out" | grep -q "VIOLATION"; then
  echo "  FAIL — outside-try throw was swallowed (execution continued)"
  fail=1
elif ! echo "$out" | grep -q "caught inside try"; then
  echo "  FAIL — try-as did not catch the throw inside the try"
  fail=1
elif [ "$code" -eq 0 ]; then
  echo "  FAIL — program exited 0; expected a trap on the outside-try throw"
  fail=1
else
  echo "  OK — caught inside the try, trapped on the outside-try call (exit $code)"
fi

if [ "$fail" -ne 0 ]; then
  echo "NO-EFFECT VERIFICATION FAILED"
  exit 1
fi
echo "NO-EFFECT VERIFICATION PASSED"
