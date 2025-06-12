import { CallExpression, ClassDeclaration, FunctionDeclaration, ImportDeclaration, ImportStatement, NamespaceDeclaration, Node, Source, SourceKind } from "assemblyscript/dist/assemblyscript.js";
import { SourceRef } from "../types/sourceref.js";
import { Visitor } from "../lib/visitor.js";
import { indent } from "../globals/indent.js";
import { FunctionRef } from "../types/functionref.js";
import { getFnName } from "../utils.js";
import { ExceptionRef } from "../types/exceptionref.js";
import { CallRef } from "../types/callref.js";
import { CommonFlags } from "types:assemblyscript/src/common";
import { ThrowStatement, TryStatement } from "types:assemblyscript/src/ast";
import { TryRef } from "../types/tryref.js";
import { fileURLToPath } from "url";
import { Globals } from "../globals/globals.js";
import path from "path";
import fs from "fs";

class SourceState {
  public sources: Map<string, SourceRef> = new Map();
}

export class SourceLinker extends Visitor {
  static SS: SourceState = new SourceState();

  public node: Source;
  public name: string;
  public state: "ready" | "gather" | "stack" | "link" | "done" = "ready";
  public source: SourceRef;

  public path: string[] = [];
  public lastFn: FunctionRef | null = null;
  public lastTry: TryRef | null = null;
  public parentFn: FunctionRef | null = null;
  public entryFn: FunctionRef | null = null;

  public callStack: Set<FunctionRef> = new Set();
  public foundException: boolean = false;

  visitImportStatement(node: ImportStatement, ref: Node | Node[] | null = null): void {
    if (this.state != "gather") return super.visitImportStatement(node, ref);
    if (node.internalPath.startsWith("~lib/rt") || node.internalPath.startsWith("~lib/performance") || node.internalPath.startsWith("~lib/wasi_") || node.internalPath.startsWith("~lib/shared/")) return super.visitImportStatement(node, ref);
    this.source.local.imports.push(node);
    const targetSourceRef = SourceLinker.SS.sources.get(node.internalPath) || SourceLinker.SS.sources.get(node.internalPath + "/index");
    if (!targetSourceRef) throw new Error("Could not find " + node.internalPath + " in sources!");
    if (targetSourceRef.state != "ready") return super.visitImportStatement(node, ref);
    if (node.internalPath == node.range.source.internalPath) return super.visitImportStatement(node, ref);
    console.log(indent + node.range.source.internalPath + " -> " + targetSourceRef.node.internalPath);

    this.source.dependencies.add(targetSourceRef);
    const newLinker = new SourceLinker();
    newLinker.link(targetSourceRef.node);
  }

  visitFunctionDeclaration(node: FunctionDeclaration, isDefault: boolean = false, ref: Node | Node[] | null = null): void {
    if (this.state == "gather") {
      const fnRef = new FunctionRef(node, ref, this.path.slice());
      this.source.local.functions.push(fnRef);
    } else if (this.state == "link") {
      if (node.range.source.sourceKind == SourceKind.UserEntry && (node.flags & CommonFlags.Export)) {
        const fnRef = this.source.local.functions.find((v) => v.name == node.name.text);
        this.source.functions.push(fnRef);

        const lastFn = this.lastFn;
        this.lastFn = fnRef;
        this.parentFn = fnRef;
        super.visitFunctionDeclaration(node, isDefault, ref);
        this.parentFn = null;
        this.lastFn = lastFn
        return;
      }
    }
    this.parentFn = this.source.local.functions.find((v) => v.name == node.name.text);
    super.visitFunctionDeclaration(node, isDefault, ref);
    this.parentFn = null;
  }
  linkFunctionRef(fnRef: FunctionRef): void {
    if (!fnRef) return;
    if (this.source.functions.some((v) => v.name == fnRef.name)) return;
    indent.add();
    this.callStack.add(fnRef);
    console.log(indent + "Stack [" + Array.from(this.callStack.values()).map(v => v.name).join(", ") + "]")
    const lastFn = this.lastFn;
    this.lastFn = fnRef;
    this.parentFn = fnRef;
    super.visitFunctionDeclaration(fnRef.node, false, fnRef.ref);
    this.parentFn = null;
    this.lastFn = lastFn;

    if (this.foundException) {
      for (const fn of this.callStack.values()) {
        fn.hasException = true;
        if (fn.node.range.source.internalPath != this.source.node.internalPath) {
          const alienSrc = SourceLinker.SS.sources.get(fn.node.range.source.internalPath);
          if (!alienSrc.functions.some(v => v == fn)) {
            console.log(indent + "Added function (fn): " + fn.name);
            alienSrc.functions.push(fn);
          }
        } else {
          if (!this.source.functions.some(v => v == fn)) {
            console.log(indent + "Added function (fn): " + fn.name);
            this.source.functions.push(fn);
          }
        }
      }
      this.callStack.clear();
      this.foundException = false;
    } else {
      this.callStack.delete(fnRef);
    }
    indent.rm();
  }

