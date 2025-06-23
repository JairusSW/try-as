import { CallExpression, ClassDeclaration, ExportStatement, FunctionDeclaration, ImportDeclaration, ImportStatement, NamespaceDeclaration, Node, NodeKind, Source, SourceKind, ThrowStatement, TryStatement } from "assemblyscript/dist/assemblyscript.js";
import { SourceRef } from "../types/sourceref.js";
import { Visitor } from "../lib/visitor.js";
import { indent } from "../globals/indent.js";
import { FunctionRef } from "../types/functionref.js";
import { blockify, getName } from "../utils.js";
import { ExceptionRef } from "../types/exceptionref.js";
import { CallRef } from "../types/callref.js";
import { CommonFlags } from "types:assemblyscript/src/common";
import { TryRef } from "../types/tryref.js";
import { fileURLToPath } from "url";
import { Globals } from "../globals/globals.js";
import path from "path";
import fs from "fs";
import { toString } from "../lib/util.js";
import { IfStatement, MethodDeclaration } from "types:assemblyscript/src/ast";
import { ClassRef } from "../types/classref.js";
import { NamespaceRef } from "../types/namespaceref.js";
import { MethodRef } from "../types/methodref.js";

const rawValue = process.env["DEBUG"];
const DEBUG = rawValue == "true" ? 1 : rawValue == "false" || rawValue == "" ? 0 : isNaN(Number(rawValue)) ? 0 : Number(rawValue);

export class SourceLinker extends Visitor {
  public node: Source;
  public name: string;
  public state: "ready" | "gather" | "link" | "postprocess" | "done" = "ready";
  public source: SourceRef;

  public path: string[] = [];
  public parentSpace: NamespaceRef | ClassRef | null = null;
  public entryFn: FunctionRef | null = null;

  public visitedFns: Set<FunctionRef | MethodRef> = new Set();

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
  public hasException: boolean = false;
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
  visitMethodDeclaration(node: MethodDeclaration, ref?: Node | Node[] | null): void {
    if (this.state != "gather" || !this.parentSpace) return super.visitMethodDeclaration(node, ref);
    if (this.parentSpace instanceof NamespaceRef) return super.visitMethodDeclaration(node, ref);
    if (node.name.kind == NodeKind.Constructor) return super.visitMethodDeclaration(node, ref);
    const methRef = new MethodRef(node, ref, this.source, this.parentSpace);
    Globals.methods.push(methRef);
    if (DEBUG > 0) console.log(indent + "Found method " + methRef.name);
    this.parentSpace.methods.push(methRef);
    super.visitMethodDeclaration(node, ref);
  }
  visitFunctionDeclaration(node: FunctionDeclaration, isDefault: boolean = false, ref: Node | Node[] | null = null): void {
    if (this.state == "gather") {
      const fnRef = new FunctionRef(node, ref, this.source, this.parentSpace as NamespaceRef | null);
      // console.log(indent + "Found function " + fnRef.qualifiedName);
      if (this.parentSpace && this.parentSpace instanceof NamespaceRef) {
        this.parentSpace.functions.push(fnRef);
      } else {
        this.source.local.functions.push(fnRef);
      }

      Globals.parentFn = fnRef;
      super.visitFunctionDeclaration(node, isDefault, ref);
      Globals.parentFn = null;
      return;
    } else if (this.state == "link") {
      if (node.flags & CommonFlags.Export) {
        const fnRef = this.source.local.functions.find((v) => v.name == node.name.text);
        // this.source.functions.push(fnRef);
        // Globals.refStack.add(fnRef);
        const lastFn = Globals.lastFn;
        Globals.lastFn = fnRef;
        Globals.parentFn = fnRef;
        super.visitFunctionDeclaration(node, isDefault, ref);
        Globals.parentFn = null;
        Globals.lastFn = lastFn;
        // Globals.refStack.delete(fnRef);
        return;
      }
    }
    const parentFn = this.source.local.functions.find((v) => v.name == node.name.text);
    Globals.parentFn = parentFn;
    // Globals.refStack.add(parentFn);
    super.visitFunctionDeclaration(node, isDefault, ref);
    Globals.parentFn = null;
    // Globals.refStack.delete(parentFn);
  }
  linkFunctionRef(fnRef: FunctionRef): void {
    if (!fnRef || (fnRef.visited && !fnRef.hasException)) return;
    indent.add();
    Globals.callStack.add(fnRef);

    if (DEBUG > 0) {
      const stackNames = Array.from(Globals.callStack.values())
        .map((fn) => fn.name)
        .join(", ");
      if (DEBUG > 0) console.log(`${indent}Stack [${stackNames}] ${this.node.internalPath}`);
    }

    fnRef.state = "done";
    const lastFn = Globals.lastFn;
    const parentFn = Globals.parentFn;
    Globals.lastFn = fnRef;
    Globals.parentFn = fnRef;
    fnRef.visited = true;
    super.visitFunctionDeclaration(fnRef.node, false, fnRef.ref);
    Globals.parentFn = parentFn;
    Globals.lastFn = lastFn;

    Globals.callStack.delete(fnRef);

    indent.rm();
  }

