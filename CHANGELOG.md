# Change Log

## 2026-06-01 - v1.1.3

- fix: don't rename methods on classes that participate in inheritance — rewrite their throw/abort sites in place instead. try-as normally splits a throwing method `X` into an instrumented `__try_X` plus a same-named replacement carrying the original body. For a method reached through a virtual (vtable) call that breaks AS's override linkage: a subclass's override no longer aligns with the renamed base slot, so the virtual call dispatches to the wrong body. In json-as this showed up as a subclass serialized through a `Array<Base>` falling back to the base's field serializer (`[{"a":1}]` instead of the subclass's custom `["bar"]`), because the generated base `__SERIALIZE` (which throws, so it got renamed) no longer lined up with the subclass override. The gather pass now records every class on either side of an `extends` edge (`Globals.inheritanceClasses`), and `MethodRef.generate` treats those classes' methods like constructors/accessors (`cannotRename`): the body is instrumented in place, keeping the original name and its vtable slot, so overrides still dispatch correctly and throws are still caught. (`transform/src/globals/globals.ts`, `transform/src/passes/source.ts`, `transform/src/types/methodref.ts`) — This bug pre-dated the reset fix above but was masked in parallel runs by the cross-build state leak; with state correctly reset it became deterministic. Verified: json-as's full suite (10,557 tests) is green and `npm run test:no-effect` still passes.

## 2026-06-01 - v1.1.2

- fix: reset per-compilation state at the start of every `afterParse`. The transform module and its `Globals` singleton load once per process, but a single process can compile many modules back to back — `as-test` runs the AssemblyScript compiler in-process (`AS_TEST_BUILD_API=1`) inside a pool of long-lived build-worker processes that it reuses across every spec (one pool per mode). Without a reset, `Globals.sources`/`methods`/the ref stacks carried the previous build's already-generated ref graph into the next build; the second-and-later spec in a worker then resolved its throw/call sites to those stale refs, so its `throw`/`abort`s were never lowered to `__ErrorState` and fired as raw, uncatchable aborts (a `toThrow()` would see a wasm trap instead of a caught throw). `Globals.reset()` already existed for exactly this case but was never called — it now runs as the first statement of `afterParse`, before any analysis. This is general: it fixes any consumer that compiles multiple modules in one process, and also stops the cross-build AST retention that could OOM a reused worker on large inputs. (`transform/src/index.ts`) — Surfaced as json-as RFC-suite failures that only appeared under the full parallel run (a single-spec build compiles one module per worker and never leaks); after the fix the json-as RFC 8259 suite has zero throw-not-caught aborts across all three modes (naive/swar/simd).

## 2026-06-01 - v1.1.1

- fix: `expect((): void => { ... }).toThrow()` now catches exceptions thrown from functions the closure *calls* (including across a module boundary), not only literal `throw`/`abort`s written directly in the closure body ([#1](https://github.com/JairusSW/try-as/issues/1)). Two parts, both in `transform/src/passes/source.ts`: (1) the call gate now follows calls inside anonymous arrow bodies (`parentFn` set, `lastFn`/`lastTry` not), matching the existing throw-statement gate; (2) the root cause — `visitFunctionDeclaration` now walks every function-literal body in an *isolated* exception-stack scope. A function literal is a deferred value (its body runs only when later invoked), so exceptions found inside it attribute to that closure and can no longer smash the enclosing call's `CallRef`, which previously renamed the receiver to a never-generated `__try_<name>`. This is fully general — it applies to *any* higher-order call (`expect`, `describe`, or a user's own `withRetry(() => …)`), with no matcher name/shape special-casing — and library-under-test calls inside the closure (e.g. `JSON.parse(bad)` from a node_modules package) are followed and rewritten rather than left raw. Covers cross-module call chains, namespace + nested-namespace members, instance/static method dispatch, generics, generic methods, re-exports, and nested/stored closures.
- fix: an empty `catch {}` now consumes the exception. `TryRef.generate` only emitted the `shouldCatch` guard + `__ExceptionState.Failures--` when the catch body was non-empty, so `try { throws() } catch (e) {}` left the failure flagged and it leaked back out to the caller (and trapped). The catch lowering now fires whenever a catch clause is present, empty or not. (`transform/src/types/tryref.ts`)
- fix: calls into a *nested* namespace function (`A.B.fails()`) are now resolved and rewritten. Nested namespaces weren't registered under their parent, so `findLocalNs` couldn't walk past the first segment and the callee's throw/abort was left raw. (`transform/src/passes/source.ts`, `transform/src/types/namespaceref.ts`)
- fix: a throwing call passed as an *eager argument* to a clean (non-throwing) callee no longer dangles. `CallRef.generate` renamed a call site to `__try_<name>` from the call's own exception flag, but the `__try_` shadow is only generated when the *callee's* body throws — so `expect(JSON.parse(bad)).toBe(x)` (a throwing arg handed to a clean matcher at *expression* position, where there's no `isDefined` fallback) failed to compile with `Cannot find name '__try_expect'`. At expression position a clean callee now reverts to its original name; at statement position the existing `isDefined` guard already folds to the original. The throwing argument itself is still rewritten and the enclosing checkpoint catches the failure. (`transform/src/types/callref.ts`)
- fix: a throw mid-expression (a throwing call in an argument list or a variable initializer — `something(a, thisThrows())`, `const r = f(a, throws())`) now short-circuits the rest of its block instead of letting the following statements run with `__ExceptionState.Failures` already set. A throwing call in a non-statement slot has no statement `ref` of its own to anchor an unroll check to; the linker now tracks the enclosing block-level statement and `CallRef` anchors `if (Failures > 0) <breaker>` after it. Verified against the full json-as suite (10,563 tests) and its RFC 8259 conformance suite. (`transform/src/passes/source.ts`, `transform/src/globals/globals.ts`, `transform/src/types/callref.ts`)
- test: add `closure-throw.spec.ts` (+ `closure-throw-shapes.ts`) pinning the cross-module `toThrow` closure behavior, `call-pathing/call-pathing.spec.ts` — a 22-case matrix exercising every call shape the linker must follow from inside a closure, and `arg-throws.spec.ts` — throwing calls in every argument position plus mid-expression short-circuit
- test: add regressions to `regression-bugs.spec.ts` for the empty-catch swallow, nested-namespace, general deferred-closure (non-matcher higher-order), throwing-eager-arg-to-clean-callee, and mid-expression short-circuit fixes
- test: add `npm run test:no-effect` (`scripts/verify-no-effect.sh`) — proves enabling try-as has no behavioral effect on functions called outside a try/catch: a try-free program produces byte-identical output with and without the transform, and a throw reached outside any try traps RAW (it is not swallowed into a `Failures` bump + return) even when the same function is instrumented for use inside a try elsewhere. The dual-function model (the original function is preserved alongside its `__try_` shadow, and outside-try callers keep calling the original) is what guarantees this.

## 2026-05-20 - 1.1.0

- fix: skip `__try_<name>` rename for calls inside `inline.always(...)`, `inline.never(...)`, and `unchecked(...)` builtin args — AS was inlining the renamed body's leading unroll-check Statement into the builtin's expression slot and asserting in `compileCommaExpression` / `compileExpression`
- fix: skip rename + clone for `@inline`-decorated functions (including methods); AS substitutes their bodies at every call site, so the `__try_` shadow is unreachable and the rewrite caused inliner asserts when the call resolved to a non-CallExpression
- fix: skip rename for anonymous arrow callbacks (empty `name.text`); the AS AST builder asserts on `declaration.name.text.length == 0` during the DEBUG WRITE pass
- fix: skip rename + clone for constructors, getters, and setters (`MethodRef.cannotRename`); these slots can't carry a `__try_`-prefixed name
- fix: keep the `__try_<name>` rename when a throwing call sits in expression position (assignment, return, initializer); reverting it back to the original name (the previous behavior) routed the call to the un-instrumented function and trapped the wasm module on raw `abort()` / `throw`
- fix: linker now visits constructor `MethodDeclaration`s so their bodies get the same throw/abort rewrites as regular methods; without this, `new ThrowingCtor(...)` ran the raw constructor body and trapped
- fix: emit `return this;` (instead of a bare `return;`) for the in-body breaker of constructor exception sites — AS rejects bare `return` against the synthetic class-instance return type
- fix: `ThrowReplacer.matchesClass` now walks `classExtends` so a call to a method inherited (not overridden) from a base class resolves through the base's `MethodRef` and gets rewritten
- fix: don't crash on throws that have no attributable parent function or try (top-level / module-scope throws now walk through)
- fix: wrap generated catch bodies in `do { ... } while(false)` so the rewritten `break` lands at the catch boundary instead of returning from the enclosing function
- fix: route identifier-throws inside catch bodies through `ThrowReplacer`'s `isDefined(__try_rethrow / rethrow)` guard (new `Globals.inCatchBody` flag) instead of capturing them in `ExceptionRef`
- fix: stdlib + exception-ref location args (`lineNumber`, `columnNumber`) are now emitted as `i32` integer literals to match the updated `__ErrorState.error(error, fileName, lineNumber, columnNumber)` signature in `assembly/types/error.ts`
- fix: `AbortState.abort(msg, fileName, lineNumber, columnNumber)` accepts `i32` line/column (previously `string`) so user code calling the documented `abort(msg, file, line, col)` shape compiles after the transform; `Exception.rethrow` updated to match
- feat: detect consuming-project installs via `createRequire(<anchor>/package.json).resolve(spec)` instead of literal `node_modules/try-as/...` path probes; works across npm, yarn, and pnpm symlinked layouts without needing `--preserve-symlinks`
- feat: emit bare `try-as/assembly/types/...` specifiers when the consumer has try-as on its resolver path
- test: add `control-flow.spec.ts` covering loops (`while`/`for`/`do-while`), if/else/switch branches, sequential failure state hygiene, payload type mismatches via `is<T>()` / `as<T>()`, `clone()` of primitive payloads, and try-finally without catch
- test: add `edges.spec.ts` covering three-deep call chains, arrow-function callbacks, deep throw-from-catch nesting, generic instantiation, `as<T>()` defaults on non-Throw exceptions, payload preservation across rethrow, and the now-compiling `abort(msg, file, i32, i32)` location capture
- test: add `regression-bugs.spec.ts` pinning the six fixes above (expression-position rename, inherited methods, catch-finally interleaving, ctor throws, getter throws)
- chore: add husky pre-commit / commit-msg / pre-push hooks (mirrors json-as/as-test setup)
- chore: fix TS6 deprecations in `transform/tsconfig.json` (`ignoreDeprecations: "6.0"` + explicit `rootDir`)
- chore: clean stale `transform/lib` outputs

## 2026-03-11 - 1.0.1

- fix: rewrite `throw err` to `err.rethrow()` when `err` is statically typed as `Exception` (or an `Exception` subclass), while keeping the generic identifier fallback path for non-`Exception` values
- fix: preserve direct `Exception.rethrow()` runtime behavior while exposing it as `never` in the package type declarations for TS tooling
- test: add focused rethrow semantics coverage for typed locals, subclass inference, assertions, typed parameters, and direct `rethrow()` calls
- docs: document the new typed-`Exception` rethrow alias semantics in the README and architecture notes

## 2026-03-10 - 1.0.0

- release: promote the stabilized `0.2.6` feature set to `1.0.0`
- release: tighten published package contents to the public AssemblyScript API, built transform, and top-level docs
- fix: add explicit package exports for `try-as` and `try-as/transform`
- fix: replace stale `json-as` release script references with working `try-as` build commands
- fix: make release checks resilient to broken global npm cache permissions by using a local cache and an explicit package dry-run

## 2026-02-18 - 0.2.6

- feat: rewrite all `throw <expr>` forms (not just `throw new ...`) in both user and rewritten-stdlib sources, including primitive and identifier payloads
- feat: make method-call rewriting receiver-aware (class/static intent + scoped type hints) and eliminate double-evaluation ternary rewrites
- fix: preserve thrown payload metadata/discriminator when rethrowing caught `Exception` values via transformed `throw e` paths
- feat: resolve exception-aware calls through import aliases and multi-hop re-export chains, including generated `__try_` re-export propagation
- feat: add configurable transform modes (`TRY_AS_REWRITE_STDLIB`, `TRY_AS_IMPORT_SCOPE`, `TRY_AS_DIAGNOSTICS`) for stdlib rewriting and import injection scope
- test: expand recursive spec discovery, add nested/re-export/method regression suites, and run CI on a Node 20.x/22.x matrix with explicit transform build

## 2026-02-13 - 0.2.5

- fix: make `Exception.is<T>()` check the exception instance discriminator instead of shared global state
- fix: deep-copy exception payload storage in `Exception.clone()` to avoid stale/overwritten throw data
- fix: fully reset `ErrorState` metadata and flags (`fileName`, location, discriminator, message flags)
- fix: correct transform exception type source-path match (`assembly/types/exception.ts`)
- fix: remove stray `debugger` statements and throw-replacer debug logging
- feat: catch stdlib `throw new Error(...)` flows (e.g. `Map.get`) without touching runtime-internal trap paths (`~lib/rt`, `~lib/shared`, `~lib/wasi_`, `~lib/performance`)
- fix: retain managed thrown payloads safely in `ErrorState` / `Exception` to prevent GC-related traps when using `Exception.as<T>()`
- fix: standardize stdlib throw rewrite return handling using shared breaker logic (fixes narrow primitive return signatures like `i8` / `i16`)
- test: add coverage for thrown `Error` metadata, custom error type preservation, and clone stability across later throws
- test: add coverage for catching missing-key exceptions from stdlib `Map.get()`
- test: add coverage for additional stdlib throw sites (`Array.pop` empty, `String.at` out-of-range, malformed `decodeURIComponent`)

## 2025-07-02 - 0.2.4

- fix: make compatible with GC
- feat: add full cloning compatability

## 2025-07-02 - 0.2.3

- fix: resolve issues with rethrowing

## 2025-06-23 - 0.2.0

- feat: first feature-complete version of try-as
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
