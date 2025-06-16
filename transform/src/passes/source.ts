import { CallExpression, ClassDeclaration, ExportStatement, FunctionDeclaration, ImportDeclaration, ImportStatement, NamespaceDeclaration, Node, Source, SourceKind, ThrowStatement, TryStatement } from "assemblyscript/dist/assemblyscript.js";
import { SourceRef } from "../types/sourceref.js";
import { Visitor } from "../lib/visitor.js";
import { indent } from "../globals/indent.js";
import { FunctionRef } from "../types/functionref.js";
import { blockify, getFnName } from "../utils.js";
import { ExceptionRef } from "../types/exceptionref.js";
import { CallRef } from "../types/callref.js";
import { CommonFlags } from "types:assemblyscript/src/common";
import { TryRef } from "../types/tryref.js";
import { fileURLToPath } from "url";
import { Globals } from "../globals/globals.js";
import path from "path";
import fs from "fs";
import { toString } from "../lib/util.js";
import { IfStatement, ReturnStatement } from "types:assemblyscript/src/ast";

const rawValue = process.env["DEBUG"];
const DEBUG = rawValue === "true" ? 1 : rawValue === "false" || rawValue === "" ? 0 : isNaN(Number(rawValue)) ? 0 : Number(rawValue);

export class SourceLinker extends Visitor {
  public node: Source;
  public name: string;
  public state: "ready" | "gather" | "stack" | "link" | "done" = "ready";
  public source: SourceRef;

  public path: string[] = [];
  public lastFn: FunctionRef | null = null;
  public lastTry: TryRef | null = null;
  public lastRet: ReturnStatement | null = null;
  public parentFn: FunctionRef | null = null;
  public entryFn: FunctionRef | null = null;

  constructor(sourceRef: SourceRef) {
    super();
    this.source = sourceRef;
    this.node = sourceRef.node;
  }
  visitImportStatement(node: ImportStatement, ref: Node | Node[] | null = null): void {
    if (this.state != "gather" || !node.internalPath) return super.visitImportStatement(node, ref);
    if (node.internalPath.startsWith("~lib/rt") || node.internalPath.startsWith("~lib/performance") || node.internalPath.startsWith("~lib/wasi_") || node.internalPath.startsWith("~lib/shared/")) return super.visitImportStatement(node, ref);
    this.source.local.imports.push(node);
    const targetSourceRef = Globals.sources.get(node.internalPath) || Globals.sources.get(node.internalPath + "/index");
    if (!targetSourceRef) return super.visitImportStatement(node, ref); // throw new Error("Could not find " + node.internalPath + " in sources!");
    if (targetSourceRef.state != "ready") return super.visitImportStatement(node, ref);
    if (node.internalPath == node.range.source.internalPath) return super.visitImportStatement(node, ref);
    if (DEBUG > 0) console.log(indent + node.range.source.internalPath + " -> " + targetSourceRef.node.internalPath);

    this.source.dependencies.add(targetSourceRef);
    targetSourceRef.linker.gather();
    super.visitImportStatement(node, ref);
  }

  // visitExportImportStatement(node: ExportImportStatement, ref?: Node | Node[] | null): void {
  //   if (DEBUG > 0) console.log(indent + "Found ExportImportStatement " + toString(node));
  //   super.visitExportImportStatement(node, ref);
  // }
  // visitExportDefaultStatement(node: ExportDefaultStatement, ref?: Node | Node[] | null): void {
  //   console.log(indent + "Found ExportDefaultStatement " + toString(node));
  //   super.visitExportDefaultStatement(node, ref);
  // }
  // visitFunctionExpression(node: FunctionExpression, ref?: Node | Node[] | null): void {
  //   console.log(indent + "Found FunctionExpression " + toString(node));
  //   super.visitFunctionExpression(node, ref);
  // }
  visitExportStatement(node: ExportStatement, ref: Node | Node[] | null = null): void {
    if (this.state != "gather" || !node.internalPath) return super.visitExportStatement(node, ref);
    if (node.internalPath.startsWith("~lib/rt") || node.internalPath.startsWith("~lib/performance") || node.internalPath.startsWith("~lib/wasi_") || node.internalPath.startsWith("~lib/shared/")) return super.visitExportStatement(node, ref);
    this.source.local.exports.push(node);
    const targetSourceRef = Globals.sources.get(node.internalPath) || Globals.sources.get(node.internalPath + "/index");
    if (!targetSourceRef) return super.visitExportStatement(node, ref); // throw new Error("Could not find " + node.internalPath + " in sources!");
    if (targetSourceRef.state != "ready") return super.visitExportStatement(node, ref);
    if (node.internalPath == node.range.source.internalPath) return super.visitExportStatement(node, ref);
    if (DEBUG > 0) console.log(indent + node.range.source.internalPath + " -> " + targetSourceRef.node.internalPath);

    this.source.dependencies.add(targetSourceRef);
    targetSourceRef.linker.gather();
    super.visitExportStatement(node, ref);
  }

