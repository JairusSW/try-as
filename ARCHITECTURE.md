# Architecture

This document explains how `try-as` turns AssemblyScript `try/catch/finally`, `throw`, `abort`, `unreachable`, and selected stdlib throws into catchable control flow without relying on native Wasm exception support.

## Design Goals

- Make transformed `throw`, `abort`, and `unreachable` catchable from AssemblyScript source.
- Preserve useful payload information, including primitive values, managed objects, and `Error` metadata.
- Propagate failures across normal function calls, methods, imports, and re-export chains.
- Keep the runtime small and push most complexity into a compile-time AST transform.
- Allow opt-in catch filtering with `// @try-as: ...`.

## Non-Goals

- Catching low-level Wasm traps such as out-of-bounds memory faults.
- Rewriting every internal AssemblyScript runtime path.
- Providing a general-purpose effect system or a replacement for native exceptions once Wasm EH is universally available.

## Package Shape

`try-as` is published as one npm package with two roles:

| Path | Role |
| --- | --- |
| `package.json` | Package metadata. `main` points to the Node-side transform entry. |
| `index.ts` | Root AssemblyScript export surface. Re-exports from `assembly/`. |
| `assembly/` | Runtime types and state holders used by transformed user code. |
| `transform/src/` | Transform source written in TypeScript against the AssemblyScript compiler AST. |
| `transform/lib/` | Built JavaScript version of the transform that `asc` loads. |
| `assembly/__tests__/` | End-to-end specs compiled with the transform and executed in Wasm. |

This dual packaging is important:

- `asc --transform try-as` loads the Node transform via `package.json.main`.
- `import { Exception } from "try-as"` resolves to the AssemblyScript runtime files via `exports["."]` and `types`.

## High-Level Flow

```text
AssemblyScript sources
  -> asc parses sources
  -> try-as afterParse hook runs
  -> source graph is analyzed from user entry files
  -> exception-capable refs are marked
  -> AST is rewritten in-place
  -> helper imports are injected
  -> asc continues to type-check and emit Wasm
```

At runtime, transformed code follows a simple state-machine model:

```text
exception site
  -> write shared exception state
  -> increment ExceptionState.Failures
  -> break/return out of the current rewritten scope
  -> nearest rewritten catch checks ExceptionState.shouldCatch(mask)
  -> catch reconstructs Exception from shared state
  -> finally executes
  -> if uncaught, outer rewritten callers see Failures > 0 and keep unwinding
```

## Transform Entry Point

The transform entry lives in `transform/src/index.ts` and subclasses AssemblyScript's `Transform`.

### `afterParse(parser)`

The transform runs after parsing and performs these steps in order:

1. Read environment-controlled options:
   - `TRY_AS_REWRITE_STDLIB`
   - `TRY_AS_IMPORT_SCOPE`
   - `TRY_AS_DIAGNOSTICS`
   - legacy debug helpers such as `DEBUG` and `WRITE`
2. Detect whether the transform is running from a local checkout or from `node_modules`.
3. Parse helper sources like `assembly/types/exception.ts` and `assembly/types/unreachable.ts` into the compilation if they are not already present.
4. Filter out internal sources that are intentionally unsupported:
   - `~lib/rt`
   - `~lib/shared`
   - `~lib/wasi_`
   - `~lib/performance`
5. Record the effective working directory in `Globals.baseCWD`.
6. Run `SourceLinker.link(...)` to analyze and rewrite the program.
7. Optionally run `StdlibThrowRewriter.rewrite(...)`.
8. Run `ThrowReplacer.replace(...)`.
9. Optionally dump transformed source snapshots when `WRITE=...` is set.

The ordering matters:

- `SourceLinker.link(...)` is the main analysis and generation pass.
- `StdlibThrowRewriter` converts stdlib `throw` statements into the same helper-state model.
- `ThrowReplacer` handles post-processing that depends on the generated shape, especially `rethrow` and method call targeting.

## Runtime Model

The AssemblyScript runtime side lives under `assembly/types/`.

### `ExceptionType`

`assembly/types/exception.ts` defines:

- `None`
- `Abort`
- `Throw`
- `Unreachable`

These values are also used to build bitmasks for selective catch handling.