  linkMethodRef(methRef: MethodRef): void {
    if (!methRef || (methRef.visited && !methRef.hasException)) return;
    indent.add();
    Globals.callStack.add(methRef);

    if (DEBUG > 0) {
      const stackNames = Array.from(Globals.callStack.values())
        .map((fn) => fn.name)
        .join(", ");
      if (DEBUG > 0) console.log(`${indent}Stack [${stackNames}] ${this.node.internalPath}`);
    }

    methRef.state = "done";
    const lastFn = Globals.lastFn;
    const parentFn = Globals.parentFn;
    Globals.lastFn = methRef;
    Globals.parentFn = methRef;
    methRef.visited = true;
    super.visitMethodDeclaration(methRef.node, methRef.ref);
    Globals.parentFn = parentFn;
    Globals.lastFn = lastFn;

    Globals.callStack.delete(methRef);

    indent.rm();
  }

  visitCallExpression(node: CallExpression, ref: Node | Node[] | null = null): void {
    if (this.state == "gather") return super.visitCallExpression(node, ref);
    if (this.state != "postprocess" && !Globals.lastTry) return super.visitCallExpression(node, ref);

    const fnName = getName(node.expression);
    if (fnName == "inline.always" || fnName == "unchecked") return super.visitCallExpression(node, ref);

    if (fnName == "unreachable" || fnName == "abort") {
      if (DEBUG > 0) console.log(indent + "Found exception " + toString(node) + " " + node.range.source.internalPath);
      Globals.foundException = true;
      const newException = new ExceptionRef(node, ref, this.source, Globals.parentFn);
      newException.hasException = true;
      if (Globals.parentFn) Globals.parentFn.exceptions.push(newException);
      else if (Globals.lastTry) Globals.lastTry.exceptions.push(newException);
      else throw new Error("No parent function");

      this.smashStack();

      return super.visitCallExpression(node, ref);
    }

    let [fnRef, fnSrc] = this.source.findFn(fnName);
    if (!fnRef || !fnSrc) return super.visitCallExpression(node, ref);
    const callRef = new CallRef(node, ref, fnRef, Globals.parentFn);
    Globals.refStack.add(callRef);
    fnRef?.callers.push(callRef);

    if (DEBUG > 0) console.log(indent + "Found call " + toString(node) + " (" + fnRef?.name + "/" + fnRef?.hasException + ")");

    if (fnRef.hasException) {
      callRef.hasException = true;
      if (Globals.parentFn) Globals.parentFn.exceptions.push(callRef);
      else if (Globals.lastTry) Globals.lastTry.exceptions.push(callRef);
      else throw new Error("No parent function");
      this.smashStack();
      return super.visitCallExpression(node, ref);
    }

    // if (fnRef.hasException) return super.visitCallExpression(node, ref);

    if (fnSrc.node.internalPath != this.node.internalPath) fnSrc.linker.link();
    if (fnRef instanceof FunctionRef) fnSrc.linker.linkFunctionRef(fnRef);
    else fnSrc.linker.linkMethodRef(fnRef);

    super.visitCallExpression(node, ref);

    if (fnRef.hasException || callRef.hasException) {
      if (DEBUG > 0) console.log("Adding call to " + fnRef.qualifiedName);
      callRef.hasException = true;
      if (Globals.parentFn) Globals.parentFn.exceptions.push(callRef);
      else if (Globals.lastTry) Globals.lastTry.exceptions.push(callRef);
      else throw new Error("No parent function");
      this.smashStack();
    }

    Globals.refStack.delete(callRef);
  }

  visitThrowStatement(node: ThrowStatement, ref: Node | Node[] | null = null): void {
    if (this.state != "link" && this.state != "done" && this.state != "postprocess") return super.visitThrowStatement(node, ref);
    if (this.state != "postprocess" && !Globals.lastTry) return super.visitThrowStatement(node, ref);
    if (DEBUG > 0) console.log(indent + "Found exception " + toString(node));
    Globals.foundException = true;
    const newException = new ExceptionRef(node, ref, this.source, Globals.parentFn);
    if (Globals.parentFn) Globals.parentFn.exceptions.push(newException);
    else Globals.lastTry.exceptions.push(newException);

    this.smashStack();

    return super.visitThrowStatement(node, ref);
  }

