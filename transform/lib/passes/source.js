import { SourceRef } from "../types/sourceref.js";
import { Visitor } from "../lib/visitor.js";
import { indent } from "../globals/indent.js";
import { FunctionRef } from "../types/functionref.js";
import { getFnName } from "../utils.js";
import { ExceptionRef } from "../types/exceptionref.js";
import { CallRef } from "../types/callref.js";
import { TryRef } from "../types/tryref.js";
class SourceState {
    sources = new Map();
}
export class SourceLinker extends Visitor {
    static SS = new SourceState();
    node;
    name;
    state = "ready";
    source;
    path = [];
    lastFn = null;
    lastTry = null;
    parentFn = null;
    entryFn = null;
    visitImportStatement(node, ref = null) {
        if (this.state != "gather")
            return super.visitImportStatement(node, ref);
        this.source.local.imports.push(node);
        const targetSourceRef = SourceLinker.SS.sources.get(node.internalPath);
        if (!targetSourceRef)
            throw new Error("Could not find " + node.internalPath + " in sources!");
        if (targetSourceRef.state != "ready")
            return super.visitImportStatement(node, ref);
        if (node.internalPath == node.range.source.internalPath)
            return super.visitImportStatement(node, ref);
        console.log(indent + node.range.source.internalPath + " -> " + targetSourceRef.node.internalPath);
        this.source.dependencies.add(targetSourceRef);
        const newLinker = new SourceLinker();
        newLinker.link(targetSourceRef.node);
    }
    visitFunctionDeclaration(node, isDefault = false, ref = null) {
        if (!node.body || !node.name.text.length) {
            this.parentFn = new FunctionRef(node, ref, this.path.slice());
            super.visitFunctionDeclaration(node, isDefault, ref);
            this.parentFn = null;
            return;
        }
        const fnRef = new FunctionRef(node, ref, this.path.slice());
        if (this.state == "link") {
            this.parentFn = fnRef;
            if (node.range.source.sourceKind == 1 && (node.flags & 2)) {
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
        else if (this.state == "gather") {
            this.source.local.functions.push(fnRef);
            if (node.range.source.sourceKind == 1 && (node.flags & 2)) {
                this.lastFn = fnRef;
                this.parentFn = fnRef;
                super.visitFunctionDeclaration(node, isDefault, ref);
                this.parentFn = null;
                this.lastFn = null;
                return;
            }
        }
        this.parentFn = fnRef;
        super.visitFunctionDeclaration(node, isDefault, ref);
        this.parentFn = null;
    }
    linkFunctionRef(fnRef) {
        if (!fnRef)
            return;
        if (this.source.functions.some((v) => v.name == fnRef.name))
            return;
        if (fnRef.node.range.source.internalPath != this.source.node.internalPath) {
            const alienSrc = SourceLinker.SS.sources.get(fnRef.node.range.source.internalPath);
            alienSrc.functions.push(fnRef);
        }
        else {
            this.source.functions.push(fnRef);
        }
        const lastFn = this.lastFn;
        this.lastFn = fnRef;
        this.parentFn = fnRef;
        super.visitFunctionDeclaration(fnRef.node, false, fnRef.ref);
        this.parentFn = null;
        this.lastFn = lastFn;
    }
    visitCallExpression(node, ref = null) {
        if (this.state != "link")
            return super.visitCallExpression(node, ref);
        const fnName = getFnName(node.expression);
        if (fnName == "unreachable" || fnName == "abort") {
            super.visitCallExpression(node, ref);
            const newException = new ExceptionRef(node, ref);
            newException.parentFn = this.parentFn;
            this.lastFn?.exceptions.push(newException);
            return;
        }
        if (!this.lastTry)
            return super.visitCallExpression(node, ref);
        const targetName = getFnName(node.expression);
        let fnRef = this.source.local.functions.find((v) => v.name == targetName);
        if (fnRef) {
            console.log(indent + "Found " + targetName + " locally");
        }
        else {
            const externDec = this.source.local.imports.find((a) => a.declarations.find((b) => targetName == b.name.text || targetName.startsWith(b.name.text + ".")));
            if (externDec) {
                const externSrc = SourceLinker.SS.sources.get(externDec.internalPath);
                if (!externSrc)
                    throw new Error("Could not find " + externDec.internalPath + " in sources!");
                fnRef = externSrc.functions.find((v) => v.name == targetName || targetName.startsWith(v.name + ".")) || externSrc.local.functions.find((v) => v.name == targetName || targetName.startsWith(v.name + "."));
                if (fnRef)
                    console.log(indent + "Found " + targetName + " externally");
            }
            else {
            }
        }
        if (!fnRef)
            return super.visitCallExpression(node, ref);
        const callRef = new CallRef(node, ref, fnRef);
        this.lastFn?.exceptions.push(callRef);
        fnRef.callers.push(callRef);
        callRef.parentFn = this.parentFn;
        this.linkFunctionRef(fnRef);
        super.visitCallExpression(node, ref);
    }
    visitTryStatement(node, ref = null) {
        if (this.lastFn) {
            const tryRef = new TryRef(node, ref);
            this.lastFn.tries.push(tryRef);
            return super.visitTryStatement(node, ref);
        }
        if (this.state != "link")
            return super.visitTryStatement(node, ref);
        if (!this.lastTry) {
            const tryRef = new TryRef(node, ref);
            this.source.tries.push(tryRef);
            const lastTry = this.lastTry;
            this.lastTry = tryRef;
            super.visitTryStatement(node, ref);
            this.lastTry = lastTry;
        }
        else {
            super.visitTryStatement(node, ref);
        }
    }
    visitNamespaceDeclaration(node, isDefault = false, ref = null) {
        this.path.push(node.name.text);
        super.visitNamespaceDeclaration(node, isDefault, ref);
        const index = this.path.lastIndexOf(node.name.text);
        if (index !== -1) {
            this.path.splice(index, 1);
        }
    }
    visitClassDeclaration(node, isDefault = false, ref = null) {
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
    link(source) {
        if (this.state != "ready")
            return;
        indent.add();
        this.source = SourceLinker.SS.sources.get(source.internalPath);
        this.source.state = "linking";
        this.state = "gather";
        console.log(indent + "Gathering " + source.internalPath);
        super.visit(source);
        this.state = "link";
        console.log(indent + "Linking " + source.internalPath);
        super.visit(source);
        console.log(indent + "Done linking " + source.internalPath);
        this.state = "done";
        this.source.state = "done";
        indent.rm();
    }
    static link(sources) {
        for (const source of sources) {
            SourceLinker.SS.sources.set(source.internalPath, new SourceRef(source));
        }
        const entrySource = sources.find((v) => v.sourceKind == 1);
        if (!entrySource)
            throw new Error("Could not find main entry point in sources");
        console.log("========LINKING========\n");
        console.log("Entry: " + entrySource.internalPath);
        const linker = new SourceLinker();
        linker.link(entrySource);
        console.log("\n========GENERATING========\n");
        const entryRef = SourceLinker.SS.sources.get(entrySource.internalPath);
        if (!entryRef)
            throw new Error("Could not find " + entrySource.internalPath + " in sources!");
        entryRef.generate();
        for (const [path, source] of SourceLinker.SS.sources) {
            if ([
                "assembly/test",
                "assembly/foo"
            ].includes(path))
                console.log(path, source.functions, source.tries);
        }
    }
}
//# sourceMappingURL=source.js.map