import { FunctionRef } from "../types/functionref";
import { SourceRef } from "../types/sourceref";

class _Globals {
  public baseCWD = process.cwd();
  public sources: Map<string, SourceRef> = new Map();
  public callStack: Set<FunctionRef> = new Set();
  public foundException: boolean = false;
}

export const Globals = new _Globals();
