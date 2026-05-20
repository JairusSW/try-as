import { Node } from "assemblyscript/dist/assemblyscript.js";
import { addAfter, blockify, cloneNode, getBreaker, getName, isRefStatement, replaceCallWithIsDefinedIf } from "../utils.js";
import { indent } from "../globals/indent.js";
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
    inInlineBuiltinArg = false;
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
        if (this.inInlineBuiltinArg)
            return;
        const breaker = getBreaker(this.node, this.parent?.node);
        const range = this.node.range;
        const expr = this.node.expression;
        let originalName = "";
        let isPropertyAccess = false;
        if (expr.kind == 22) {
            const propAccess = expr;
            if (propAccess.property.text.startsWith("__try_"))
                return;
            originalName = propAccess.property.text;
            isPropertyAccess = true;
        }
        else if (expr.kind == 7) {
            const ident = expr;
            if (ident.text.startsWith("__try_"))
                return;
            originalName = ident.text;
        }
        else {
            return;
        }
        if (this.calling.tries.length)
            return;
        const decorators = this.calling.node.decorators;
        if (decorators) {
            for (const dec of decorators) {
                if (dec.name.kind == 7 && dec.name.text == "inline")
                    return;
            }
        }
        const renamedName = "__try_" + originalName;
        const originalCallClone = cloneNode(this.node);
        if (isPropertyAccess) {
            this.node.expression.property.text = renamedName;
        }
        else {
            this.node.expression.text = renamedName;
        }
        let isDefinedArg;
        if (isPropertyAccess) {
            const propAccess = this.node.expression;
            isDefinedArg = Node.createPropertyAccessExpression(cloneNode(propAccess.expression), Node.createIdentifierExpression(renamedName, range), range);
        }
        else {
            isDefinedArg = Node.createIdentifierExpression(renamedName, range);
        }
        const unrollCheck = Node.createIfStatement(Node.createBinaryExpression(73, Node.createPropertyAccessExpression(Node.createIdentifierExpression("__ExceptionState", range), Node.createIdentifierExpression("Failures", range), range), Node.createIntegerLiteralExpression(i64_zero, range), range), blockify(breaker), null, range);
        const wasStatement = isRefStatement(this.node, this.ref);
        if (wasStatement)
            addAfter(this.node, unrollCheck, this.ref);
        const placedAsIf = replaceCallWithIsDefinedIf(this.node, isDefinedArg, this.node, originalCallClone, this.ref);
        if (placedAsIf) {
            if (DEBUG > 0)
                console.log(indent + "Replaced call with isDefined-if for " + originalName);
            return;
        }
        if (DEBUG > 0)
            console.log(indent + "Kept rename (expression position) for " + originalName + " -> " + renamedName);
    }
    update(ref) {
        this.node = ref.node;
        this.ref = ref.ref;
        return this;
    }
}
