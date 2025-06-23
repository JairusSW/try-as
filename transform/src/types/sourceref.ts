import { ExportStatement, ImportStatement, Source } from "assemblyscript/dist/assemblyscript.js";
import { FunctionRef } from "./functionref.js";
import { TryRef } from "./tryref.js";
import { BaseRef } from "./baseref.js";
import { SourceLinker } from "../passes/source.js";
import { indent } from "../globals/indent.js";
import { Globals } from "../globals/globals.js";
import { NamespaceRef } from "./namespaceref.js";
import { ClassRef } from "./classref.js";
import { MethodRef } from "./methodref.js";

const rawValue = process.env["DEBUG"];
const DEBUG = rawValue == "true" ? 1 : rawValue == "false" || rawValue == "" ? 0 : isNaN(Number(rawValue)) ? 0 : Number(rawValue);

export class SourceLocalRef {
  public namespaces: NamespaceRef[] = [];
  public classes: ClassRef[] = [];
  public functions: FunctionRef[] = [];
  public imports: ImportStatement[] = [];
  public exports: ExportStatement[] = [];
}

export class SourceRef extends BaseRef {
  public linker: SourceLinker;
  public node: Source;
  public tries: TryRef[] = [];
  public functions: FunctionRef[] = [];
  public namespaces: NamespaceRef[] = [];
  public classes: ClassRef[] = [];
  public imports: ImportStatement[] = [];
  public state: "ready" | "linking" | "done" = "ready";
  public dependencies: Set<SourceRef> = new Set<SourceRef>();

  public local: SourceLocalRef = new SourceLocalRef();

  private generated: boolean = false;
  constructor(source: Source) {
    super();
    this.node = source;
    this.linker = new SourceLinker(this);
  }
  findLocalNs(qualifiedName: string | null, namespaces: NamespaceRef[] = this.local.namespaces, path: string[] = qualifiedName?.split(".") || []): NamespaceRef | null {
    if (!path.length) return null;
    if (path.length == 1) {
      for (const namespace of namespaces) {
        if (namespace.name == path[0]) return namespace;
      }
      return null;
    } else {
      for (const namespace of namespaces) {
        if (namespace.name != path[0]) continue;
        const found = this.findLocalNs(null, namespace.namespaces, path.slice(1));
        if (found) return found;
      }
      return null;
    }
  }
  findLocalFn(qualifiedName: string | null, functions: FunctionRef[] = this.local.functions, path: string[] = qualifiedName?.split(".") || []): FunctionRef | null {
    if (!path.length) return null;
    if (path.length == 1) {
      for (const fn of functions) {
        if (fn.name == path[0]) return fn;
      }
      return null;
    } else {
      const fnName = path.pop();
      const ns = this.findLocalNs(null, this.local.namespaces, path);
      if (!ns) return null;

      for (const fn of ns.functions) {
        if (fn.name == fnName) return fn;
      }
      return null;
    }
  }

  findLocalClass(qualifiedName: string | null, namespaces: NamespaceRef[] = this.local.namespaces, path: string[] = qualifiedName?.split(".") || []): ClassRef | null {
    if (!path.length) return null;

    if (path.length === 1) {
      for (const cls of this.local.classes) {
        if (cls.name === path[0]) return cls;
      }
      return null;
    } else {
      const className = path.pop();
      const ns = this.findLocalNs(null, namespaces, path);
      if (!ns || !className) return null;

      for (const cls of ns.classes) {
        if (cls.name === className) return cls;
      }

      return null;
    }
  }

  findLocalMethod(qualifiedName: string | null, namespaces: NamespaceRef[] = this.local.namespaces, path: string[] = qualifiedName?.split(".") || []): MethodRef | null {
    if (!path.length) return null;

    if (path.length === 2) {
      const [className, methodName] = path;

      for (const cls of this.local.classes) {
        if (cls.name !== className) continue;
        for (const method of cls.methods) {
          if (method.name === methodName) return method;
        }
      }

      return null;
    } else if (path.length > 2) {
      const methodName = path.pop();
      const classPath = path;
      const cls = this.findLocalClass(null, namespaces, classPath);

      if (cls && methodName) {
        for (const method of cls.methods) {
          if (method.name === methodName) return method;
        }
      }
    }

    return null;
  }

