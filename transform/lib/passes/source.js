import { Node } from "assemblyscript/dist/assemblyscript.js";
import { SourceRef } from "../types/sourceref.js";
import { Visitor } from "../lib/visitor.js";
import { indent } from "../globals/indent.js";
import { FunctionRef } from "../types/functionref.js";
import { blockify, getName } from "../utils.js";
import { ExceptionRef } from "../types/exceptionref.js";
import { CallRef } from "../types/callref.js";
import { TryRef } from "../types/tryref.js";
import { fileURLToPath } from "url";
import { Globals } from "../globals/globals.js";
import path from "path";
import fs from "fs";
import { toString } from "../lib/util.js";
import { ClassRef } from "../types/classref.js";
import { NamespaceRef } from "../types/namespaceref.js";
import { MethodRef } from "../types/methodref.js";
const rawValue = process.env["DEBUG"];
const DEBUG = rawValue == "true" ? 1 : rawValue == "false" || rawValue == "" ? 0 : isNaN(Number(rawValue)) ? 0 : Number(rawValue);
export class SourceLinker extends Visitor {
    node;
    name;
    state = "ready";
    source;
    path = [];
    lastFn = null;
    parentFn = null;
    parentSpace = null;
    entryFn = null;
    constructor(sourceRef) {
        super();
        this.source = sourceRef;
        this.node = sourceRef.node;
    }
    visitImportStatement(node, ref = null) {
        if (this.state != "gather" || !node.internalPath)
            return super.visitImportStatement(node, ref);
        if (node.internalPath.startsWith("~lib/rt") || node.internalPath.startsWith("~lib/performance") || node.internalPath.startsWith("~lib/wasi_") || node.internalPath.startsWith("~lib/shared/"))
            return super.visitImportStatement(node, ref);
        this.source.local.imports.push(node);
        const targetSourceRef = Globals.sources.get(node.internalPath) || Globals.sources.get(node.internalPath + "/index");
        if (!targetSourceRef)
            return super.visitImportStatement(node, ref);
        if (targetSourceRef.state != "ready")
            return super.visitImportStatement(node, ref);
        if (node.internalPath == node.range.source.internalPath)
            return super.visitImportStatement(node, ref);
        if (DEBUG > 0)
            console.log(indent + node.range.source.internalPath + " -> " + targetSourceRef.node.internalPath);
        this.source.dependencies.add(targetSourceRef);
        targetSourceRef.linker.gather();
        super.visitImportStatement(node, ref);
    }
    hasException = false;
    visitExportStatement(node, ref = null) {
        if (this.state != "gather" || !node.internalPath)
            return super.visitExportStatement(node, ref);
        if (node.internalPath.startsWith("~lib/rt") || node.internalPath.startsWith("~lib/performance") || node.internalPath.startsWith("~lib/wasi_") || node.internalPath.startsWith("~lib/shared/"))
            return super.visitExportStatement(node, ref);
        this.source.local.exports.push(node);
        const targetSourceRef = Globals.sources.get(node.internalPath) || Globals.sources.get(node.internalPath + "/index");
        if (!targetSourceRef)
            return super.visitExportStatement(node, ref);
        if (targetSourceRef.state != "ready")
            return super.visitExportStatement(node, ref);
        if (node.internalPath == node.range.source.internalPath)
            return super.visitExportStatement(node, ref);
        if (DEBUG > 0)
            console.log(indent + node.range.source.internalPath + " -> " + targetSourceRef.node.internalPath);
        this.source.dependencies.add(targetSourceRef);
        targetSourceRef.linker.gather();
        super.visitExportStatement(node, ref);
    }
    visitMethodDeclaration(node, ref) {
        if (this.state != "gather" || !this.parentSpace)
            return super.visitMethodDeclaration(node, ref);
        if (this.parentSpace instanceof NamespaceRef)
            return super.visitMethodDeclaration(node, ref);
        if (node.name.kind == 26)
            return super.visitMethodDeclaration(node, ref);
        const methRef = new MethodRef(node, ref, this.source, this.parentSpace);
        this.parentSpace.methods.push(methRef);
        super.visitMethodDeclaration(node, ref);
    }
    visitFunctionDeclaration(node, isDefault = false, ref = null) {
        if (this.state == "gather") {
            const fnRef = new FunctionRef(node, ref, this.source, this.parentSpace);
            if (this.parentSpace && this.parentSpace instanceof NamespaceRef) {
                this.parentSpace.functions.push(fnRef);
            }
            else {
                this.source.local.functions.push(fnRef);
            }
            this.parentFn = fnRef;
            super.visitFunctionDeclaration(node, isDefault, ref);
            this.parentFn = null;
            return;
        }
        else if (this.state == "link") {
            if (node.flags & 2) {
                const fnRef = this.source.local.functions.find((v) => v.name == node.name.text);
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
    linkFunctionRef(fnRef) {
        if (!fnRef)
            return;
        indent.add();
        Globals.callStack.add(fnRef);
        if (DEBUG > 0) {
            const stackNames = Array.from(Globals.callStack.values()).map(fn => fn.name).join(", ");
            console.log(`${indent}Stack [${stackNames}] ${this.node.internalPath}`);
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
            for (const a of Globals.refStack) {
                a.hasException = true;
                Globals.refStack.delete(a);
            }
            for (const fn of Globals.callStack.values()) {
                if (fn.hasException)
                    continue;
                fn.hasException = true;
                if (fn.path.length) {
                    for (const parent of fnRef.path) {
                        if (parent.hasException)
                            continue;
                        if (DEBUG > 0)
                            console.log(indent + "Added namespace (parent): " + parent.qualifiedName);
                        parent.hasException = true;
                        this.source.namespaces.push(parent);
                    }
                }
                else {
                    if (fn instanceof FunctionRef)
                        fn.source.functions.push(fn);
                    else if (!fn.parent.hasException)
                        fn.source.classes.push(fn.parent);
                }
                if (fn instanceof FunctionRef) {
                    if (DEBUG > 0)
                        console.log(indent + (fn.path.length ? "  " : "") + "Added function: " + fn.qualifiedName);
                    else if (DEBUG > 0)
                        console.log(indent + (fn.path.length ? "  " : "") + "Added method: " + fn.qualifiedName);
                }
            }
            Globals.callStack.clear();
            Globals.foundException = false;
        }
        else {
            Globals.callStack.delete(fnRef);
        }
        indent.rm();
    }
    linkMethodRef(methRef) {
        if (!methRef)
            return;
        indent.add();
        Globals.callStack.add(methRef);
        if (DEBUG > 0) {
            const stackNames = Array.from(Globals.callStack.values()).map(fn => fn.name).join(", ");
            console.log(`${indent}Stack [${stackNames}] ${this.node.internalPath}`);
        }
        methRef.state = "done";
        const lastFn = this.lastFn;
        const parentFn = this.parentFn;
        this.lastFn = methRef;
        this.parentFn = methRef;
        super.visitMethodDeclaration(methRef.node, methRef.ref);
        this.parentFn = parentFn;
        this.lastFn = lastFn;
        if (Globals.foundException) {
            for (const a of Globals.refStack) {
                a.hasException = true;
                Globals.refStack.delete(a);
            }
            for (const fn of Globals.callStack.values()) {
                if (fn.hasException)
                    continue;
                fn.hasException = true;
                if (fn.path.length) {
                    for (const parent of methRef.path) {
                        if (parent.hasException)
                            continue;
                        if (DEBUG > 0)
                            console.log(indent + "Added " + (fn instanceof MethodRef ? "class" : "namespace") + " (parent): " + parent.name);
                        parent.hasException = true;
                        if (parent instanceof ClassRef)
                            this.source.classes.push(parent);
                        else
                            this.source.namespaces.push(parent);
                    }
                }
                else {
                    if (fn instanceof FunctionRef)
                        fn.source.functions.push(fn);
                    else if (!fn.parent.hasException)
                        fn.source.classes.push(fn.parent);
                }
                if (DEBUG > 0)
                    console.log(indent + "  Added method: " + fn.qualifiedName);
            }
            Globals.callStack.clear();
            Globals.foundException = false;
        }
        else {
            Globals.callStack.delete(methRef);
        }
        indent.rm();
    }
    visitCallExpression(node, ref = null) {
        if (this.state != "link" && this.state != "done")
            return super.visitCallExpression(node, ref);
        if (!Globals.lastTry)
            return super.visitCallExpression(node, ref);
        const fnName = getName(node.expression);
        if (fnName == "unreachable" || fnName == "abort") {
            if (DEBUG > 0)
                console.log(indent + "Found exception " + toString(node));
            Globals.foundException = true;
            const newException = new ExceptionRef(node, ref, this.source, this.parentFn);
            if (this.lastFn)
                this.lastFn.exceptions.push(newException);
            else
                Globals.lastTry.exceptions.push(newException);
            return super.visitCallExpression(node, ref);
        }
        let [fnRef, fnSrc] = this.source.findFn(fnName);
        if (!fnRef || !fnSrc)
            return super.visitCallExpression(node, ref);
        const callRef = new CallRef(node, ref, fnRef, this.parentFn);
        fnRef.callers.push(callRef);
        console.log(indent + "Found call " + toString(node) + " (" + fnRef?.callers.length + ")");
        fnSrc.linker.link();
        Globals.refStack.add(callRef);
        if (fnRef instanceof FunctionRef)
            fnSrc.linker.linkFunctionRef(fnRef);
        else
            fnSrc.linker.linkMethodRef(fnRef);
        super.visitCallExpression(node, ref);
        Globals.refStack.delete(callRef);
        if (fnRef.hasException)
            this.lastFn?.exceptions.push(callRef);
    }
    visitThrowStatement(node, ref = null) {
        if (this.state != "link" && this.state != "done")
            return super.visitThrowStatement(node, ref);
        if (!Globals.lastTry)
            return super.visitThrowStatement(node, ref);
        if (DEBUG > 0)
            console.log(indent + "Found exception " + toString(node));
        Globals.foundException = true;
        const newException = new ExceptionRef(node, ref, this.source, this.parentFn);
        if (this.lastFn)
            this.lastFn.exceptions.push(newException);
        else
            Globals.lastTry.exceptions.push(newException);
        return super.visitThrowStatement(node, ref);
    }
    visitTryStatement(node, ref = null) {
        if (this.lastFn) {
            if (DEBUG > 0 && this.state == "link")
                console.log(indent + "Entered Try");
            const tryRef = new TryRef(node, ref, this.source);
            this.lastFn.tries.push(tryRef);
            const lastTry = Globals.lastTry;
            const parentFn = this.parentFn;
            Globals.lastTry = tryRef;
            this.parentFn = null;
            Globals.refStack.add(tryRef);
            this.visit(node.bodyStatements, node);
            Globals.refStack.delete(tryRef);
            this.parentFn = parentFn;
            Globals.lastTry = lastTry;
            this.visit(node.catchVariable, node);
            this.visit(node.catchStatements, node);
            this.visit(node.finallyStatements, node);
            if (DEBUG > 0 && this.state == "link")
                console.log(indent + "Exited Try");
            return;
        }
        if (this.state != "link")
            return super.visitTryStatement(node, ref);
        const tryRef = new TryRef(node, ref, this.source);
        (Globals.lastTry ? Globals.lastTry.tries : this.source.tries).push(tryRef);
        if (DEBUG > 0)
            console.log(indent + "Entered Try");
        const lastTry = Globals.lastTry;
        const parentFn = this.parentFn;
        Globals.lastTry = tryRef;
        this.parentFn = null;
        Globals.refStack.add(tryRef);
        this.visit(node.bodyStatements, node);
        Globals.refStack.delete(tryRef);
        this.parentFn = parentFn;
        Globals.lastTry = lastTry;
        this.visit(node.catchVariable, node);
        this.visit(node.catchStatements, node);
        this.visit(node.finallyStatements, node);
        if (DEBUG > 0)
            console.log(indent + "Exited Try");
        Globals.lastTry = lastTry;
    }
    visitNamespaceDeclaration(node, isDefault = false, ref = null) {
        console.log(indent + "Found namespace " + node.name.text);
        indent.add();
        const namespaceRef = new NamespaceRef(node, ref, this.source, this.parentSpace);
        this.source.local.namespaces.push(namespaceRef);
        const parentSpace = this.parentSpace;
        this.parentSpace = namespaceRef;
        super.visitNamespaceDeclaration(node, isDefault, ref);
        this.parentSpace = parentSpace;
        indent.rm();
    }
    visitClassDeclaration(node, isDefault = false, ref = null) {
        super.visit(node.name, node);
        this.visit(node.decorators, node);
        if (node.isGeneric ? node.typeParameters != null : node.typeParameters == null) {
            console.log(indent + "Found class " + node.name.text);
            indent.add();
            const classRef = new ClassRef(node, ref, this.source, this.parentSpace);
            this.source.local.classes.push(classRef);
            super.visit(node.typeParameters, node);
            super.visit(node.extendsType, node);
            super.visit(node.implementsTypes, node);
            const parentSpace = this.parentSpace;
            this.parentSpace = classRef;
            super.visit(node.members, node);
            this.parentSpace = parentSpace;
            indent.rm();
        }
        else {
            throw new Error("Expected type parameters to match class declaration, but found type mismatch instead!");
        }
    }
    visitIfStatement(node, ref) {
        if (this.state != "gather")
            return super.visitIfStatement(node, ref);
        if (node.ifTrue)
            node.ifTrue = blockify(node.ifTrue);
        if (node.ifFalse)
            node.ifFalse = blockify(node.ifFalse);
        return super.visitIfStatement(node, ref);
    }
    gather() {
        if (this.state != "ready")
            return;
        Globals.refStack.add(this.source);
        indent.add();
        this.source.state = "linking";
        this.state = "gather";
        if (DEBUG > 0)
            console.log(indent + "Gathering " + this.node.internalPath);
        super.visit(this.node);
        Globals.refStack.delete(this.source);
        indent.rm();
    }
    link(entry = false) {
        if (this.state != "gather")
            return;
        Globals.refStack.add(this.source);
        indent.add();
        this.state = "link";
        if (DEBUG > 0)
            console.log(indent + "Linking " + (entry ? "(entry) " : "") + this.node.internalPath);
        if (entry)
            super.visit(this.node);
        if (DEBUG > 0)
            console.log(indent + "Done linking " + (entry ? "(entry) " : "") + this.node.internalPath);
        this.state = "done";
        this.source.state = "done";
        Globals.refStack.delete(this.source);
        indent.rm();
        this.addImports(this.node);
    }
    addImports(node) {
        const baseDir = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
        const pkgPath = path.join(Globals.baseCWD, "node_modules");
        let fromPath = node.range.source.normalizedPath;
        fromPath = fromPath.startsWith("~lib/") ? (fs.existsSync(path.join(pkgPath, fromPath.slice(5, fromPath.indexOf("/", 5)))) ? path.join(pkgPath, fromPath.slice(5)) : fromPath) : path.join(Globals.baseCWD, fromPath);
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
        addImport("abort", ["AbortState"]);
        addImport("unreachable", ["UnreachableState"]);
        addImport("error", ["ErrorState"]);
    }
    static link(sources) {
        if (DEBUG > 0)
            console.log("\n========SOURCES========\n");
        for (const source of sources) {
            Globals.sources.set(source.internalPath, new SourceRef(source));
            if (DEBUG > 0)
                console.log(source.internalPath);
        }
        const entrySources = sources.filter((v) => v.sourceKind == 1);
        if (!entrySources.length)
            throw new Error("Could not find main entry point in sources");
        for (const entrySource of entrySources) {
            if (DEBUG > 0)
                console.log("\n========LINKING========\n");
            if (DEBUG > 0)
                console.log("Entry: " + entrySource.internalPath);
            const entrySourceRef = Globals.sources.get(entrySource.internalPath);
            entrySourceRef.linker.gather();
            entrySourceRef.linker.link(true);
            debugger;
        }
        for (const entrySource of entrySources) {
            if (DEBUG > 0)
                console.log("\n========GENERATING========\n");
            const entryRef = Globals.sources.get(entrySource.internalPath);
            if (!entryRef)
                throw new Error("Could not find " + entrySource.internalPath + " in sources!");
            entryRef.generate();
        }
        for (const source of sources) {
            const baseDir = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
            const pkgPath = path.join(Globals.baseCWD, "node_modules");
            let fromPath = source.normalizedPath;
            fromPath = fromPath.startsWith("~lib/") ? (fs.existsSync(path.join(pkgPath, fromPath.slice(5, fromPath.indexOf("/", 5)))) ? path.join(pkgPath, fromPath.slice(5)) : fromPath) : path.join(Globals.baseCWD, fromPath);
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
                    const imp = Node.createImportDeclaration(Node.createIdentifierExpression(name, source.range), Node.createIdentifierExpression("__" + name, source.range), source.range);
                    imps.push(imp);
                }
                const stmt = Node.createImportStatement(imps, Node.createStringLiteralExpression(relDir + "/" + file, source.range), source.range);
                source.statements.unshift(stmt);
            };
            addImport("exception", ["Exception", "ExceptionState"]);
        }
    }
}
//# sourceMappingURL=source.js.map