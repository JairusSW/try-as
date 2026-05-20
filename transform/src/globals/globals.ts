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
}

export const Globals = new _Globals();