  visitTryStatement(node: TryStatement, ref: Node | Node[] | null = null): void {
    if (Globals.lastFn) {
      if (DEBUG > 0 && this.state == "link") console.log(indent + "Entered Try");
      const tryRef = new TryRef(node, ref, this.source);
      Globals.lastFn.tries.push(tryRef);
      const lastTry = Globals.lastTry;
      const parentFn = Globals.parentFn;
      Globals.lastTry = tryRef;
      Globals.parentFn = null;
      Globals.refStack.add(tryRef);
      this.visit(node.bodyStatements, node);
      Globals.refStack.delete(tryRef);
      Globals.parentFn = parentFn;
      Globals.lastTry = lastTry;
      this.visit(node.catchVariable, node);
      this.visit(node.catchStatements, node);
      this.visit(node.finallyStatements, node);
      if (DEBUG > 0 && this.state == "link") console.log(indent + "Exited Try");
      return;
    }

    if (this.state != "link") return super.visitTryStatement(node, ref);

    const tryRef = new TryRef(node, ref, this.source);
    (Globals.lastTry ? Globals.lastTry.tries : this.source.tries).push(tryRef);

    if (DEBUG > 0) console.log(indent + "Entered Try");
    const lastTry = Globals.lastTry;
    const parentFn = Globals.parentFn;
    Globals.lastTry = tryRef;
    Globals.parentFn = null;
    Globals.refStack.add(tryRef);
    this.visit(node.bodyStatements, node);
    Globals.refStack.delete(tryRef);
    Globals.parentFn = parentFn;
    Globals.lastTry = lastTry;
    this.visit(node.catchVariable, node);
    this.visit(node.catchStatements, node);
    this.visit(node.finallyStatements, node);
    if (DEBUG > 0) console.log(indent + "Exited Try");

    Globals.lastTry = lastTry;
  }

  visitNamespaceDeclaration(node: NamespaceDeclaration, isDefault: boolean = false, ref: Node | Node[] | null = null): void {
    if (this.state != "gather") return super.visitNamespaceDeclaration(node, isDefault, ref);
    if (DEBUG > 0) console.log(indent + "Found namespace " + node.name.text);
    indent.add();
    const namespaceRef = new NamespaceRef(node, ref, this.source, this.parentSpace as NamespaceRef | null);
    this.source.local.namespaces.push(namespaceRef);
    const parentSpace = this.parentSpace;
    this.parentSpace = namespaceRef;
    super.visitNamespaceDeclaration(node, isDefault, ref);
    this.parentSpace = parentSpace;
    indent.rm();
  }
  visitClassDeclaration(node: ClassDeclaration, isDefault: boolean = false, ref: Node | Node[] | null = null): void {
    if (this.state != "gather") return super.visitClassDeclaration(node, isDefault, ref);
    super.visit(node.name, node);
    this.visit(node.decorators, node);
    if (node.isGeneric ? node.typeParameters != null : node.typeParameters == null) {
      if (DEBUG > 0) console.log(indent + "Found class " + node.name.text);
      indent.add();
      const classRef = new ClassRef(node, ref, this.source, this.parentSpace as NamespaceRef | null);
      this.source.local.classes.push(classRef);
      super.visit(node.typeParameters, node);
      super.visit(node.extendsType, node);
      super.visit(node.implementsTypes, node);
      Globals.refStack.add(classRef);
      const parentSpace = this.parentSpace;
      this.parentSpace = classRef;
      super.visit(node.members, node);
      this.parentSpace = parentSpace;
      Globals.refStack.delete(classRef);
      indent.rm();
    } else {
      throw new Error("Expected type parameters to match class declaration, but found type mismatch instead!");
    }
  }

  linkClassRef(classRef: ClassRef): void {
    Globals.refStack.add(classRef);
    const parentSpace = this.parentSpace;
    this.parentSpace = classRef;
    for (const method of classRef.methods) {
      this.linkMethodRef(method);
    }

    if (classRef.hasException) this.source.classes.push(classRef);
    this.parentSpace = parentSpace;
    Globals.refStack.delete(classRef);
    return;
  }

  visitIfStatement(node: IfStatement, ref?: Node | Node[] | null): void {
    if (this.state != "gather") return super.visitIfStatement(node, ref);
    if (node.ifTrue && node.ifTrue.kind != NodeKind.Block) node.ifTrue = blockify(node.ifTrue);
    if (node.ifFalse && node.ifFalse.kind != NodeKind.Block) node.ifFalse = blockify(node.ifFalse);
    return super.visitIfStatement(node, ref);
  }