  findImportedFn(qualifiedName: string | null, visitedPaths = new Set<string>()): [FunctionRef | null, SourceRef | null] {
    if (!qualifiedName) return [null, null];

    for (const imp of this.local.imports) {
      const matchesImport = imp.declarations?.some((decl) => qualifiedName == decl.name.text || qualifiedName.startsWith(decl.name.text + "."));

      if (!matchesImport) continue;

      const basePath = imp.internalPath;
      if (visitedPaths.has(basePath)) continue;
      visitedPaths.add(basePath);

      const externSrc = Globals.sources.get(basePath) || Globals.sources.get(basePath + "/index");
      if (!externSrc) continue;

      const fn = externSrc.findLocalFn(qualifiedName);
      if (fn) return [fn, externSrc];
    }

    return [null, null];
  }

  findImportedNs(qualifiedName: string | null, visitedPaths = new Set<string>()): [NamespaceRef | null, SourceRef | null] {
    if (!qualifiedName) return [null, null];

    for (const imp of this.local.imports) {
      const matchesImport = imp.declarations?.some((decl) => qualifiedName == decl.name.text || qualifiedName.startsWith(decl.name.text + "."));

      if (!matchesImport) continue;

      const basePath = imp.internalPath;
      if (visitedPaths.has(basePath)) continue;
      visitedPaths.add(basePath);

      const externSrc = Globals.sources.get(basePath) || Globals.sources.get(basePath + "/index");
      if (!externSrc) continue;

      const ns = externSrc.findLocalNs(qualifiedName);
      if (ns) return [ns, externSrc];
    }

    return [null, null];
  }

  findImportedMethod(qualifiedName: string | null, visitedPaths = new Set<string>()): [MethodRef | null, SourceRef | null] {
    if (!qualifiedName) return [null, null];

    for (const imp of this.local.imports) {
      const matches = imp.declarations?.some((decl) => qualifiedName == decl.name.text || qualifiedName.startsWith(decl.name.text + "."));

      if (!matches) continue;

      const basePath = imp.internalPath;
      if (visitedPaths.has(basePath)) continue;
      visitedPaths.add(basePath);

      const externSrc = Globals.sources.get(basePath) || Globals.sources.get(basePath + "/index");
      if (!externSrc) continue;

      const method = externSrc.findLocalMethod(qualifiedName);
      if (method) return [method, externSrc];

      const exported = externSrc.local.exports.find((exp) => {
        if (exp.members) {
          return exp.members.some((member): boolean => qualifiedName == member.exportedName.text || qualifiedName.startsWith(member.exportedName.text + "."));
        }
        return false;
      });

      if (exported && exported.internalPath) {
        const exportPath = exported.internalPath;
        const reexported = Globals.sources.get(exportPath) || Globals.sources.get(exportPath + "/index");
        if (reexported) {
          const method = reexported.findLocalMethod(qualifiedName);
          if (method) return [method, reexported];
        }
      }
    }

    return [null, null];
  }

  findFn(name: string | null, visitedPaths = new Set<string>()): [FunctionRef | MethodRef | null, SourceRef | null] {
    if (!name) return [null, null];
    // console.log(indent + "Looking for " + name);

    const currentPath = this.node.internalPath;
    if (!currentPath || visitedPaths.has(currentPath)) return [null, null];
    visitedPaths.add(currentPath);

    let fnRef = this.findLocalFn(name);
    if (fnRef) {
      if (DEBUG > 0) console.log(indent + "Found function: " + fnRef.qualifiedName + " (local)");
      return [fnRef, this];
    }

    {
      const [externFn, externSrc] = this.findImportedFn(name, visitedPaths);
      if (externFn) {
        if (DEBUG > 0) console.log(indent + "Found imported function: " + externFn.qualifiedName + " (imported/" + externFn.hasException + ")");
        return [externFn, externSrc];
      }
    }

    return [null, null];
  }

  generate(): void {
    // if (!this.hasException) return;
    if (this.generated) return;
    this.generated = true;

    for (const fn of this.functions) {
      fn.generate();
    }
    for (const fn of this.namespaces) {
      fn.generate();
    }
    for (const cls of this.classes) {
      cls.generate();
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