### `ExceptionState`

`ExceptionState` is the shared global state used by transformed code:

- `Failures`: nesting-aware count of active transformed failures.
- `Type`: the current `ExceptionType`.
- `DefaultValue`: an 8-byte memory slot used by `Exception.as<T>()` as a fallback zero/default load.
- `shouldCatch(mask)`: checks whether the active failure kind is included in the catch mask.

This is the central propagation channel. There is no hidden stack object per `try`; transformed code cooperates through this shared state.

### `AbortState`

`assembly/types/abort.ts` stores:

- abort message
- file name
- line number
- column number

`AbortState.abort(...)` increments `ExceptionState.Failures`, sets `ExceptionState.Type = Abort`, and records metadata.

### `UnreachableState`

`assembly/types/unreachable.ts` is intentionally minimal:

- `unreachable()` increments `Failures`
- it sets `Type = Unreachable`

### `ErrorState`

`assembly/types/error.ts` is the most complex state holder because `throw` can carry many payload kinds.

It stores:

- error message, name, and stack when the payload is an `Error`
- file/line/column metadata
- `discriminator` describing the thrown payload type
- `storage`, an 8-byte slot holding the raw thrown value
- `managed`, a retained managed reference when needed
- flags telling the runtime whether the payload behaved like `Error` or had a meaningful string form

`ErrorState.error<T>(value, file, line, column)`:

- increments `Failures`
- sets `Type = Throw`
- records source metadata
- computes a payload discriminator
- stores the raw value
- captures managed references for GC visibility
- fills message/name/stack when the payload is an `Error`
- falls back to `toString()` when available

### `Exception`

`Exception` is the object a transformed `catch` receives.

Important behavior:

- The constructor snapshots the active global state into instance fields.
- `is<T>()` compares the stored discriminator.
- `as<T>()` returns the stored value if the discriminator matches, otherwise it returns a default value via `ExceptionState.DefaultValue`.
- `clone()` deep-copies the 8-byte payload storage buffer.
- `rethrow()` always uses its runtime method body; for `Throw`, that degrades to `abort(message, ...)`.
- `__try_rethrow()` writes the exception back into shared state so transformed rethrows preserve the active failure.
- `__visit(...)` keeps managed payloads visible to the GC when needed.

## Transform-Wide State

`transform/src/globals/globals.ts` defines a singleton `Globals` used during one compilation:

- `sources`: map of parsed source path to `SourceRef`
- `callStack`: active call chain during analysis
- `refStack`: active nested refs being explored
- `foundException`: flag used while propagating exception capability
- `lastTry`: current `TryRef`
- `lastFn` and `parentFn`: current function/method context
- `methods`: all discovered methods, used later by `ThrowReplacer`

This singleton is what allows independent visitors and ref objects to coordinate.

## Core Reference Graph

The main analysis does not work directly on raw AST nodes alone. It first builds a graph of reference objects.

| Ref type | Purpose |
| --- | --- |
| `SourceRef` | Owns per-file state, local symbols, dependency links, and generated refs. |
| `SourceLocalRef` | Stores local namespaces, classes, functions, imports, and exports discovered during gather. |
| `FunctionRef` | Tracks a function, its callers, nested `try` blocks, and direct/indirect exception sites. |
| `MethodRef` | Same as `FunctionRef`, but scoped to a `ClassRef`. |
| `TryRef` | Represents one `try/catch/finally` region and generates the lowered control flow. |
| `CallRef` | Represents a call to an exception-capable function or method. |
| `ExceptionRef` | Represents a direct `throw`, `abort`, or `unreachable` site. |
| `NamespaceRef` | Tracks nested namespace structure. |
| `ClassRef` | Tracks classes and their methods. |
| `BaseRef` | Shared base with `hasException` and `visited` flags. |

The key idea is that the transform separates discovery from generation:

- discovery builds this graph
- linking marks the nodes that participate in exception flow
- generation mutates only the marked nodes

## Main Analysis Pass: `SourceLinker`

`transform/src/passes/source.ts` is the heart of the transform.

### Phase 1: Gather

`SourceLinker.gather()` walks a source once to collect structure:

- imports and exports
- namespaces
- classes
- methods
- functions
- entry functions in `SourceKind.UserEntry` sources

