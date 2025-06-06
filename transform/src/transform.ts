import { BlockStatement, CallExpression, ClassDeclaration, CommonFlags, DoStatement, FunctionDeclaration, IfStatement, ImportStatement, NamespaceDeclaration, Node, NodeKind, Parser, Program, Range, Source, ThrowStatement, Token, TryStatement } from "assemblyscript/dist/assemblyscript.js";
import { Visitor } from "./lib/visitor.js";
import { toString } from "./lib/util.js";
import { blockify, getFnName, hasBaseException, hasException, hasOnlyExceptions, removeExtension, replaceRef } from "./utils.js";
import { FunctionLinker } from "./passes/function.js";
import { ForOfStatement, ForStatement, ImportDeclaration, WhileStatement } from "types:assemblyscript/src/ast";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const WRITE = process.env["WRITE"];
const DEBUG = process.env["DEBUG"] ? (process.env["DEBUG"] == "true" ? true : false) : false;

export class SourceData {
  public source: Source;
  public exceptions: TryInstance[] = [];
  public functions: FunctionRef[] = [];
  public imports: ImportStatement[] = [];
  public visited: boolean = false;
  constructor(source: Source) {
    this.source = source;
  }
}

export class TryInstance {
  public node: TryStatement;
  public ref: Node | Node[] | null;
  public tryBlock: DoStatement;
  public catchBlock: IfStatement;
  public finallyBlock: BlockStatement | DoStatement;

  public callStack: FunctionRef[] = [];

  public fn: FunctionRef | null = null;
  public loop: LoopRef | null = null;
  public path: string[] = [];
  constructor(node: TryStatement, ref: Node | Node[] | null = null) {
    this.node = node;
    this.ref = ref;
  }
}

export class FunctionRef {
  public node: FunctionDeclaration;
  public name: string;
  public ref: Node | Node[] | null;
  public callers: CallRef[];
  public hasException: boolean = false;
  public hasTry: boolean = false;
  public path: string[];

  public exported: boolean = false;
  public overrided: boolean = false;
  constructor(node: FunctionDeclaration, callers: CallRef[], ref: Node | Node[] | null, path: string[] = []) {
    this.node = node;
    this.callers = callers;
    this.ref = ref;
    this.path = path;
    this.name = getFnName(node.name, path);
  }
}

export class CallRef {
  public node: CallExpression;
  public ref: Node | Node[] | null;
  public path: string[];
  public hasException: boolean = true;
  constructor(node: CallExpression, ref: Node | Node[] | null, path: string[] = []) {
    this.node = node;
    this.ref = ref;
    this.path = path;
  }
}

export class LoopRef {
  public node: DoStatement | WhileStatement | ForStatement | ForOfStatement;
  public ref: Node | Node[] | null;
  constructor(node: DoStatement | WhileStatement | ForStatement | ForOfStatement, ref: Node | Node[] | null) {
    this.node = node;
    this.ref = ref;
  }
}

export class ExceptionRef {
  public node: CallExpression | ThrowStatement;
  public ref: Node | Node[] | null;

  public fn: FunctionRef | null = null;
  public loop: LoopRef | null = null;
  constructor(node: CallExpression | ThrowStatement, ref: Node | Node[] | null) {
    this.node = node;
    this.ref = ref;
  }
}

export class Try extends Visitor {
  static SN: Try = new Try();

  public program!: Program;
  public baseDir!: string;
  public currentException: TryInstance | null = null;
  public callStack: [number, FunctionRef][] = [];
  public tryStack: [number, TryInstance][] = [];

  public sources: SourceData[] = [];
  public src!: SourceData;
  public exceptions: TryInstance[] = [];
  public functions: FunctionRef[] = [];
  public imports: ImportStatement[] = [];

  public fn: FunctionRef | null = null;
  public loop: LoopRef | null = null;
  public path: string[] = [];

  public baseCWD!: string;
  public parser: Parser;
  public topLevel: boolean = true;

