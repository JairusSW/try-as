import { Node } from "assemblyscript/dist/assemblyscript.js";
import { Visitor } from "../lib/visitor.js";
import { cloneNode, replaceRef } from "../utils.js";
import { toString } from "../lib/util.js";
import { Globals } from "../globals/globals.js";
const rawValue = process.env["DEBUG"];
const DEBUG = rawValue == "true" ? 1 : rawValue == "false" || rawValue == "" ? 0 : isNaN(Number(rawValue)) ? 0 : Number(rawValue);
export class ThrowReplacer extends Visitor {
    source;
    visitCallExpression(node, ref = null) {
        if (node.expression.kind != 21)
            return super.visitCallExpression(node, ref);
        const [call, name] = toString(node.expression).split(".");
        if (!name)
            return super.visitCallExpression(node, ref);
        const methRef = Globals.methods.find((x) => x.hasException && x.name == name && node.args.length == x.node.signature.parameters.length);
        if (!methRef)
            return super.visitCallExpression(node, ref);
        super.visitCallExpression(node, ref);
        const newName = Node.createPropertyAccessExpression(node.expression.expression, cloneNode(node.expression.property), node.range);
        newName.property.text = "__try_" + newName.property.text;
        let newCall = Node.createParenthesizedExpression(Node.createTernaryExpression(Node.createCallExpression(Node.createIdentifierExpression("isDefined", node.range), null, [newName], node.range), Node.createCallExpression(Node.createPropertyAccessExpression(Node.createIdentifierExpression(call, node.range), Node.createIdentifierExpression("__try_" + name, node.range), node.range), null, node.args, node.range), cloneNode(node), node.range), node.range);
        replaceRef(node, newCall, ref);
    }
    visitExpressionStatement(node, ref = null) {
        if (node.expression.kind != 9)
            return super.visitExpressionStatement(node, ref);
        return this.visitCallExpression(node.expression, node);
    }
    visitThrowStatement(node, ref = null) {
        if (node.value.kind != 6)
            return super.visitThrowStatement(node, ref);
        super.visitThrowStatement(node, ref);
        const value = node.value;
        const newThrow = Node.createIfStatement(Node.createBinaryExpression(97, Node.createCallExpression(Node.createIdentifierExpression("isDefined", node.range), null, [Node.createIdentifierExpression(value.text + ".__IS_EXCEPTION_TYPE", node.range)], node.range), Node.createCallExpression(Node.createIdentifierExpression("isDefined", node.range), null, [Node.createIdentifierExpression(value.text + ".rethrow", node.range)], node.range), node.range), Node.createCallExpression(Node.createPropertyAccessExpression(node.value, Node.createIdentifierExpression("rethrow", node.range), node.range), null, [], node.range), Node.createThrowStatement(node.value, node.range), node.range);
        replaceRef(node, [newThrow], ref);
    }
    static replace(sources) {
        const replacer = new ThrowReplacer();
        for (const source of sources) {
            replacer.source = source;
            replacer.visit(source);
        }
    }
}
//# sourceMappingURL=replacer.js.map