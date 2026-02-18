#!/bin/bash

set -euo pipefail

mkdir -p ./build

mapfile -t spec_files < <(find ./assembly/__tests__ -type f -name "*.spec.ts" ! -path "./assembly/__tests__/lib/*" | sort)

if [ "${#spec_files[@]}" -eq 0 ]; then
  echo "No test specs found"
  exit 1
fi

for file in "${spec_files[@]}"; do
  rel_path="${file#./assembly/__tests__/}"
  output="./build/${rel_path%.ts}.wasm"
  mkdir -p "$(dirname "$output")"

  start_time=$(date +%s%3N)
  DEBUG=0 WRITE="$file,./assembly/__tests__/imports.ts" npx asc "$file" --transform ./transform -o "$output" || { echo "Tests failed"; exit 1; }
  end_time=$(date +%s%3N)

  build_time=$((end_time - start_time))

  if [ "$build_time" -ge 60000 ]; then
    formatted_time="$(bc <<< "scale=2; $build_time/60000")m"
  elif [ "$build_time" -ge 1000 ]; then
    formatted_time="$(bc <<< "scale=2; $build_time/1000")s"
  else
    formatted_time="${build_time}ms"
  fi

  echo " -> $rel_path (built in $formatted_time)"
  wasmtime "$output" || { echo "Tests failed"; exit 1; }
done

echo "All tests passed"
