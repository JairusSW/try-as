import { Node } from "assemblyscript/dist/assemblyscript.js";
import { getBreaker, getFnName, replaceRef } from "../utils.js";
import { toString } from "../lib/util.js";
import { indent } from "../globals/indent.js";
import { BaseRef } from "./baseref.js";
const rawValue = process.env["DEBUG"];
const DEBUG = rawValue === "true" ? 1 : rawValue === "false" || rawValue === "" ? 0 : isNaN(Number(rawValue)) ? 0 : Number(rawValue);
export class ExceptionRef extends BaseRef {
    node;
    ref;
    parentFn = null;
    generated = false;
    constructor(node, ref) {
        super();
        this.node = node;
        this.ref = ref;
    }
    generate() {
        if (this.generated)
            return;
        this.generated = true;
        if (this.node.kind == 9) {
            const node = this.node;
            const fnName = getFnName(node.expression);
            const newException = fnName == "abort"
                ? Node.createExpressionStatement(Node.createCallExpression(Node.createPropertyAccessExpression(Node.createIdentifierExpression("__AbortState", node.range), Node.createIdentifierExpression("abort", node.range), node.range), null, node.args, node.range))
                : Node.createExpressionStatement(Node.createCallExpression(Node.createPropertyAccessExpression(Node.createIdentifierExpression("__UnreachableState", node.range), Node.createIdentifierExpression("unreachable", node.range), node.range), null, node.args, node.range));
            const breaker = getBreaker(node, this.parentFn?.node);
            if (DEBUG > 0)
                console.log(indent + "Added Exception: " + toString(newException));
            replaceRef(this.node, [newException, breaker], this.ref);
        }
        else if (this.node.kind == 45) {
            const node = this.node;
            if (node.value.kind != 17 || toString(node.value.typeName) != "Error")
                throw new Error("Unsupported Throw: " + toString(node));
            const value = node.value;
            const newException = Node.createExpressionStatement(Node.createCallExpression(Node.createPropertyAccessExpression(Node.createIdentifierExpression("__ErrorState", node.range), Node.createIdentifierExpression("error", node.range), node.range), null, value.args, node.range));
            const breaker = getBreaker(node, this.parentFn?.node);
            if (DEBUG > 0)
                console.log(indent + "Added Exception: " + toString(newException));
            replaceRef(this.node, [newException, breaker], this.ref);
        }
    }
    update(ref) {
        this.node = ref.node;
        this.ref = ref.ref;
        return this;
    }
}
//# sourceMappingURL=exceptionref.js.map