During this phase it also:

- records file dependencies
- recursively gathers imported sources
- normalizes `if` branches into blocks so later code insertion is simpler

No rewriting happens yet. The goal is to index the program.

### Phase 2: Link

`SourceLinker.link(true)` starts from each user entry source and discovers exception flow.

It does this by visiting:

- `CallExpression`
- `ThrowStatement`
- `TryStatement`

Key behaviors:

- Direct `abort()` and `unreachable()` calls create `ExceptionRef`s immediately.
- `throw` statements create `ExceptionRef`s.
- Function and method calls resolve through `SourceRef.findFn(...)`, which can walk local declarations, imports, aliases, and re-export chains.
- Nested `try` blocks create `TryRef`s attached either to the surrounding function/method or to the source itself.

When an exception-capable path is found, `smashStack()` marks every currently active ref on `Globals.refStack` and every active caller on `Globals.callStack` as `hasException = true`.

That propagation step is why a deeply nested `abort()` causes:

- the direct site to be rewritten
- its containing function or method to be rewritten
- each caller on the active analysis path to gain the same rewritten propagation behavior

### Phase 3: Generate

Once marked refs are known, `generate()` is called starting from each entry `SourceRef`.

Generation is distributed across ref types:

- `SourceRef.generate()` drives file-level output
- `FunctionRef.generate()` rewrites functions
- `MethodRef.generate()` rewrites methods
- `CallRef.generate()` rewrites calls
- `ExceptionRef.generate()` rewrites direct exception sites
- `TryRef.generate()` lowers `try/catch/finally`
- `NamespaceRef.generate()` and `ClassRef.generate()` recurse into contained items

After generation, `SourceLinker`:

- repeatedly adds `__try_*` re-exports until stable
- injects helper imports into user sources, or into all sources if configured

## AST Rewrite Strategy

### Direct Exception Sites

`ExceptionRef.generate()` converts direct exception-producing syntax into helper-state writes.

#### `abort(...)`

Conceptually:

```ts
abort("boom");
```

becomes:

```ts
__AbortState.abort("boom");
return;
```

or:

```ts
__AbortState.abort("boom");
break;
```

depending on whether the transform is currently inside a rewritten `try` loop or a function body.

#### `unreachable()`

Conceptually:

```ts
unreachable();
```

becomes:

```ts
__UnreachableState.unreachable();
return;
```

or `break`, for the same reason.

#### `throw value`

Conceptually:

```ts
throw value;
```

becomes:

```ts
__ErrorState.error(value, "file.ts", "12", "8");
return;
```

or `break`.

The inserted breaker comes from `getBreaker(...)` in `transform/src/utils.ts`.

### Generated Breakers

`getBreaker(...)` synthesizes the right early-exit node for the surrounding context:

- `break` when escaping the `do { ... } while(false)` generated for a `try`
- `return` for `void`
- `return false` for `bool`
- `return 0` for integer and float types
- `return changetype<T>(0)` for managed/reference types
- plain `return` as the final fallback

This is how the transform unwinds control flow without native exception support.

### Function Rewrites

`FunctionRef.generate()` rewrites every marked function.

It performs these steps:

1. Clone the original body before mutation.
2. Prepend an "unroll" check:

```ts
if (__ExceptionState.Failures > 0) {
  return defaultValue;
}
```

3. Rewrite direct exception sites in the body.
4. Rewrite outgoing calls to exception-capable callees.
5. Lower nested `try` blocks.
6. If the function has no local `try`, rename the transformed implementation to `__try_<name>` and append a sibling function with the original name and original body.

That last step is the key internal/external split:

- transformed callers are redirected to `__try_*`
- the original symbol name remains available for untouched callers and exports

Functions that contain a local `try` are not renamed, because the catch logic must stay on the function's public entry path.

### Method Rewrites

`MethodRef.generate()` follows the same pattern as `FunctionRef.generate()`:

- prepend unroll check
- rewrite direct exception sites
- rewrite outgoing calls
- lower nested `try`
- rename to `__try_*` only when the method itself has no local `try`

There is no import generation step for methods, but method calls still need careful target resolution. That is handled later by `ThrowReplacer`.