  smashStack(): void {
    for (const a of Globals.refStack) {
      a.hasException = true;
    }
    for (const fn of Globals.callStack.values()) {
      if (fn.hasException) continue;
      fn.hasException = true;

      if (fn.path.length) {
        for (const parent of fn.path) {
          if (parent.hasException) continue;
          if (DEBUG > 0) console.log(indent + "Added " + (fn instanceof MethodRef ? "class" : "namespace") + " (parent): " + parent.qualifiedName + " " + fn.source.node.internalPath);
          parent.hasException = true;
          if (parent instanceof NamespaceRef) this.source.namespaces.push(parent);
          else this.source.classes.push(parent);
        }
      } else {
        if (fn instanceof FunctionRef) fn.source.functions.push(fn);
        else if (!fn.parent.hasException) fn.source.classes.push(fn.parent);
      }

      if (fn instanceof FunctionRef) {
        if (DEBUG > 0) console.log(indent + (fn.path.length ? "  " : "") + "Added function: " + fn.qualifiedName + " " + fn.source.node.internalPath);
        else if (DEBUG > 0) console.log(indent + (fn.path.length ? "  " : "") + "Added method: " + fn.qualifiedName + " " + fn.source.node.internalPath);
      }
    }
    Globals.callStack.clear();
    Globals.refStack.clear();
    Globals.foundException = false;
  }

  gather(): void {
    if (this.state != "ready") return;
    Globals.refStack.add(this.source);
    indent.add();
    this.source.state = "linking";
    this.state = "gather";
    if (DEBUG > 0) console.log(indent + "Gathering " + this.node.internalPath);
    super.visit(this.node);
    Globals.refStack.delete(this.source);
    indent.rm();
  }

  link(entry: boolean = false): void {
    if (this.state != "gather") return;
    Globals.refStack.add(this.source);
    indent.add();

    this.state = "link";
    if (DEBUG > 0) console.log(indent + "Linking " + (entry ? "(entry) " : "") + this.node.internalPath);
    if (entry) super.visit(this.node);

    if (DEBUG > 0) console.log(indent + "Done linking " + (entry ? "(entry) " : "") + this.node.internalPath);
    if (DEBUG > 0) console.log(indent + "Postprocessing " + (entry ? "(entry) " : "") + this.node.internalPath);
    this.state = "postprocess";
    for (const classRef of this.source.local.classes) {
      this.linkClassRef(classRef);
    }
    if (DEBUG > 0) console.log(indent + "Done postprocessing " + (entry ? "(entry) " : "") + this.node.internalPath);

    this.state = "done";
    this.source.state = "done";
    Globals.refStack.delete(this.source);
    indent.rm();
    // this.addImports(this.node);
  }

  static addImports(node: Source): void {
    const baseDir = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
    // console.log("Base Dir: " + baseDir);
    const pkgPath = path.join(Globals.baseCWD, "node_modules");
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

    addImport("abort", ["AbortState"]);
    addImport("unreachable", ["UnreachableState"]);
    addImport("error", ["ErrorState"]);
    addImport("exception", ["Exception", "ExceptionState"]);
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
      debugger;
    }

    for (const entrySource of entrySources) {
      if (DEBUG > 0) console.log("\n========GENERATING========\n");
      const entryRef = Globals.sources.get(entrySource.internalPath);
      if (!entryRef) throw new Error("Could not find " + entrySource.internalPath + " in sources!");
      entryRef.generate();
    }

    for (const source of sources) {
      const baseDir = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
      // console.log("Base Dir: " + baseDir);
      const pkgPath = path.join(Globals.baseCWD, "node_modules");
      let fromPath = source.normalizedPath;

      fromPath = fromPath.startsWith("~lib/") ? (fs.existsSync(path.join(pkgPath, fromPath.slice(5, fromPath.indexOf("/", 5)))) ? path.join(pkgPath, fromPath.slice(5)) : fromPath) : path.join(Globals.baseCWD, fromPath);

      let relDir = path.posix.join(...path.relative(path.dirname(fromPath), path.join(baseDir, "assembly", "types")).split(path.sep));

      if (relDir.includes("node_modules" + path.sep + "try-as")) {
        relDir = "try-as" + relDir.slice(relDir.indexOf("node_modules" + path.sep + "try-as") + 19);
      } else if (!relDir.startsWith(".") && !relDir.startsWith("/") && !relDir.startsWith("try-as")) {
        relDir = "./" + relDir;
      }

      this.addImports(source);
    }
  }
}
