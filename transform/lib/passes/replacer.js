import { Node } from "assemblyscript/dist/assemblyscript.js";
import { Visitor } from "../lib/visitor.js";
import { indent } from "../globals/indent.js";
import { replaceRef } from "../utils.js";
import { toString } from "../lib/util.js";
const rawValue = process.env["DEBUG"];
const DEBUG = rawValue == "true" ? 1 : rawValue == "false" || rawValue == "" ? 0 : isNaN(Number(rawValue)) ? 0 : Number(rawValue);
export class ThrowReplacer extends Visitor {
    visitThrowStatement(node, ref = null) {
        if (node.value.kind != 6)
            return super.visitThrowStatement(node, ref);
        console.log(indent + "Found ThrowStatement " + toString(node));
        const value = node.value;
        const newThrow = Node.createIfStatement(Node.createBinaryExpression(97, Node.createCallExpression(Node.createIdentifierExpression("isDefined", node.range), null, [
            Node.createIdentifierExpression(value.text + ".__IS_EXCEPTION_TYPE", node.range)
        ], node.range), Node.createCallExpression(Node.createIdentifierExpression("isDefined", node.range), null, [
            Node.createIdentifierExpression(value.text + ".rethrow", node.range)
        ], node.range), node.range), Node.createCallExpression(Node.createPropertyAccessExpression(node.value, Node.createIdentifierExpression("rethrow", node.range), node.range), null, [], node.range), Node.createThrowStatement(node.value, node.range), node.range);
        replaceRef(node, [newThrow], ref);
        console.log(toString(newThrow));
    }
    static replace(sources) {
        for (const source of sources) {
            new ThrowReplacer().visit(source);
        }
    }
}
//# sourceMappingURL=replacer.js.map