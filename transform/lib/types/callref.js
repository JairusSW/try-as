import { Node } from "assemblyscript/dist/assemblyscript.js";
import { blockify, getBreaker, getFnName, replaceRef } from "../utils.js";
import { indent } from "../globals/indent.js";
import { toString } from "../lib/util.js";
import { BaseRef } from "./baseref.js";
const rawValue = process.env["DEBUG"];
const DEBUG = rawValue === "true" ? 1 : rawValue === "false" || rawValue === "" ? 0 : isNaN(Number(rawValue)) ? 0 : Number(rawValue);
export class CallRef extends BaseRef {
    node;
    ref;
    calling;
    name;
    parentFn = null;
    generated = false;
    constructor(node, ref, calling) {
        super();
        this.node = node;
        this.ref = ref;
        this.calling = calling;
        this.name = getFnName(node.expression);
    }
    generate() {
        if (this.generated)
            return;
        this.generated = true;
        const breaker = getBreaker(this.node, this.parentFn?.node);
        const newName = this.node.expression.kind == 21 ? Node.createPropertyAccessExpression(this.node.expression.expression, Node.createIdentifierExpression((this.calling.tries.length ? "" : "__try_") + this.node.expression.property.text, this.node.range), this.node.range) : Node.createIdentifierExpression((this.calling.tries.length ? "" : "__try_") + this.node.expression.text, this.node.range);
        const unrollCheck = Node.createIfStatement(Node.createBinaryExpression(73, Node.createPropertyAccessExpression(Node.createIdentifierExpression("__ExceptionState", this.node.range), Node.createIdentifierExpression("Failures", this.node.range), this.node.range), Node.createIntegerLiteralExpression(i64_zero, this.node.range), this.node.range), blockify(breaker), null, this.node.range);
        const overrideCall = Node.createExpressionStatement(Node.createCallExpression(newName, this.node.typeArguments, this.node.args, this.node.range));
        if (DEBUG > 0)
            console.log(indent + "Replaced call: " + toString(this.node));
        replaceRef(this.node, [overrideCall, unrollCheck], this.ref);
    }
    update(ref) {
        this.node = ref.node;
        this.ref = ref.ref;
        return this;
    }
}
//# sourceMappingURL=callref.js.map