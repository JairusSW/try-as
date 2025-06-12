import { Node } from "assemblyscript/dist/assemblyscript.js";
import { addAfter, blockify, cloneNode, getBreaker, getFnName } from "../utils.js";
import { SourceLinker } from "../passes/source.js";
import { indent } from "../globals/indent.js";
import { BaseRef } from "./baseref.js";
export class FunctionRef extends BaseRef {
    node;
    ref;
    name;
    path;
    tries = [];
    exceptions = [];
    callers = [];
    exported = false;
    hasException = false;
    generatedImport = false;
    cloneBody;
    constructor(node, ref, path = []) {
        super();
        this.node = node;
        this.ref = ref;
        this.path = path;
        this.name = getFnName(node.name, path);
        this.exported = Boolean(node.flags & 2);
        this.cloneBody = cloneNode(node.body);
    }
    isEntry() {
        return this.node.flags & 2 && this.node.range.source.sourceKind == 1;
    }
    generate() {
        console.log(indent + "Generating function " + this.name);
        indent.add();
        if (this.exported && !this.generatedImport) {
            this.generatedImport = true;
            const seenSources = new Set();
            for (const caller of this.callers) {
                if (caller.name != this.name)
                    continue;
                if (caller.node.range.source.internalPath == this.node.range.source.internalPath)
                    continue;
                if (seenSources.has(caller.node.range.source.internalPath))
                    continue;
                seenSources.add(caller.node.range.source.internalPath);
                const callerSrc = SourceLinker.SS.sources.get(caller.node.range.source.internalPath);
                if (!callerSrc)
                    throw new Error("Could not find " + caller.node.range.source.internalPath + " in sources!");
                let callerImport = null;
                let callerDeclaration = null;
                for (const imp of callerSrc.local.imports) {
                    const decl = imp.declarations.find(b => caller.name === b.name.text);
                    if (decl) {
                        callerImport = imp;
                        callerDeclaration = decl;
                        break;
                    }
                }
                if (callerImport && callerDeclaration) {
                    const newCallerImport = Node.createImportDeclaration(Node.createIdentifierExpression("__try_" + callerDeclaration.foreignName.text, caller.node.range.source.range), Node.createIdentifierExpression("__try_" + caller.name, caller.node.range.source.range), caller.node.range.source.range);
                    callerImport.declarations.push(newCallerImport);
                    console.log(indent + "Added import " + newCallerImport.foreignName.text);
                }
            }
        }
        const returnStmt = getBreaker(this.node, this.node);
        const unrollCheck = Node.createIfStatement(Node.createBinaryExpression(73, Node.createPropertyAccessExpression(Node.createIdentifierExpression("__ExceptionState", this.node.range), Node.createIdentifierExpression("Failures", this.node.range), this.node.range), Node.createIntegerLiteralExpression(i64_zero, this.node.range), this.node.range), blockify(returnStmt), null, this.node.range);
        const replacementFunction = Node.createFunctionDeclaration(Node.createIdentifierExpression(this.node.name.text, this.node.name.range), this.node.decorators, this.node.flags, this.node.typeParameters, this.node.signature, this.cloneBody, this.node.arrowKind, this.node.range);
        if (!this.tries.length) {
            this.node.name = Node.createIdentifierExpression("__try_" + this.node.name.text, this.node.name.range);
        }
        if (this.node.body.kind != 30) {
            this.node.body = blockify(this.node.body);
        }
        this.node.body.statements.unshift(unrollCheck);
        for (const exception of this.exceptions) {
            exception.generate();
        }
        if (!this.tries.length) {
            for (const caller of this.callers) {
                caller.generate();
            }
        }
        for (const tryRef of this.tries) {
            tryRef.generate();
        }
        if (!this.isEntry() && !this.tries.length)
            addAfter(this.node, replacementFunction, this.ref);
        indent.rm();
    }
    update(ref) {
        this.node = ref.node;
        this.ref = ref.ref;
        return this;
    }
}
//# sourceMappingURL=functionref.js.map