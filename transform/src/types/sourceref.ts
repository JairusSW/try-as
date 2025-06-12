import { ImportStatement, Source } from "assemblyscript/dist/assemblyscript.js";
import { FunctionRef } from "./functionref.js";
import { TryRef } from "./tryref.js";
import { BaseRef } from "./baseref.js";

export class SourceLocalRef {
  public functions: FunctionRef[] = [];
  public imports: ImportStatement[] = [];
}
export class SourceRef extends BaseRef {
  public node: Source;
  public tries: TryRef[] = [];
  public functions: FunctionRef[] = [];
  public imports: ImportStatement[] = [];
  public state: "ready" | "linking" | "done" = "ready";
  public dependencies: Set<SourceRef> = new Set<SourceRef>();

  public local: SourceLocalRef = new SourceLocalRef();

  private generated: boolean = false
  constructor(source: Source) {
    super();
    this.node = source;
  }
  generate(): void {
    if (this.generated) return;
    this.generated = true;

    for (const fn of this.functions) {
      fn.generate();
    }
    for (const dependency of this.dependencies) {
      dependency.generate();
    }
    for (const tryRef of this.tries) {
      tryRef.generate();
    }
  }
  update(ref: this): this {
    this.node = ref.node;
    this.tries = ref.tries;
    this.functions = ref.functions;
    this.imports = ref.imports;
    return this;
  }
}