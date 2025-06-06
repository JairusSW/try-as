import { Node, Range } from "assemblyscript/dist/assemblyscript.js";
import { Visitor } from "../lib/visitor.js";
import { CallRef, FunctionRef, Try, LoopRef } from "../transform.js";
import { blockify, cloneNode, getBreaker, getFnName, replaceRef } from "../utils.js";
import { SimpleParser, toString } from "../lib/util.js";
export var PassKind;
(function (PassKind) {
    PassKind[PassKind["Collect"] = 0] = "Collect";
    PassKind[PassKind["Link"] = 1] = "Link";
})(PassKind || (PassKind = {}));
export class Linker extends Visitor {
    static SN = new Linker();
    pass = PassKind.Collect;
    callStack = [];
    path = [];
    fn = null;
    loop = null;
    src;
    calls = [];
    tlv = false;
    override = false;
    visitFunctionDeclaration(node, isDefault, ref) {
        console.log("Visiting Function: " + node.name.text);
        if (!node.name.text.length)
            return super.visitFunctionDeclaration(node, isDefault, ref);
        const oldFn = this.fn;
        const oldLoop = this.loop;
        this.fn = new FunctionRef(node, [], ref);
        if (this.loop)
            this.loop = null;
        super.visitFunctionDeclaration(node, isDefault, ref);
        this.loop = oldLoop;
        this.fn = oldFn;
        return;
    }
    visitCallExpression(node, ref) {
        super.visitCallExpression(node, ref);
        let fnName = getFnName(node.expression, this.path);
        if (fnName == "unreachable" || fnName == "abort") {
            this.replaceExceptionCall(node, ref);
            return;
        }
        fnName = getFnName(node.expression, this.path);
        let fnRef = Try.SN.getFnByName(node.range.source, fnName);
        if (fnRef) {
            console.log("Found " + fnName + " locally (linking)");
        }
        if (!fnRef) {
            let externDec = null;
            const externImport = this.src.imports.find((v) => {
                for (const dec of v.declarations) {
                    if (fnName.includes(dec.name.text)) {
                        externDec = dec;
                        return v;
                    }
                }
                return null;
            });
            if (externImport) {
                fnRef = Try.SN.getFnByName(externImport.internalPath, fnName);
                if (!fnRef)
                    return;
                console.log("Found " + fnName + " externally (linking)");
                if (!externImport.declarations.some((v) => v.name.text == "__try_" + fnRef.name)) {
                    const newImport = Node.createImportDeclaration(Node.createIdentifierExpression("__try_" + externDec.foreignName.text, node.range), Node.createIdentifierExpression("__try_" + fnRef.name, node.range, false), node.range);
                    externImport.declarations.push(newImport);
                }
            }
        }
        if (!fnRef)
            return;
        const callRef = new CallRef(node, ref, this.path.slice());
        if (fnRef.callers.find((c) => c.node == node))
            return;
        fnRef.callers.push(callRef);
        console.log("Added Call: " + fnRef.node.name.text);
        let breaker = getBreaker(node, this.fn?.node);
        let unrollCheck = Node.createIfStatement(Node.createBinaryExpression(73, Node.createPropertyAccessExpression(Node.createIdentifierExpression("__ExceptionState", node.range), Node.createIdentifierExpression("Failures", node.range), node.range), Node.createIntegerLiteralExpression(i64_zero, node.range), node.range), blockify(breaker), null, node.range);
        const overrideCall = Node.createExpressionStatement(Node.createCallExpression(fnRef.path ? SimpleParser.parseExpression(getFnName("__try_" + fnRef.name, fnRef.path)) : Node.createIdentifierExpression(getFnName("__try_" + fnRef.node.name.text), node.expression.range), node.typeArguments, node.args, node.range));
        replaceRef(node, [overrideCall, unrollCheck], ref);
        console.log("Replaced Call: " + toString(overrideCall));
        if (!fnRef.overrided) {
            breaker = getBreaker(fnRef.node, fnRef.node);
            console.log("FUNC:22 ", toString(fnRef.node));
            unrollCheck = Node.createIfStatement(Node.createBinaryExpression(73, Node.createPropertyAccessExpression(Node.createIdentifierExpression("__ExceptionState", fnRef.node.range), Node.createIdentifierExpression("Failures", fnRef.node.range), fnRef.node.range), Node.createIntegerLiteralExpression(i64_zero, fnRef.node.range), fnRef.node.range), blockify(breaker), null, fnRef.node.range);
            const newBody = Node.createBlockStatement([unrollCheck, ...cloneNode(blockify(fnRef.node.body)).statements], fnRef.node.range);
            const overrideFn = Node.createFunctionDeclaration(Node.createIdentifierExpression("__try_" + fnRef.node.name.text, fnRef.node.name.range), fnRef.node.decorators, fnRef.node.flags, fnRef.node.typeParameters, fnRef.node.signature, newBody, fnRef.node.arrowKind, fnRef.node.range);
            if (fnRef.hasTry) {
            }
            fnRef.overrided = true;
            this.override = true;
            replaceRef(fnRef.node, [fnRef.node, overrideFn], fnRef.ref);
            this.visit(overrideFn);
            console.log("Done visiting override function " + overrideFn.name.text);
            this.override = false;
        }
    }
    visitThrowStatement(node, ref) {
        if (node.value.kind != 17)
            return console.error("Unsupported Throw: " + toString(node));
        if (node.value.typeName.identifier.text != "Error")
            return console.error("Unsupported Throw: " + toString(node));
        const breaker = getBreaker(node, this.fn?.node);
        const newExpr = node.value;
        const newThrow = Node.createExpressionStatement(Node.createCallExpression(Node.createPropertyAccessExpression(Node.createIdentifierExpression("__ErrorState", node.range), Node.createIdentifierExpression("error", node.range), node.range), null, newExpr.args, node.range));
        console.log("New Exception: " + toString(newThrow));
        replaceRef(node, [newThrow, breaker], ref);
    }
    replaceExceptionCall(node, ref) {
        console.log("Replacing Exception Call: " + toString(node));
        const fnName = getFnName(node.expression);
        const newException = fnName == "abort" ? Node.createExpressionStatement(Node.createCallExpression(Node.createPropertyAccessExpression(Node.createIdentifierExpression("__AbortState", node.range), Node.createIdentifierExpression("abort", node.range), node.range), null, node.args, node.range)) : Node.createExpressionStatement(Node.createCallExpression(Node.createPropertyAccessExpression(Node.createIdentifierExpression("__UnreachableState", node.range), Node.createIdentifierExpression("unreachable", node.range), node.range), null, node.args, node.range));
        const breaker = getBreaker(node, this.fn?.node);
        console.log("New Exception: " + toString(newException));
        replaceRef(node, [newException, breaker], ref);
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
    visitWhileStatement(node, ref) {
        const oldLoop = this.loop;
        const oldFn = this.fn;
        this.loop = new LoopRef(node, ref);
        super.visitWhileStatement(node, ref);
        this.loop = oldLoop;
        this.fn = oldFn;
    }
    visitDoStatement(node, ref) {
        const oldLoop = this.loop;
        const oldFn = this.fn;
        this.loop = new LoopRef(node, ref);
        super.visitDoStatement(node, ref);
        this.loop = oldLoop;
        this.fn = oldFn;
    }
    visitForOfStatement(node, ref) {
        const oldLoop = this.loop;
        const oldFn = this.fn;
        this.loop = new LoopRef(node, ref);
        super.visitForOfStatement(node, ref);
        this.loop = oldLoop;
        this.fn = oldFn;
    }
    visitForStatement(node, ref) {
        const oldLoop = this.loop;
        const oldFn = this.fn;
        this.loop = new LoopRef(node, ref);
        super.visitForStatement(node, ref);
        this.loop = oldLoop;
        this.fn = oldFn;
    }
    visitTryStatement(node, ref) {
        let tryBlock;
        let catchBlock;
        let finallyBlock;
        const tryRange = node.bodyStatements.length ? new Range(node.bodyStatements[0].range.start, node.bodyStatements[node.bodyStatements.length - 1].range.end) : node.range;
        tryBlock = Node.createDoStatement(Node.createBlockStatement([...cloneNode(node.bodyStatements)], tryRange), Node.createFalseExpression(node.range), tryRange);
        console.log("Ref: " + toString(ref));
        console.log("Try Block/Loop: " + toString(tryBlock));
        if (node.catchStatements?.length) {
            const catchRange = new Range(node.catchStatements[0].range.start, node.catchStatements[node.catchStatements.length - 1].range.end);
            const catchVar = Node.createVariableStatement(null, [Node.createVariableDeclaration(node.catchVariable, null, 16, null, Node.createNewExpression(Node.createSimpleTypeName("__Exception", node.range), null, [Node.createPropertyAccessExpression(Node.createIdentifierExpression("__ExceptionState", node.range), Node.createIdentifierExpression("Type", node.range), node.range)], node.range), node.range)], node.range);
            const stateReset = Node.createExpressionStatement(Node.createUnaryPostfixExpression(88, Node.createPropertyAccessExpression(Node.createIdentifierExpression("__ExceptionState", node.range), Node.createIdentifierExpression("Failures", node.range), node.range), node.range));
            catchBlock = Node.createIfStatement(Node.createBinaryExpression(73, Node.createPropertyAccessExpression(Node.createIdentifierExpression("__ExceptionState", node.range), Node.createIdentifierExpression("Failures", node.range), node.range), Node.createIntegerLiteralExpression(i64_zero, node.range), node.range), Node.createDoStatement(Node.createBlockStatement([catchVar, stateReset, ...cloneNode(node.catchStatements)].filter((v) => v != null), node.range), Node.createFalseExpression(node.range), node.range), null, node.range);
            console.log("Catch Block: " + toString(catchBlock));
        }
        if (node.finallyStatements) {
            finallyBlock = Node.createBlockStatement(cloneNode(node.finallyStatements), node.range);
            console.log("Finally Block: " + toString(finallyBlock));
        }
        this.tlv = true;
        const oldLoop = this.loop;
        const oldFn = this.fn;
        this.fn = null;
        this.loop = new LoopRef(tryBlock, ref);
        super.visit(tryBlock.body.statements);
        this.loop = oldLoop;
        this.fn = oldFn;
        this.tlv = false;
        super.visit(catchBlock);
        super.visit(finallyBlock);
        replaceRef(node, [tryBlock, catchBlock, finallyBlock].filter((v) => v != null), ref);
    }
    _visit(node, ref) {
        this.tlv = false;
        super._visit(node, ref);
    }
    findException(node, exceptions = this.src.exceptions) {
        for (const exception of exceptions) {
            if (exception.node == node)
                return exception;
        }
        return null;
    }
    static runPass(source) {
        Linker.SN.pass = PassKind.Link;
        const src = Try.SN.sources.find((v) => v.source.internalPath == source.internalPath);
        Linker.SN.src = src;
        if (!src)
            return;
        Linker.SN.visitSource(source);
    }
}
//# sourceMappingURL=linker.js.map