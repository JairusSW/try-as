import { ImportStatement, Source } from "assemblyscript/dist/assemblyscript.js";
import { FunctionRef } from "./functionref.js";
import { TryRef } from "./tryref.js";

export class SourceRef {
  public source: Source;
  public tries: TryRef[] = [];
  public functions: FunctionRef[] = [];
  public imports: ImportStatement[] = [];
  public state: "ready" | "linking" | "done" = "ready";
  constructor(source: Source) {
    this.source = source;
  }
}