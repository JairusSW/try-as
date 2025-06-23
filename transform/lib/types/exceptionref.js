import { Node } from "assemblyscript/dist/assemblyscript.js";
import { getBreaker, getName, isRefStatement, replaceRef } from "../utils.js";
import { toString } from "../lib/util.js";
import { indent } from "../globals/indent.js";
import { BaseRef } from "./baseref.js";
const rawValue = process.env["DEBUG"];
const DEBUG = rawValue == "true" ? 1 : rawValue == "false" || rawValue == "" ? 0 : isNaN(Number(rawValue)) ? 0 : Number(rawValue);
export class ExceptionRef extends BaseRef {
    node;
    ref;
    source;
    name;
    parent = null;
    generated = false;
    hasException = true;
    constructor(node, ref, source, parent) {
        super();
        this.node = node;
        this.ref = ref;
        this.source = source;
        this.parent = parent;
        this.name = node.kind == 9 ? "abort" : "throw";
    }
    generate() {
        if (!this.hasException)
            return;
        if (this.generated)
            return;
        this.generated = true;
        if (this.node.kind == 9) {
            const node = this.node;
            const fnName = getName(node.expression);
            const newException = fnName == "abort" ? Node.createExpressionStatement(Node.createCallExpression(Node.createPropertyAccessExpression(Node.createIdentifierExpression("__AbortState", node.range), Node.createIdentifierExpression("abort", node.range), node.range), null, node.args, node.range)) : Node.createExpressionStatement(Node.createCallExpression(Node.createPropertyAccessExpression(Node.createIdentifierExpression("__UnreachableState", node.range), Node.createIdentifierExpression("unreachable", node.range), node.range), null, node.args, node.range));
            const breaker = getBreaker(node, this.parent?.node);
            if (DEBUG > 0)
                console.log(indent + "Added Exception: " + toString(newException));
            if (isRefStatement(node, this.ref))
                replaceRef(this.node, [newException, breaker], this.ref);
            else
                replaceRef(this.node, newException, this.ref);
        }
        else if (this.node.kind == 45) {
            const node = this.node;
            let newException;
            if (node.value.kind == 17) {
                const value = node.value;
                newException = Node.createExpressionStatement(Node.createCallExpression(Node.createPropertyAccessExpression(Node.createIdentifierExpression("__ErrorState", node.range), Node.createIdentifierExpression("error", node.range), node.range), null, [value, Node.createStringLiteralExpression(node.range.source.normalizedPath, node.range), Node.createFloatLiteralExpression(node.range.source.lineAt(node.range.start), node.range), Node.createFloatLiteralExpression(node.range.source.columnAt(), node.range)], node.range));
                const breaker = getBreaker(node, this.parent?.node);
                if (DEBUG > 0)
                    console.log(indent + "Added Exception: " + toString(newException));
                if (isRefStatement(node, this.ref))
                    replaceRef(this.node, [newException, breaker], this.ref);
                else
                    replaceRef(this.node, newException, this.ref);
            }
        }
    }
    update(ref) {
        this.node = ref.node;
        this.ref = ref.ref;
        return this;
    }
}
//# sourceMappingURL=exceptionref.js.map