  visitCallExpression(node: CallExpression, ref: Node | Node[] | null = null): void {
    if (this.state != "link") return super.visitCallExpression(node, ref);
    if (!this.lastTry) return super.visitCallExpression(node, ref);

    const fnName = getFnName(node.expression);
    if (fnName == "unreachable" || fnName == "abort") {
      console.log(indent + "Found exception " + fnName);
      this.foundException = true;
      const newException = new ExceptionRef(node, ref);
      newException.parentFn = this.parentFn;
      this.lastFn?.exceptions.push(newException);
      return super.visitCallExpression(node, ref);
    }

    let fnRef = this.source.functions.find((v) => v.name == fnName);
    if (fnRef) {
      console.log(indent + "Identified " + fnName + "() as exception");
      this.foundException = true;
    } else {
      fnRef = this.source.local.functions.find((v) => v.name == fnName);
      if (fnRef) {
        console.log(indent + "Found " + fnName + " locally");
      } else {
        const externDec = this.source.local.imports.find((a) =>
          a.declarations.find((b) =>
            fnName == b.name.text || fnName.startsWith(b.name.text + ".")
          )
        );
        if (externDec) {
          // console.log(indent + "Looking for " + targetName + " in " + externDec.internalPath);
          const externSrc = SourceLinker.SS.sources.get(externDec.internalPath) || SourceLinker.SS.sources.get(externDec.internalPath + "/index");
          if (!externSrc) throw new Error("Could not find " + externDec.internalPath + " in sources!");
          fnRef = externSrc.functions.find((v) => v.name == fnName || fnName.startsWith(v.name + ".")) || externSrc.local.functions.find((v) => v.name == fnName || fnName.startsWith(v.name + "."));
          if (fnRef) console.log(indent + "Found " + fnName + " externally");
        } else {
          // console.log(indent + "Could not find " + targetName);
        }
      }
    }
    if (!fnRef) return super.visitCallExpression(node, ref);

    const callRef = new CallRef(node, ref, fnRef);
    fnRef.callers.push(callRef);
    callRef.parentFn = this.parentFn;

    if (this.foundException) {
      for (const fn of this.callStack.values()) {
        fn.hasException = true;
        if (fn.node.range.source.internalPath != this.source.node.internalPath) {
          const alienSrc = SourceLinker.SS.sources.get(fn.node.range.source.internalPath);
          if (!alienSrc.functions.some(v => v == fn)) {
            console.log(indent + "Added function (call): " + fn.name);
            alienSrc.functions.push(fn);
          }
        } else {
          if (!this.source.functions.some(v => v == fn)) {
            console.log(indent + "Added function (call): " + fn.name);
            this.source.functions.push(fn);
          }
        }
      }
      this.callStack.clear();
      this.foundException = false;
    }

    this.linkFunctionRef(fnRef);
    super.visitCallExpression(node, ref);

    if (fnRef.hasException) this.lastFn?.exceptions.push(callRef);
  }

  visitThrowStatement(node: ThrowStatement, ref: Node | Node[] | null = null): void {
    const newException = new ExceptionRef(node, ref);
    newException.parentFn = this.parentFn;
    this.lastFn?.exceptions.push(newException);
    return super.visitThrowStatement(node, ref);
  }

  visitTryStatement(node: TryStatement, ref: Node | Node[] | null = null): void {
    if (this.lastFn) {
      const tryRef = new TryRef(node, ref);
      this.lastFn.tries.push(tryRef);
      const lastTry = this.lastTry;
      this.lastTry = tryRef;
      super.visitTryStatement(node, ref);
      this.lastTry = lastTry;
      return;
    }

    if (this.state != "link") return super.visitTryStatement(node, ref);

    const tryRef = new TryRef(node, ref);
    (this.lastTry ? this.lastTry.tries : this.source.tries).push(tryRef);

    const lastTry = this.lastTry;
    this.lastTry = tryRef;

    const parentFn = this.parentFn;
    this.parentFn = null;
    this.visit(node.bodyStatements, node);
    this.parentFn = parentFn;
    this.visit(node.catchVariable, node);
    this.visit(node.catchStatements, node);
    this.visit(node.finallyStatements, node);

    this.lastTry = lastTry;
  }

