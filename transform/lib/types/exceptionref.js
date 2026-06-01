import { Node } from "assemblyscript/dist/assemblyscript.js";
import { NodeKind } from "../types.js";
import { cloneNode, getBreaker, getBreakerValue, getName, isRefStatement, replaceRef } from "../utils.js";
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
        this.name = node.kind == NodeKind.Call ? "abort" : "throw";
    }
    generate() {
        if (!this.hasException)
            return;
        if (this.generated)
            return;
        this.generated = true;
        if (this.node.kind == NodeKind.Call) {
            const node = this.node;
            const fnName = getName(node.expression);
            const stateCall = fnName == "abort" ? Node.createCallExpression(Node.createPropertyAccessExpression(Node.createIdentifierExpression("__AbortState", node.range), Node.createIdentifierExpression("abort", node.range), node.range), null, node.args, node.range) : Node.createCallExpression(Node.createPropertyAccessExpression(Node.createIdentifierExpression("__UnreachableState", node.range), Node.createIdentifierExpression("unreachable", node.range), node.range), null, node.args, node.range);
            const newException = Node.createExpressionStatement(stateCall);
            const breaker = getBreaker(node, this.parent?.node);
            if (DEBUG > 0)
                console.log(indent + "Added Exception: " + toString(newException));
            const refNode = Array.isArray(this.ref) ? null : this.ref;
            const isReturnValue = refNode != null && refNode.kind == NodeKind.Return && refNode.value == this.node;
            if (isRefStatement(node, this.ref) && !isReturnValue) {
                replaceRef(this.node, [newException, breaker], this.ref);
            }
            else {
                const value = getBreakerValue(node, this.parent?.node ?? null);
                if (value)
                    replaceRef(this.node, Node.createCommaExpression([stateCall, value], node.range), this.ref);
                else
                    replaceRef(this.node, stateCall, this.ref);
            }
        }
        else if (this.node.kind == NodeKind.Throw) {
            const node = this.node;
            const newException = Node.createExpressionStatement(Node.createCallExpression(Node.createPropertyAccessExpression(Node.createIdentifierExpression("__ErrorState", node.range), Node.createIdentifierExpression("error", node.range), node.range), null, [cloneNode(node.value), Node.createStringLiteralExpression(node.range.source.normalizedPath, node.range), Node.createIntegerLiteralExpression(i64_new(node.range.source.lineAt(node.range.start)), node.range), Node.createIntegerLiteralExpression(i64_new(node.range.source.columnAt()), node.range)], node.range));
            const breaker = getBreaker(node, this.parent?.node);
            if (DEBUG > 0)
                console.log(indent + "Added Exception: " + toString(newException));
            if (isRefStatement(node, this.ref))
                replaceRef(this.node, [newException, breaker], this.ref);
            else
                replaceRef(this.node, newException, this.ref);
        }
    }
    update(ref) {
        this.node = ref.node;
        this.ref = ref.ref;
        return this;
    }
}
