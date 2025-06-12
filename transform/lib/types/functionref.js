import { Node } from "assemblyscript/dist/assemblyscript.js";
import { blockify, cloneNode, getFnName, replaceRef } from "../utils.js";
import { SourceLinker } from "../passes/source.js";
import { indent } from "../globals/indent.js";
export class FunctionRef {
    node;
    ref;
    name;
    path;
    tries = [];
    exceptions = [];
    callers = [];
    exported = false;
    constructor(node, ref, path = []) {
        this.node = node;
        this.ref = ref;
        this.path = path;
        this.name = getFnName(node.name, path);
        this.exported = true;
    }
    generate() {
        for (const exception of this.exceptions) {
            exception.generate();
        }
        for (const caller of this.callers) {
            caller.generate();
        }
        for (const tryRef of this.tries) {
            tryRef.generate();
        }
        if (this.exported) {
            for (const caller of this.callers) {
                if (caller.name != this.name)
                    continue;
                if (caller.node.range.source.internalPath == this.node.range.source.internalPath)
                    continue;
                const callerSrc = SourceLinker.SS.sources.get(caller.node.range.source.internalPath);
                if (!callerSrc)
                    throw new Error("Could not find " + caller.node.range.source.internalPath + " in sources!");
                let callerImport = null;
                let callerDeclaration = null;
                for (const imp of callerSrc.local.imports) {
                    const decl = imp.declarations.find(b => this.name === b.name.text);
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
        const returnStmt = Node.createIfStatement(Node.createCallExpression(Node.createIdentifierExpression("isBoolean", this.node.range), [this.node.signature.returnType], [], this.node.range), Node.createReturnStatement(Node.createFalseExpression(this.node.range), this.node.range), Node.createIfStatement(Node.createBinaryExpression(98, Node.createCallExpression(Node.createIdentifierExpression("isInteger", this.node.range), [this.node.signature.returnType], [], this.node.range), Node.createCallExpression(Node.createIdentifierExpression("isFloat", this.node.range), [this.node.signature.returnType], [], this.node.range), this.node.range), Node.createReturnStatement(Node.createIntegerLiteralExpression(i64_zero, this.node.range), this.node.range), Node.createIfStatement(Node.createBinaryExpression(98, Node.createCallExpression(Node.createIdentifierExpression("isManaged", this.node.range), [this.node.signature.returnType], [], this.node.range), Node.createCallExpression(Node.createIdentifierExpression("isReference", this.node.range), [this.node.signature.returnType], [], this.node.range), this.node.range), Node.createReturnStatement(Node.createCallExpression(Node.createIdentifierExpression("changetype", this.node.range), [this.node.signature.returnType], [Node.createIntegerLiteralExpression(i64_zero, this.node.range)], this.node.range), this.node.range), Node.createReturnStatement(null, this.node.range), this.node.range), this.node.range), this.node.range);
        const unrollCheck = Node.createIfStatement(Node.createBinaryExpression(73, Node.createPropertyAccessExpression(Node.createIdentifierExpression("__ExceptionState", this.node.range), Node.createIdentifierExpression("Failures", this.node.range), this.node.range), Node.createIntegerLiteralExpression(i64_zero, this.node.range), this.node.range), blockify(returnStmt), null, this.node.range);
        const newBody = Node.createBlockStatement([unrollCheck, ...cloneNode(blockify(this.node.body)).statements], this.node.range);
        const overrideFunction = Node.createFunctionDeclaration(Node.createIdentifierExpression("__try_" + this.node.name.text, this.node.name.range), this.node.decorators, this.node.flags, this.node.typeParameters, this.node.signature, newBody, this.node.arrowKind, this.node.range);
        replaceRef(this.node, [this.node, overrideFunction], this.ref);
    }
}
//# sourceMappingURL=functionref.js.map