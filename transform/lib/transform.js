import { Node } from "assemblyscript/dist/assemblyscript.js";
import { Visitor } from "./lib/visitor.js";
import { toString } from "./lib/util.js";
import { blockify, getFnName } from "./utils.js";
import { FunctionLinker } from "./passes/function.js";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
const WRITE = process.env["WRITE"];
const DEBUG = process.env["DEBUG"] ? (process.env["DEBUG"] == "true" ? true : false) : false;
export class SourceData {
    source;
    exceptions = [];
    functions = [];
    imports = [];
    visited = false;
    constructor(source) {
        this.source = source;
    }
}
export class TryInstance {
    node;
    ref;
    tryBlock;
    catchBlock;
    finallyBlock;
    callStack = [];
    fn = null;
    loop = null;
    path = [];
    constructor(node, ref = null) {
        this.node = node;
        this.ref = ref;
    }
}
export class FunctionRef {
    node;
    name;
    ref;
    callers;
    hasException = false;
    hasTry = false;
    path;
    exported = false;
    overrided = false;
    constructor(node, callers, ref, path = []) {
        this.node = node;
        this.callers = callers;
        this.ref = ref;
        this.path = path;
        this.name = getFnName(node.name, path);
    }
}
export class CallRef {
    node;
    ref;
    path;
    hasException = true;
    constructor(node, ref, path = []) {
        this.node = node;
        this.ref = ref;
        this.path = path;
    }
}
export class LoopRef {
    node;
    ref;
    constructor(node, ref) {
        this.node = node;
        this.ref = ref;
    }
}
export class ExceptionRef {
    node;
    ref;
    fn = null;
    loop = null;
    constructor(node, ref) {
        this.node = node;
        this.ref = ref;
    }
}
export class Try extends Visitor {
    static SN = new Try();
    program;
    baseDir;
    currentException = null;
    callStack = [];
    tryStack = [];
    sources = [];
    src;
    exceptions = [];
    functions = [];
    imports = [];
    fn = null;
    loop = null;
    path = [];
    baseCWD;
    parser;
    topLevel = true;
    _visit(node, ref) {
        super._visit(node, ref);
    }
    visitTryStatement(node, ref) {
        if (DEBUG)
            console.log("Found try: " + toString(node));
        const exception = new TryInstance(node, ref);
        exception.fn = this.fn;
        exception.loop = this.loop;
        exception.path = this.path;
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
    }
    visitImportStatement(node, ref) {
        this.src.imports.push(node);
        super.visitImportStatement(node, ref);
    }
    visitNamespaceDeclaration(node, isDefault, ref) {
        this.path.push(node.name.text);
        super.visitNamespaceDeclaration(node, isDefault, ref);
        const index = this.path.lastIndexOf(node.name.text);
        if (index !== -1) {
            this.path.splice(index, 1);
        }
    }
    visitClassDeclaration(node, isDefault, ref) {
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
        }
        else {
            throw new Error("Expected to type parameters to match class declaration, but found type mismatch instead!");
        }
    }
    visitFunctionDeclaration(node, isDefault, ref) {
        if (!node.name.text.length)
            return super.visitFunctionDeclaration(node, isDefault, ref);
        const oldFn = this.fn;
        const oldLoop = this.loop;
        this.fn = new FunctionRef(node, [], ref);
        if (this.loop)
            this.loop = null;
        node.body = blockify(node.body);
        super.visitFunctionDeclaration(node, isDefault, ref);
        this.loop = oldLoop;
        this.fn = oldFn;
    }
    visitIfStatement(node, ref) {
        node.ifTrue = blockify(node.ifTrue);
        node.ifFalse = blockify(node.ifFalse);
        super.visitIfStatement(node, ref);
    }
    visitWhileStatement(node, ref) {
        const oldLoop = this.loop;
        this.loop = new LoopRef(node, ref);
        node.body = blockify(node.body);
        super.visitWhileStatement(node, ref);
        this.loop = oldLoop;
    }
    visitDoStatement(node, ref) {
        const oldLoop = this.loop;
        this.loop = new LoopRef(node, ref);
        node.body = blockify(node.body);
        super.visitDoStatement(node, ref);
        this.loop = oldLoop;
    }
    visitForOfStatement(node, ref) {
        const oldLoop = this.loop;
        this.loop = new LoopRef(node, ref);
        node.body = blockify(node.body);
        super.visitForOfStatement(node, ref);
        this.loop = oldLoop;
    }
    visitForStatement(node, ref) {
        const oldLoop = this.loop;
        this.loop = new LoopRef(node, ref);
        node.body = blockify(node.body);
        super.visitForStatement(node, ref);
        this.loop = oldLoop;
    }
    addFnRef(source, fnRef, onCallStack = false) {
        source = typeof source === "string" ? source : source.internalPath;
        const src = this.sources.find((s) => s.source.internalPath == source);
        if (!src)
            return null;
        src.functions.push(fnRef);
    }
    getFnByName(source, name) {
        source = typeof source === "string" ? source : source.internalPath;
        const src = this.sources.find((s) => s.source.internalPath == source);
        if (!src)
            return null;
        for (const fn of src.functions) {
            if (fn.name == name)
                return fn;
        }
        return null;
    }
    getFnByNameNoPath(source, name) {
        const src = this.sources.find((s) => s.source == source);
        if (!src)
            return null;
        for (const fn of src.functions) {
            if (fn.node.name.text == name)
                return fn;
        }
        return null;
    }
    visitSrc(node, fnLinker = FunctionLinker.SN) {
        this.src = this.sources.find((s) => s.source.internalPath == node.internalPath);
        if (this.src && this.src.visited)
            return;
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
        if (this.exceptions.length || this.functions.length)
            this.addImports(node);
    }
    addImports(node) {
        const baseDir = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..");
        const pkgPath = path.join(this.baseCWD, "node_modules");
        const isLibrary = existsSync(path.join(pkgPath, "try-as"));
        let fromPath = node.range.source.normalizedPath;
        fromPath = fromPath.startsWith("~lib/") ? (existsSync(path.join(pkgPath, fromPath.slice(5, fromPath.indexOf("/", 5)))) ? path.join(pkgPath, fromPath.slice(5)) : fromPath) : path.join(this.baseCWD, fromPath);
        let relDir = path.posix.join(...path.relative(path.dirname(fromPath), path.join(baseDir, "assembly", "types")).split(path.sep));
        if (relDir.includes("node_modules" + path.sep + "try-as")) {
            relDir = "try-as" + relDir.slice(relDir.indexOf("node_modules" + path.sep + "try-as") + 19);
        }
        else if (!relDir.startsWith(".") && !relDir.startsWith("/") && !relDir.startsWith("try-as")) {
            relDir = "./" + relDir;
        }
        const addImport = (file, names) => {
            const imps = [];
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
//# sourceMappingURL=transform.js.map