  visitFunctionDeclaration(node: FunctionDeclaration, isDefault: boolean = false, ref: Node | Node[] | null = null): void {
    if (this.state == "gather") {
      const fnRef = new FunctionRef(node, ref, this.path.slice());
      // console.log(indent + "Found function " + fnRef.name);
      this.source.local.functions.push(fnRef);
    } else if (this.state == "link") {
      if (node.flags & CommonFlags.Export) {
        const fnRef = this.source.local.functions.find((v) => v.name == node.name.text);
        this.source.functions.push(fnRef);

        const lastFn = this.lastFn;
        this.lastFn = fnRef;
        this.parentFn = fnRef;
        super.visitFunctionDeclaration(node, isDefault, ref);
        this.parentFn = null;
        this.lastFn = lastFn;
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
    Globals.callStack.add(fnRef);
    if (DEBUG > 0)
      console.log(
        indent +
        "Stack [" +
        Array.from(Globals.callStack.values())
          .map((v) => v.name)
          .join(", ") +
        "] " + this.node.internalPath,
      );

    if (fnRef.state != "ready") {
      indent.rm();
      return;
    }
    fnRef.state = "done";
    const lastFn = this.lastFn;
    const parentFn = this.parentFn;
    this.lastFn = fnRef;
    this.parentFn = fnRef;
    super.visitFunctionDeclaration(fnRef.node, false, fnRef.ref);
    this.parentFn = parentFn;
    this.lastFn = lastFn;

    if (Globals.foundException) {
      for (const fn of Globals.callStack.values()) {
        fn.hasException = true;
        if (fn.node.range.source.internalPath != this.source.node.internalPath) {
          const alienSrc = Globals.sources.get(fn.node.range.source.internalPath);
          if (!alienSrc.functions.some((v) => v == fn)) {
            if (DEBUG > 0) console.log(indent + "Added function (fn): " + fn.name);
            alienSrc.functions.push(fn);
          }
        } else {
          if (!this.source.functions.some((v) => v == fn)) {
            if (DEBUG > 0) console.log(indent + "Added function (fn): " + fn.name);
            this.source.functions.push(fn);
          }
        }
      }
      Globals.callStack.clear();
      Globals.foundException = false;
    } else {
      Globals.callStack.delete(fnRef);
    }
    indent.rm();
  }

  visitCallExpression(node: CallExpression, ref: Node | Node[] | null = null): void {
    if (this.state != "link" && this.state != "done") return super.visitCallExpression(node, ref);
    if (this.node.sourceKind == SourceKind.UserEntry && !this.lastTry) return super.visitCallExpression(node, ref);

    const fnName = getFnName(node.expression);
    if (fnName == "unreachable" || fnName == "abort") {
      if (DEBUG > 0) console.log(indent + "Found exception " + toString(node));
      Globals.foundException = true;
      const newException = new ExceptionRef(node, ref);
      newException.parentFn = this.parentFn;
      if (this.lastFn) this.lastFn.exceptions.push(newException);
      else this.lastTry.exceptions.push(newException);
      return super.visitCallExpression(node, ref);
    }

    let [fnRef, fnSrc] = this.source.findFn(fnName);
    if (!fnRef || !fnSrc) return super.visitCallExpression(node, ref);

    const callRef = new CallRef(node, ref, fnRef);
    fnRef.callers.push(callRef);
    callRef.parentFn = this.parentFn;

    if (Globals.foundException) {
      for (const fn of Globals.callStack.values()) {
        fn.hasException = true;
        if (fn.node.range.source.internalPath != this.source.node.internalPath) {
          const alienSrc = Globals.sources.get(fn.node.range.source.internalPath);
          if (!alienSrc.functions.some((v) => v == fn)) {
            if (DEBUG > 0) console.log(indent + "Added function (call): " + fn.name);
            alienSrc.functions.push(fn);
          }
        } else {
          if (!this.source.functions.some((v) => v == fn)) {
            if (DEBUG > 0) console.log(indent + "Added function (call): " + fn.name);
            this.source.functions.push(fn);
          }
        }
      }
      Globals.callStack.clear();
      Globals.foundException = false;
    }

    fnSrc.linker.link();
    fnSrc.linker.linkFunctionRef(fnRef);

    super.visitCallExpression(node, ref);

    if (fnRef.hasException) this.lastFn?.exceptions.push(callRef);
  }

  visitThrowStatement(node: ThrowStatement, ref: Node | Node[] | null = null): void {
    if (this.state != "link" && this.state != "done") return super.visitThrowStatement(node, ref);
    if (this.node.sourceKind == SourceKind.UserEntry && !this.lastTry) return super.visitThrowStatement(node, ref);
    if (DEBUG > 0) console.log(indent + "Found exception " + toString(node));
    Globals.foundException = true;
    const newException = new ExceptionRef(node, ref);
    newException.parentFn = this.parentFn;
    if (this.lastFn) this.lastFn.exceptions.push(newException);
    else this.lastTry.exceptions.push(newException);
    return super.visitThrowStatement(node, ref);
  }

  visitTryStatement(node: TryStatement, ref: Node | Node[] | null = null): void {
    if (this.lastFn) {
      const tryRef = new TryRef(node, ref);
      this.lastFn.tries.push(tryRef);
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
    this.path.pop();
  }
  visitClassDeclaration(node: ClassDeclaration, isDefault: boolean = false, ref: Node | Node[] | null = null): void {
    super.visit(node.name, node);
    this.visit(node.decorators, node);
    if (node.isGeneric ? node.typeParameters != null : node.typeParameters == null) {
      super.visit(node.typeParameters, node);
      super.visit(node.extendsType, node);
      super.visit(node.implementsTypes, node);
      this.path.push(node.name.text);
      super.visit(node.members, node);
      this.path.pop();
    } else {
      throw new Error("Expected type parameters to match class declaration, but found type mismatch instead!");
    }
  }

  visitIfStatement(node: IfStatement, ref?: Node | Node[] | null): void {
    if (this.state != "gather") return super.visitIfStatement(node, ref);
    if (node.ifTrue) node.ifTrue = blockify(node.ifTrue);
    if (node.ifFalse) node.ifFalse = blockify(node.ifFalse);
    return super.visitIfStatement(node, ref);
  }

  visitReturnStatement(node: ReturnStatement, ref?: Node | Node[] | null): void {
    this.lastRet = node;
    super.visitReturnStatement(node, ref);
    this.lastRet = null;
  }

  gather(): void {
    if (this.state != "ready") return;
    indent.add();
    this.source.state = "linking";
    this.state = "gather";
    if (DEBUG > 0) console.log(indent + "Gathering " + this.node.internalPath);
    super.visit(this.node);
    indent.rm();
  }

  link(entry: boolean = false): void {
    if (this.state != "gather") return;
    indent.add();

    this.state = "link";
    if (DEBUG > 0) console.log(indent + "Linking " + (entry ? "(entry) " : "") + this.node.internalPath);
    if (entry) super.visit(this.node);

    if (DEBUG > 0) console.log(indent + "Done linking " + (entry ? "(entry) " : "") + this.node.internalPath);
    this.state = "done";
    this.source.state = "done";
    indent.rm();
    this.addImports(this.node);
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
    if (DEBUG > 0) console.log("\n========SOURCES========\n");
    for (const source of sources) {
      Globals.sources.set(source.internalPath, new SourceRef(source));
      if (DEBUG > 0) console.log(source.internalPath);
    }

    const entrySources = sources.filter((v) => v.sourceKind == SourceKind.UserEntry);
    if (!entrySources.length) throw new Error("Could not find main entry point in sources");

    for (const entrySource of entrySources) {
      if (DEBUG > 0) console.log("\n========LINKING========\n");
      if (DEBUG > 0) console.log("Entry: " + entrySource.internalPath);

      const entrySourceRef = Globals.sources.get(entrySource.internalPath)!;
      entrySourceRef.linker.gather();
      entrySourceRef.linker.link(true);
    }

    for (const entrySource of entrySources) {
      if (DEBUG > 0) console.log("\n========GENERATING========\n");
      const entryRef = Globals.sources.get(entrySource.internalPath);
      if (!entryRef) throw new Error("Could not find " + entrySource.internalPath + " in sources!");
      entryRef.generate();
    }
  }
}
