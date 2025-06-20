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
}

export const Globals = new _Globals();
