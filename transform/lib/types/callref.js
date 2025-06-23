import { Node } from "assemblyscript/dist/assemblyscript.js";
import { addAfter, blockify, getBreaker, getName, isRefStatement } from "../utils.js";
import { indent } from "../globals/indent.js";
import { toString } from "../lib/util.js";
import { BaseRef } from "./baseref.js";
const rawValue = process.env["DEBUG"];
const DEBUG = rawValue == "true" ? 1 : rawValue == "false" || rawValue == "" ? 0 : isNaN(Number(rawValue)) ? 0 : Number(rawValue);
export class CallRef extends BaseRef {
    node;
    ref;
    source;
    calling;
    name;
    parent;
    generated = false;
    constructor(node, ref, calling, source, parent) {
        super();
        this.node = node;
        this.ref = ref;
        this.calling = calling;
        this.source = source;
        this.parent = parent;
        this.name = getName(node.expression);
    }
    generate() {
        if (!this.hasException)
            return;
        if (this.generated)
            return;
        this.generated = true;
        const breaker = getBreaker(this.node, this.parent?.node);
        if (this.node.expression.kind == 21 && !this.node.expression.property.text.startsWith("__try_")) {
            this.node.expression.property.text = (this.calling.tries.length ? "" : "__try_") + this.node.expression.property.text;
        }
        else if (!this.node.expression.text.startsWith("__try_")) {
            this.node.expression.text = (this.calling.tries.length ? "" : "__try_") + this.node.expression.text;
        }
        else {
            return;
        }
        const unrollCheck = Node.createIfStatement(Node.createBinaryExpression(73, Node.createPropertyAccessExpression(Node.createIdentifierExpression("__ExceptionState", this.node.range), Node.createIdentifierExpression("Failures", this.node.range), this.node.range), Node.createIntegerLiteralExpression(i64_zero, this.node.range), this.node.range), blockify(breaker), null, this.node.range);
        if (DEBUG > 0)
            console.log(indent + "Replaced call: " + toString(this.node));
        if (isRefStatement(this.node, this.ref))
            addAfter(this.node, unrollCheck, this.ref);
    }
    update(ref) {
        this.node = ref.node;
        this.ref = ref.ref;
        return this;
    }
}
//# sourceMappingURL=callref.js.map