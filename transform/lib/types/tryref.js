import { Node, Range } from "assemblyscript/dist/assemblyscript.js";
import { cloneNode, replaceRef } from "../utils.js";
import { toString } from "../lib/util.js";
import { indent } from "../globals/indent.js";
export class TryRef {
    node;
    ref;
    tryBlock;
    catchBlock = null;
    finallyBlock = null;
    parent = null;
    callStack = [];
    path = [];
    constructor(node, ref = null) {
        this.node = node;
        this.ref = ref;
    }
    generate() {
        const tryRange = this.node.bodyStatements.length
            ? new Range(this.node.bodyStatements[0].range.start, this.node.bodyStatements[this.node.bodyStatements.length - 1].range.end)
            : this.node.range;
        this.tryBlock = Node.createDoStatement(Node.createBlockStatement([...cloneNode(this.node.bodyStatements)], tryRange), Node.createFalseExpression(this.node.range), tryRange);
        console.log(indent + "Try Block/Loop: " + toString(this.tryBlock).split("\n").join("\n" + indent));
        if (this.node.catchStatements?.length) {
            const catchRange = new Range(this.node.catchStatements[0].range.start, this.node.catchStatements[this.node.catchStatements.length - 1].range.end);
            const catchVar = Node.createVariableStatement(null, [
                Node.createVariableDeclaration(this.node.catchVariable, null, 16, null, Node.createNewExpression(Node.createSimpleTypeName("__Exception", this.node.range), null, [
                    Node.createPropertyAccessExpression(Node.createIdentifierExpression("__ExceptionState", this.node.range), Node.createIdentifierExpression("Type", this.node.range), this.node.range)
                ], this.node.range), this.node.range)
            ], this.node.range);
            const stateReset = Node.createExpressionStatement(Node.createUnaryPostfixExpression(88, Node.createPropertyAccessExpression(Node.createIdentifierExpression("__ExceptionState", this.node.range), Node.createIdentifierExpression("Failures", this.node.range), this.node.range), this.node.range));
            this.catchBlock = Node.createIfStatement(Node.createBinaryExpression(73, Node.createPropertyAccessExpression(Node.createIdentifierExpression("__ExceptionState", this.node.range), Node.createIdentifierExpression("Failures", this.node.range), this.node.range), Node.createIntegerLiteralExpression(i64_zero, this.node.range), this.node.range), Node.createBlockStatement([catchVar, stateReset, ...cloneNode(this.node.catchStatements)], this.node.range), null, this.node.range);
            console.log(indent + "Catch Block: " + toString(this.catchBlock).split("\n").join("\n" + indent));
        }
        if (this.node.finallyStatements) {
            this.finallyBlock = Node.createBlockStatement(cloneNode(this.node.finallyStatements), this.node.range);
            console.log(indent + "Finally Block: " + toString(this.finallyBlock).split("\n").join("\n" + indent));
        }
        replaceRef(this.node, [this.tryBlock, this.catchBlock].filter((v) => v != null), this.ref);
    }
}
//# sourceMappingURL=tryref.js.map