  _visit(node: Node, ref?: Node | Node[] | null) {
    super._visit(node, ref);
  }
  visitTryStatement(node: TryStatement, ref?: Node | Node[] | null): void {
    if (DEBUG) console.log("Found try: " + toString(node));

    const exception = new TryInstance(node, ref);

    exception.fn = this.fn;
    exception.loop = this.loop;
    exception.path = this.path;

    // exception.generate();
    if (this.topLevel) {
      this.exceptions.push(exception);
      console.log("Added Top Level Try: " + toString(node));
    }

    const oldTopLevel = this.topLevel;
    this.topLevel = false;
    this.visit(node.bodyStatements, node);
    this.visit(node.catchStatements, node);
    this.visit(node.finallyStatements, node);
    this.topLevel = oldTopLevel;

    // this.visit(exception.tryBlock, ref);
    // this.visit(exception.catchBlock, ref);
    // this.visit(exception.finallyBlock, ref);
  }
  visitImportStatement(node: ImportStatement, ref?: Node | Node[] | null): void {
    this.src.imports.push(node);
    // const externalSource = this.sources.find((s) => s.source.internalPath == node.internalPath);
    // if (!externalSource) {
    //   this.visitSource(node.source, node);
    //   this.visiting = false;
    // }
    super.visitImportStatement(node, ref);
  }
  visitNamespaceDeclaration(node: NamespaceDeclaration, isDefault?: boolean, ref?: Node | Node[] | null): void {
    this.path.push(node.name.text);
    super.visitNamespaceDeclaration(node, isDefault, ref);
    const index = this.path.lastIndexOf(node.name.text);
    if (index !== -1) {
      this.path.splice(index, 1);
    }
  }
  visitClassDeclaration(node: ClassDeclaration, isDefault?: boolean, ref?: Node | Node[] | null): void {
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
  visitFunctionDeclaration(node: FunctionDeclaration, isDefault?: boolean, ref?: Node | Node[] | null): void {
    if (!node.name.text.length) return super.visitFunctionDeclaration(node, isDefault, ref);
    const oldFn = this.fn;
    const oldLoop = this.loop;
    this.fn = new FunctionRef(node, [], ref);
    if (this.loop) this.loop = null;
    node.body = blockify(node.body);
    super.visitFunctionDeclaration(node, isDefault, ref);
    this.loop = oldLoop;
    this.fn = oldFn;
  }
  visitIfStatement(node: IfStatement, ref?: Node | Node[] | null): void {
    node.ifTrue = blockify(node.ifTrue);
    node.ifFalse = blockify(node.ifFalse);
    super.visitIfStatement(node, ref);
  }
  visitWhileStatement(node: WhileStatement, ref?: Node | Node[] | null): void {
    const oldLoop = this.loop;
    this.loop = new LoopRef(node, ref);
    node.body = blockify(node.body);
    super.visitWhileStatement(node, ref);
    this.loop = oldLoop;
  }
  visitDoStatement(node: DoStatement, ref?: Node | Node[] | null): void {
    const oldLoop = this.loop;
    this.loop = new LoopRef(node, ref);
    node.body = blockify(node.body);
    super.visitDoStatement(node, ref);
    this.loop = oldLoop;
  }
  visitForOfStatement(node: ForOfStatement, ref?: Node | Node[] | null): void {
    const oldLoop = this.loop;
    this.loop = new LoopRef(node, ref);
    node.body = blockify(node.body);
    super.visitForOfStatement(node, ref);
    this.loop = oldLoop;
  }
  visitForStatement(node: ForStatement, ref?: Node | Node[] | null): void {
    const oldLoop = this.loop;
    this.loop = new LoopRef(node, ref);
    node.body = blockify(node.body);
    super.visitForStatement(node, ref);
    this.loop = oldLoop;
  }
  addFnRef(source: Source | string, fnRef: FunctionRef, onCallStack: boolean = false): void {
    source = typeof source === "string" ? source : source.internalPath;
    const src = this.sources.find((s) => s.source.internalPath == source);
    if (!src) return null;
    src.functions.push(fnRef);
  }
  getFnByName(source: Source | string, name: string): FunctionRef | null {
    source = typeof source === "string" ? source : source.internalPath;
    const src = this.sources.find((s) => s.source.internalPath == source)!;
    if (!src) return null;
    for (const fn of src.functions) {
      if (fn.name == name) return fn;
    }
    return null;
  }
  getFnByNameNoPath(source: Source, name: string): FunctionRef | null {
    const src = this.sources.find((s) => s.source == source)!;
    if (!src) return null;
    for (const fn of src.functions) {
      if (fn.node.name.text == name) return fn;
    }
    return null;
  }

  visitSrc(node: Source, fnLinker: FunctionLinker = FunctionLinker.SN): void {
    this.src = this.sources.find((s) => s.source.internalPath == node.internalPath);
    if (this.src && this.src.visited) return;

    this.functions = this.src.functions;
    this.exceptions = this.src.exceptions;
    this.imports = this.src.imports;

    this.callStack = [];
    this.currentException = null;
    this.currentSource = node;
    this.fn = null;
    this.loop = null;
    this.imports = [];

    fnLinker.runPass(node);
    super.visitSource(node);
    console.log("Marking " + node.internalPath + " as visited");
    this.src.visited = true;

    if (this.exceptions.length || this.functions.length) this.addImports(node);
  }

  addImports(node: Source): void {
    const baseDir = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..");
    // console.log("Base Dir: " + baseDir);
    const pkgPath = path.join(this.baseCWD, "node_modules");
    const isLibrary = existsSync(path.join(pkgPath, "try-as"));
    let fromPath = node.range.source.normalizedPath;

    fromPath = fromPath.startsWith("~lib/") ? (existsSync(path.join(pkgPath, fromPath.slice(5, fromPath.indexOf("/", 5)))) ? path.join(pkgPath, fromPath.slice(5)) : fromPath) : path.join(this.baseCWD, fromPath);

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
}
