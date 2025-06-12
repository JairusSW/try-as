import { ImportStatement, Source } from "assemblyscript/dist/assemblyscript.js";
import { FunctionRef } from "./functionref.js";
import { TryRef } from "./tryref.js";

export class SourceLocalRef {
  public functions: FunctionRef[] = [];
  public imports: ImportStatement[] = [];
}
export class SourceRef {
  public node: Source;
  public tries: TryRef[] = [];
  public functions: FunctionRef[] = [];
  public imports: ImportStatement[] = [];
  public state: "ready" | "linking" | "done" = "ready";
  public dependencies: Set<SourceRef> = new Set<SourceRef>();

  public local: SourceLocalRef = new SourceLocalRef();
  constructor(source: Source) {
    this.node = source;
  }
  generate(): void {
    for (const fn of this.functions) {
      fn.generate();
    }
    for (const tryRef of this.tries) {
      tryRef.generate();
    }
    for (const dependency of this.dependencies) {
      dependency.generate();
    }
  }
}