# Change Log

## 2025-06-23 - 0.2.0-preview.2

- feat: support try statements within exported entry functions
- fix: manage some side effects of global variables

## 2025-06-23 - 0.2.0-preview.1

- feat: attain full parity and complete implementation
- feat: add support for rethrowing Exceptions while saving state
- feat: add support for inferring types and scope flow for class types and their corrosponding methods

Example:
```js
function foo<T>(): void {
  if (idof<T>() == idof<...>) {
    const fakeInstance = changetype<nonnull<T>>(0);
    fakeInstance.methodThatThrows();
    // ^ Here the types need to be tracked and resolved with 100% certainty
    //   Even if the variable is reassigned, stored in memory, ect, it works in my testing
  } else {
    throw new Error("Id's of type T and " + nameof<...>() + " did not match!");
  }
}
```

- feat: add optimizations to limit the amount of calls the transform must do

## 2025-06-14 - 0.1.3

- merge: preview branch with master

## 2025-06-13 - 0.1.3-preview.3

- docs: add further example to README

## 2025-06-13 - 0.1.3-preview.2

- refactor: full rewrite

## 2025-05-27 - 0.1.1

- fix: add missing null check

## 2025-05-10 - 0.1.0

- Change package name from as-try to try-as

## 2025-05-10 - 0.1.0

### Added

- Initial proof of concept for exception-like control flow in AssemblyScript
- Support for `throw`, `try/catch`, and `unreachable` semantics
- Call stack unrolling to simulate exception propagation
- Handling for functions within namespaces and classes
- Import analysis pass to support linking across modules
- Real-world example using JSON and malformed input
- Global error state managed via transform
- `.toString()` method for custom `Error` type

### Fixed

- Proper resolution of `isLib` to boolean
- Use only exported imported functions
- Correct switching between `return` and `break` depending on control flow
- Filter and sort source files accurately
- Add unreachable blocks to sources if not imported
- Detect base exceptions and break as needed
- Compatibility fixes for transforms used in packages and generated code

### Changed

- Refactored function linking and source resolution logic
- Optimized branching structure and control flow analysis
- Cleaned up formatting and structure
- Improved test coverage for abort conditions and unreachable paths
