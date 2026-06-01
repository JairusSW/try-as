import { CallExpression, Node } from "assemblyscript/dist/assemblyscript.js";
import { BaseRef } from "../types/baseref";
import { FunctionRef } from "../types/functionref";
import { MethodRef } from "../types/methodref";
import { SourceRef } from "../types/sourceref";
import { TryRef } from "../types/tryref";

class _Globals {
  public baseCWD = process.cwd();
  public sources: Map<string, SourceRef> = new Map();
  public callStack: Set<FunctionRef | MethodRef> = new Set();
  public refStack: Set<BaseRef> = new Set();
  public foundException: boolean = false;
  public lastTry: TryRef | null = null;
  public methods: MethodRef[] = [];
  public lastFn: FunctionRef | MethodRef | null = null;
  public parentFn: FunctionRef | MethodRef | null = null;
  // True while the linker is walking a catch body. Used so identifier-throw
  // statements inside catch fall through to ThrowReplacer (the isDefined
  // __try_rethrow/rethrow/throw guard) rather than being captured by
  // ExceptionRef and rewritten via __ErrorState.error.
  public inCatchBody: boolean = false;
  // True while the linker is walking the arg of an AS builtin like
  // `inline.always(callExpr)`, `inline.never(callExpr)`, or `unchecked(...)`.
  // Calls created in this scope MUST stay at their original name —
  // renaming to `__try_<name>` causes AS's inliner to drop the renamed
  // body's unroll-check statements into the builtin's expression slot,
  // which `compileExpression` / `compileCommaExpression` then asserts on.
  public inInlineBuiltinArg: boolean = false;
  // The `inline.always(...)` / `unchecked(...)` call expression (and its
  // container ref) currently being walked, so a throwing direct-argument call
  // can drop the builtin wrapper and call the `__try_` shadow normally instead
  // of inlining the raw (uncatchable) original. Null outside such a slot.
  public inlineBuiltinWrapper: { node: CallExpression; ref: Node | Node[] | null } | null = null;
  // Stack of statements currently being walked, innermost last, each paired
  // with the array that contains it. A throwing call nested in a non-statement
  // expression slot (a variable initializer, a method-chain receiver, a
  // function argument) has no statement-array `ref` of its own to anchor an
  // unroll check to, so it records the enclosing statement here. CallRef then
  // inserts `if (Failures > 0) <breaker>` AFTER that whole statement, so a
  // throw mid-expression short-circuits the rest of the block instead of
  // letting the following statements run with Failures already set.
  public stmtStack: { node: Node; container: Node[] }[] = [];

  // Reset all per-compilation state. The transform module (and this singleton)
  // is loaded ONCE per process, but a single process can compile many modules
  // back to back — e.g. as-test reuses a pooled build-worker process across
  // every spec. Without this, `sources`/`methods`/the stacks accumulate across
  // builds, retaining each prior build's full ref graph + AST (a memory leak
  // that OOM-crashes the worker on large inputs) and risking stale resolution.
  // Must run at the start of each afterParse, before any analysis. baseCWD is
  // intentionally left — afterParse sets it immediately after.
  reset(): void {
    this.sources = new Map();
    this.callStack = new Set();
    this.refStack = new Set();
    this.foundException = false;
    this.lastTry = null;
    this.methods = [];
    this.lastFn = null;
    this.parentFn = null;
    this.inCatchBody = false;
    this.inInlineBuiltinArg = false;
    this.inlineBuiltinWrapper = null;
    this.stmtStack = [];
  }
}

export const Globals = new _Globals();