### Call-Site Rewrites

`CallRef.generate()` updates calls to exception-capable functions or methods.

Conceptually:

```ts
work();
```

becomes:

```ts
__try_work();
if (__ExceptionState.Failures > 0) {
  return defaultValue;
}
```

The post-call check is only inserted when the call sits in statement position. If the call occurs in an expression, the transform rewrites the callee name but cannot always inject a trailing statement in the same way.

### `try/catch/finally` Lowering

`TryRef.generate()` turns one structured `try` into explicit control flow.

Conceptually, this:

```ts
try {
  stepA();
  stepB();
} catch (e) {
  handle(e as Exception);
} finally {
  cleanup();
}
```

becomes code shaped like:

```ts
do {
  __try_stepA();
  if (__ExceptionState.Failures > 0) break;

  __try_stepB();
  if (__ExceptionState.Failures > 0) break;
} while (false);

if (__ExceptionState.shouldCatch(<i32>14)) {
  let e = new __Exception(__ExceptionState.Type);
  __ExceptionState.Failures--;
  handle(e as Exception);
}

{
  cleanup();
}
```

Important details:

- The `do { ... } while(false)` wrapper gives the transform a place to `break`.
- The catch variable is initialized with `new __Exception(__ExceptionState.Type)`.
- `Failures` is decremented only when the generated catch actually handles the failure.
- `finally` is emitted as a trailing block and therefore runs whether or not the catch matches.

### Selective Catch

Selective catch is implemented in `TryRef.resolveCatchMask()`.

The transform looks at the line immediately above the `try` for an exact directive:

```ts
// @try-as: throw,abort
try {
  ...
} catch (e) {
  ...
}
```

Supported catch kinds:

- `throw`
- `abort`
- `unreachable`

The directive is converted into a bitmask and passed to `ExceptionState.shouldCatch(mask)`.

If no directive is present, the default mask catches all three transformed failure kinds.

## Import, Export, and Re-Export Resolution

Cross-file propagation is handled by `SourceRef`.

### Imports

`SourceRef.findImportedFn(...)`, `findImportedMethod(...)`, and `findImportedNs(...)`:

- check local import bindings
- remap local aliases back to foreign names
- locate the referenced source
- continue resolving through re-export chains

This is what allows a failure in one file to mark callers in another file.

### Re-Exports

After generation, `SourceLinker.addTryReexports(...)` repeatedly scans export statements and adds missing `__try_*` export members when the target source exports them.

That fixed-point loop is why re-export chains continue to work after internal symbol renaming.

The tests under `assembly/__tests__/reexports*.ts` cover these cases.

## Post-Processing Passes

### `StdlibThrowRewriter`

`transform/src/passes/stdlib.ts` rewrites eligible stdlib `throw` statements inside `~lib/*` sources.

It intentionally skips:

- `~lib/rt`
- `~lib/performance`
- `~lib/wasi_`
- `~lib/shared/`
- `~lib/try-as/`

For eligible stdlib functions and methods, it converts:

```ts
throw new Error("x");
```

into the same `__ErrorState.error(...) + breaker` pattern used for user code.

Constructor methods are skipped.

This pass is controlled by `TRY_AS_REWRITE_STDLIB`.

### `ThrowReplacer`

`transform/src/passes/replacer.ts` handles rewrites that are easier once the main graph has been generated.

It does two important jobs.

#### 1. `rethrow` semantics

Direct method calls named `rethrow` are left alone, so `Exception.rethrow()` keeps its runtime behavior.

Identifier throws are split into two cases.

If the thrown identifier is statically typed as `Exception` or an `Exception` subclass, the transform lowers:

```ts
throw err;
```

directly to:

```ts
err.rethrow();
```

For all other identifier throws, the transform keeps the guarded fallback path.

That fallback rewrites identifier throws of the form:

```ts
throw e;
```

into a guarded form:

```ts
if (isDefined(e.__try_rethrow)) {
  e.__try_rethrow();
} else if (isDefined(e.rethrow)) {
  e.rethrow();
} else {
  throw e;
}
```

This keeps explicit `Exception` rethrows on the runtime path while still supporting custom identifier rethrow helpers for non-`Exception` values.

#### 2. Method target selection

