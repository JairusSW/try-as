import { Node } from "assemblyscript/dist/assemblyscript.js";
import { Visitor } from "../lib/visitor.js";
import { indent } from "../globals/indent.js";
import { replaceRef } from "../utils.js";
import { toString } from "../lib/util.js";
const rawValue = process.env["DEBUG"];
const DEBUG = rawValue === "true" ? 1 : rawValue === "false" || rawValue === "" ? 0 : isNaN(Number(rawValue)) ? 0 : Number(rawValue);
export class ThrowReplacer extends Visitor {
    visitThrowStatement(node, ref = null) {
        if (node.value.kind != 17 && node.value.kind != 6 && node.value.kind != 21)
            return super.visitThrowStatement(node, ref);
        console.log(indent + "Found ThrowStatement " + toString(node));
        const newThrow = Node.createExpressionStatement(Node.createIfStatement(Node.createBinaryExpression(97, Node.createParenthesizedExpression(Node.createBinaryExpression(98, Node.createCallExpression(Node.createIdentifierExpression("isManaged", node.range), null, [node.value], node.range), Node.createCallExpression(Node.createIdentifierExpression("isReference", node.range), null, [node.value], node.range), node.range), node.range), Node.createInstanceOfExpression(node.value, Node.createNamedType(Node.createSimpleTypeName("__Exception", node.range), null, false, node.range), node.range), node.range), Node.createCallExpression(Node.createPropertyAccessExpression(node.value, Node.createIdentifierExpression("rethrow", node.range), node.range), null, [], node.range), node, node.range));
        replaceRef(node, newThrow, ref);
        console.log(toString(newThrow));
        super.visitThrowStatement(node, ref);
    }
}
//# sourceMappingURL=replacer.js.map