  visitNamespaceDeclaration(node: NamespaceDeclaration, isDefault: boolean = false, ref: Node | Node[] | null = null): void {
    this.path.push(node.name.text);
    super.visitNamespaceDeclaration(node, isDefault, ref);
    const index = this.path.lastIndexOf(node.name.text);
    if (index !== -1) {
      this.path.splice(index, 1);
    }
  }
  visitClassDeclaration(node: ClassDeclaration, isDefault: boolean = false, ref: Node | Node[] | null = null): void {
    super.visit(node.name, node);
    super.visit(node.decorators, node);
    if (node.isGeneric ? node.typeParameters != null : node.typeParameters == null) {
      super.visit(node.typeParameters, node);
      super.visit(node.extendsType, node);
      super.visit(node.implementsTypes, node);
      this.path.push(node.name.text);
      this.visit(node.members, node);
      const index = this.path.lastIndexOf(node.name.text);
      if (index !== -1) {
        this.path.splice(index, 1);
      }
    } else {
      throw new Error("Expected to type parameters to match class declaration, but found type mismatch instead!");
    }
  }

  link(source: Source): void {
    if (this.state != "ready") return;
    indent.add();

    this.source = SourceLinker.SS.sources.get(source.internalPath)!;
    this.source.state = "linking";
    this.state = "gather";
    console.log(indent + "Gathering " + source.internalPath);
    super.visit(source);

    // this.state = "stack";
    // console.log(indent + "Stacking " + source.internalPath);
    // super.visit(source);

    this.state = "link";
    console.log(indent + "Linking " + source.internalPath);
    super.visit(source);

    console.log(indent + "Done linking " + source.internalPath);
    this.state = "done";
    this.source.state = "done";
    indent.rm();
    this.addImports(source);
  }

  addImports(node: Source): void {
    const baseDir = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
    // console.log("Base Dir: " + baseDir);
    const pkgPath = path.join(Globals.baseCWD, "node_modules");
    const isLibrary = fs.existsSync(path.join(pkgPath, "try-as"));
    let fromPath = node.range.source.normalizedPath;

    fromPath = fromPath.startsWith("~lib/") ? (fs.existsSync(path.join(pkgPath, fromPath.slice(5, fromPath.indexOf("/", 5)))) ? path.join(pkgPath, fromPath.slice(5)) : fromPath) : path.join(Globals.baseCWD, fromPath);

    let relDir = path.posix.join(...path.relative(path.dirname(fromPath), path.join(baseDir, "assembly", "types")).split(path.sep));

    if (relDir.includes("node_modules" + path.sep + "try-as")) {
      relDir = "try-as" + relDir.slice(relDir.indexOf("node_modules" + path.sep + "try-as") + 19);
    } else if (!relDir.startsWith(".") && !relDir.startsWith("/") && !relDir.startsWith("try-as")) {
      relDir = "./" + relDir;
    }

    const addImport = (file: string, names: string[]) => {
      const imps: ImportDeclaration[] = [];

      for (const name of names) {
        const imp = Node.createImportDeclaration(Node.createIdentifierExpression(name, node.range), Node.createIdentifierExpression("__" + name, node.range), node.range);

        imps.push(imp);
      }

      const stmt = Node.createImportStatement(imps, Node.createStringLiteralExpression(relDir + "/" + file, node.range), node.range);
      node.range.source.statements.unshift(stmt);
    };

    addImport("exception", ["Exception", "ExceptionState"]);
    addImport("abort", ["AbortState"]);
    addImport("unreachable", ["UnreachableState"]);
    addImport("error", ["ErrorState"]);
  }

  static link(sources: Source[]): void {
    for (const source of sources) {
      SourceLinker.SS.sources.set(source.internalPath, new SourceRef(source));
      console.log(source.internalPath)
    }

    const entrySource = sources.find((v) => v.sourceKind == SourceKind.UserEntry);
    if (!entrySource) throw new Error("Could not find main entry point in sources");

    console.log("========LINKING========\n");
    console.log("Entry: " + entrySource.internalPath);

    const linker = new SourceLinker();
    linker.link(entrySource);

    console.log("\n========GENERATING========\n");
    const entryRef = SourceLinker.SS.sources.get(entrySource.internalPath);
    if (!entryRef) throw new Error("Could not find " + entrySource.internalPath + " in sources!");
    entryRef.generate();

    for (const [path, source] of SourceLinker.SS.sources) {
      if ([
        "assembly/test",
        "assembly/foo"
      ].includes(path)) {
        debugger;
        // console.log(path, source.functions, source.tries)
      }
    }
  }
}