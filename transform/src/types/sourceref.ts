import { ExportStatement, ImportStatement, Source } from "assemblyscript/dist/assemblyscript.js";
import { FunctionRef } from "./functionref.js";
import { TryRef } from "./tryref.js";
import { BaseRef } from "./baseref.js";
import { SourceLinker } from "../passes/source.js";
import { indent } from "../globals/indent.js";

const rawValue = process.env["DEBUG"];
const DEBUG = rawValue === "true" ? 1 : rawValue === "false" || rawValue === "" ? 0 : isNaN(Number(rawValue)) ? 0 : Number(rawValue);

export class SourceLocalRef {
  public functions: FunctionRef[] = [];
  public imports: ImportStatement[] = [];
  public exports: ExportStatement[] = [];
}
export class SourceRef extends BaseRef {
  public node: Source;
  public tries: TryRef[] = [];
  public functions: FunctionRef[] = [];
  public imports: ImportStatement[] = [];
  public state: "ready" | "linking" | "done" = "ready";
  public dependencies: Set<SourceRef> = new Set<SourceRef>();

  public local: SourceLocalRef = new SourceLocalRef();

  private generated: boolean = false;
  constructor(source: Source) {
    super();
    this.node = source;
  }
  /**
   * Find a function by name in this source, or in external sources via imports.
   * @param name The name of the function to find.
   * @param realSource The desired source to search
   * @param visitedPaths A set of paths that have already been searched.
   * @returns The found FunctionRef or null.
   */
  findFn(name: string, realSource: Source | null, visitedPaths = new Set<string>()): FunctionRef | null {
    let self: SourceRef = this;

    if (realSource && realSource.internalPath != this.node.internalPath)
      self = SourceLinker.SS.sources.get(realSource.internalPath) || SourceLinker.SS.sources.get(realSource.internalPath + "/index");

    if (!self) return null;
    const currentPath = self.node.internalPath;
    if (!currentPath || visitedPaths.has(currentPath)) return null;
    visitedPaths.add(currentPath);

    let fnRef = self.functions.find((fn) => fn.name === name);
    if (fnRef) {
      if (DEBUG > 0) indent + `Identified ${name}() as exception`;
      return fnRef;
    }

    fnRef = self.local.functions.find((fn) => fn.name === name);
    if (fnRef) {
      if (DEBUG > 0) console.log(indent + `Found ${name} locally`);
      return fnRef;
    }

    const importMatch = self.local.imports.find((imp) => imp.declarations.some((decl) => name === decl.name.text || name.startsWith(decl.name.text + ".")));

    if (importMatch) {
      const basePath = importMatch.internalPath;
      let externSrc = SourceLinker.SS.sources.get(basePath) || SourceLinker.SS.sources.get(basePath + "/index");

      if (!externSrc) {
        throw new Error("Could not find " + basePath + " in sources!");
      }

      fnRef = externSrc.findFn(name, null, visitedPaths);
      if (fnRef) {
        if (DEBUG > 0) console.log(indent + `Found ${name} externally`);
        return fnRef;
      }

      const exported = externSrc.local.exports.find((exp) => {
        if (exp.members) {
          return exp.members.some((member) => name === member.exportedName.text || name.startsWith(member.exportedName.text + "."));
        } else {
          return true;
        }
      });

      if (exported) {
        const exportPath = exported.internalPath;
        const reexported = SourceLinker.SS.sources.get(exportPath) || SourceLinker.SS.sources.get(exportPath + "/index");
        if (reexported) {
          fnRef = reexported.findFn(name, null, visitedPaths);
          if (fnRef) {
            if (DEBUG > 0) console.log(indent + `Found ${name} exported externally`);
            return fnRef;
          }
        }
      }
    }

    console.log(indent + "Looked for " + name + " but could not locate in " + self.node.internalPath)
    return null;
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
