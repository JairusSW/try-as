# Change Log

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
