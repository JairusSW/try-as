import { FunctionRef } from "../types/functionref";
import { SourceRef } from "../types/sourceref";
import { TryRef } from "../types/tryref";

class _Globals {
  public baseCWD = process.cwd();
  public sources: Map<string, SourceRef> = new Map();
  public callStack: Set<FunctionRef> = new Set();
  public foundException: boolean = false;
  public lastTry: TryRef | null = null;
}

export const Globals = new _Globals();
