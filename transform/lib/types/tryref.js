import { Node, Range } from "assemblyscript/dist/assemblyscript.js";
import { cloneNode, replaceRef } from "../utils.js";
import { SimpleParser, toString } from "../lib/util.js";
import { indent } from "../globals/indent.js";
import { BaseRef } from "./baseref.js";
const rawValue = process.env["DEBUG"];
const DEBUG = rawValue == "true" ? 1 : rawValue == "false" || rawValue == "" ? 0 : isNaN(Number(rawValue)) ? 0 : Number(rawValue);
const CATCH_KIND_MASK = {
    abort: 1 << 1,
    throw: 1 << 2,
    unreachable: 1 << 3,
};
const DEFAULT_CATCH_MASK = CATCH_KIND_MASK.abort | CATCH_KIND_MASK.throw | CATCH_KIND_MASK.unreachable;
export class TryRef extends BaseRef {
    node;
    ref;
    source;
    tries = [];
    exceptions = [];
    tryBlock = null;
    catchBlock = null;
    finallyBlock = null;
    catchMask = DEFAULT_CATCH_MASK;
    constructor(node, ref, source) {
        super();
        this.node = node;
        this.ref = ref;
        this.source = source;
        this.catchMask = this.resolveCatchMask();
    }
    resolveCatchMask() {
        const sourceText = this.node.range.source.text;
        const currentLine = this.node.range.source.lineAt(this.node.range.start);
        if (currentLine <= 1)
            return DEFAULT_CATCH_MASK;
        const lines = sourceText.split(/\r?\n/);
        const directiveLine = lines[currentLine - 2];
        if (!directiveLine)
            return DEFAULT_CATCH_MASK;
        const match = directiveLine.trim().match(/^\/\/ @try-as: (throw|abort|unreachable)(,(throw|abort|unreachable))*$/);
        if (!match)
            return DEFAULT_CATCH_MASK;
        let mask = 0;
        for (const kind of directiveLine.trim().slice("// @try-as: ".length).split(",")) {
            mask |= CATCH_KIND_MASK[kind];
        }
        return mask || DEFAULT_CATCH_MASK;
    }
    generate() {
        for (const exception of this.exceptions) {
            exception.generate();
        }
        for (const tri of this.tries) {
            tri.generate();
        }
        const tryRange = this.node.bodyStatements.length ? new Range(this.node.bodyStatements[0].range.start, this.node.bodyStatements[this.node.bodyStatements.length - 1].range.end) : this.node.range;
        this.tryBlock = Node.createDoStatement(Node.createBlockStatement([...cloneNode(this.node.bodyStatements)], tryRange), Node.createFalseExpression(this.node.range), tryRange);
        if (DEBUG > 0)
            console.log(indent +
                "Try Block/Loop: " +
                toString(this.tryBlock)
                    .split("\n")
                    .join("\n" + indent));
        if (this.node.catchStatements?.length) {
            const catchRange = new Range(this.node.catchStatements[0].range.start, this.node.catchStatements[this.node.catchStatements.length - 1].range.end);
            const catchVar = Node.createVariableStatement(null, [Node.createVariableDeclaration(this.node.catchVariable, null, 16, null, Node.createNewExpression(Node.createSimpleTypeName("__Exception", this.node.range), null, [Node.createPropertyAccessExpression(Node.createIdentifierExpression("__ExceptionState", this.node.range), Node.createIdentifierExpression("Type", this.node.range), this.node.range)], this.node.range), this.node.range)], this.node.range);
            const stateReset = Node.createExpressionStatement(Node.createUnaryPostfixExpression(88, Node.createPropertyAccessExpression(Node.createIdentifierExpression("__ExceptionState", this.node.range), Node.createIdentifierExpression("Failures", this.node.range), this.node.range), this.node.range));
            const catchCondition = Node.createCallExpression(Node.createPropertyAccessExpression(Node.createIdentifierExpression("__ExceptionState", this.node.range), Node.createIdentifierExpression("shouldCatch", this.node.range), this.node.range), null, [SimpleParser.parseExpression("<i32>" + this.catchMask.toString())], this.node.range);
            this.catchBlock = Node.createIfStatement(catchCondition, Node.createBlockStatement([catchVar, stateReset, ...cloneNode(this.node.catchStatements)], this.node.range), null, this.node.range);
            if (DEBUG > 0)
                console.log(indent +
                    "Catch Block: " +
                    toString(this.catchBlock)
                        .split("\n")
                        .join("\n" + indent));
        }
        if (this.node.finallyStatements) {
            this.finallyBlock = Node.createBlockStatement(cloneNode(this.node.finallyStatements), this.node.range);
            if (DEBUG > 0)
                console.log(indent +
                    "Finally Block: " +
                    toString(this.finallyBlock)
                        .split("\n")
                        .join("\n" + indent));
        }
        replaceRef(this.node, [this.tryBlock, this.catchBlock, this.finallyBlock].filter((v) => v != null), this.ref);
    }
    update(ref) {
        this.node = ref.node;
        this.ref = ref.ref;
        this.tryBlock = ref.tryBlock;
        this.catchBlock = ref.catchBlock;
        this.finallyBlock = ref.finallyBlock;
        return this;
    }
}
//# sourceMappingURL=tryref.js.map