Method rewriting is trickier than free functions because different classes can share the same method name.

`ThrowReplacer`:

- indexes marked methods by `name/arity`
- tracks a scope stack of variable type hints
- tracks the current class
- distinguishes static vs instance calls
- infers receiver type from `this`, `new`, assertions, parenthesized expressions, and locally typed identifiers

If it can resolve a unique marked method target, it rewrites:

```ts
obj.fail();
```

to:

```ts
obj.__try_fail();
```

If the target is ambiguous, it leaves the call alone rather than guessing.

The tests in `assembly/__tests__/method-rewrite.spec.ts` validate this behavior.

## Helper Import Injection

After generation, `SourceLinker.addImports(...)` injects aliased imports for:

- `AbortState` as `__AbortState`
- `UnreachableState` as `__UnreachableState`
- `ErrorState` as `__ErrorState`
- `Exception` as `__Exception`
- `ExceptionState` as `__ExceptionState`

The relative path is computed from the current source to `assembly/types/`.

`TRY_AS_IMPORT_SCOPE` controls where these imports are injected:

- `all` injects into every eligible source
- `user` limits injection to `SourceKind.User` and `SourceKind.UserEntry`

## Representative End-to-End Example

Source:

```ts
function inner(): void {
  abort("boom");
}

export function run(): void {
  try {
    inner();
  } catch (e) {
    trace((e as Exception).toString());
  }
}
```

Conceptual transformed shape:

```ts
function __try_inner(): void {
  if (__ExceptionState.Failures > 0) return;
  __AbortState.abort("boom");
  return;
}

function inner(): void {
  abort("boom");
}

export function run(): void {
  if (__ExceptionState.Failures > 0) return;

  do {
    __try_inner();
    if (__ExceptionState.Failures > 0) break;
  } while (false);

  if (__ExceptionState.shouldCatch(<i32>14)) {
    let e = new __Exception(__ExceptionState.Type);
    __ExceptionState.Failures--;
    trace((e as Exception).toString());
  }
}
```

The emitted AST is not exactly this text, but this example captures the architecture:

- direct failures become state writes
- callers propagate via generated early returns
- `try` boundaries become explicit loops and catch checks

## Diagnostics and Developer Controls

The codebase currently uses several environment variables:

- `TRY_AS_REWRITE_STDLIB=0` disables stdlib rewriting.
- `TRY_AS_IMPORT_SCOPE=user` restricts helper import injection to user sources.
- `TRY_AS_DIAGNOSTICS=1` prints the active transform mode.
- `DEBUG=1` or higher enables verbose internal logging in several passes.
- `WRITE=pathA,pathB` writes selected transformed sources as `*.tmp.ts` snapshots.

These are intentionally low-level and aimed at contributors debugging the transform.

## Test Strategy

`run-tests.sh` is the primary integration harness.

For each `assembly/__tests__/**/*.spec.ts` file it:

1. compiles the spec with `npx asc ... --transform ./transform`
2. writes optional debug snapshots
3. runs the resulting Wasm with `wasmtime`

The current test suite covers:

- direct `abort` handling
- nested propagation
- `finally`
- thrown primitives and managed objects
- `Exception.is<T>()` and `Exception.as<T>()`
- selective catch masks
- import/re-export chains
- method resolution and receiver evaluation
- selected stdlib throw sites

## Known Boundaries

The architecture intentionally stops at a few boundaries:

- Internal runtime sources such as `~lib/rt` are excluded from rewriting.
- Native traps are not catchable through this model.
- Selective catch only works with the exact `// @try-as: ...` syntax on the line immediately above the `try`.
- Method target resolution is heuristic and syntax-driven; ambiguous cases are left untouched.
- The runtime model is based on shared mutable state, so the transform assumes the normal single-threaded AssemblyScript execution model.

## Mental Model Summary

The simplest way to think about `try-as` is:

- at compile time, it builds a graph of code that can participate in transformed failures
- it rewrites those paths into explicit state updates and early exits
- it turns each `try` into a structured catch checkpoint
- at runtime, `Exception` is just a snapshot view over shared failure state

Everything else in the codebase exists to make that work across files, methods, re-exports, and a useful subset of stdlib behavior.
