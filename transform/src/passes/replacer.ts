import { ExpressionStatement, IdentifierExpression, Node, NodeKind, ParenthesizedExpression, PropertyAccessExpression, Source, TernaryExpression, ThrowStatement, Token } from "assemblyscript/dist/assemblyscript.js";

import { Visitor } from "../lib/visitor.js";
import { RangeTransform } from "../lib/range.js";
import { indent } from "../globals/indent.js";
import { cloneNode, isRefStatement, replaceRef } from "../utils.js";
import { SimpleParser, toString } from "../lib/util.js";
import { CallExpression } from "types:assemblyscript/src/ast";
import { Globals } from "../globals/globals.js";

const rawValue = process.env["DEBUG"];
const DEBUG = rawValue == "true" ? 1 : rawValue == "false" || rawValue == "" ? 0 : isNaN(Number(rawValue)) ? 0 : Number(rawValue);

export class ThrowReplacer extends Visitor {
  public source!: Source;
  visitCallExpression(node: CallExpression, ref?: Node | Node[] | null): void {
    if (node.expression.kind != NodeKind.PropertyAccess) return super.visitCallExpression(node, ref);
    const [call, name] = toString(node.expression).split(".");
    if (!name) return super.visitCallExpression(node, ref);
    const methRef = Globals.methods.find(x => x.hasException && x.name == name && node.args.length == x.node.signature.parameters.length);
    if (!methRef) return super.visitCallExpression(node, ref);

    super.visitCallExpression(node, ref);

    const newName = Node.createPropertyAccessExpression(
      (node.expression as PropertyAccessExpression).expression,
      cloneNode((node.expression as PropertyAccessExpression).property),
      node.range
    );

    newName.property.text = "__try_" + newName.property.text;

    let newCall = Node.createParenthesizedExpression(
      Node.createTernaryExpression(
        Node.createCallExpression(
          Node.createIdentifierExpression("isDefined", node.range),
          null,
          [
            newName
          ],
          node.range
        ),
        Node.createCallExpression(
          Node.createPropertyAccessExpression(
            Node.createIdentifierExpression(call, node.range),
            Node.createIdentifierExpression("__try_" + name, node.range),
            node.range
          ),
          null,
          node.args,
          node.range
        ),
        cloneNode(node),
        node.range
      ),
      node.range
    )

    // console.log("New Call: " + toString(newCall));
    replaceRef(node, newCall, ref);
  }
  visitExpressionStatement(node: ExpressionStatement, ref?: Node | Node[] | null): void {
    if (node.expression.kind != NodeKind.Call) return super.visitExpressionStatement(node, ref);
    return this.visitCallExpression(node.expression as CallExpression, node);
  }
  visitThrowStatement(node: ThrowStatement, ref: Node | Node[] | null = null): void {
    if (node.value.kind != NodeKind.Identifier) return super.visitThrowStatement(node, ref);
    super.visitThrowStatement(node, ref);
    // console.log(indent + "Found ThrowStatement " + toString(node));

    const value = node.value as IdentifierExpression;
    const newThrow = Node.createIfStatement(
      Node.createBinaryExpression(
        Token.Ampersand_Ampersand,
        Node.createCallExpression(
          Node.createIdentifierExpression("isDefined", node.range),
          null,
          [
            Node.createIdentifierExpression(value.text + ".__IS_EXCEPTION_TYPE", node.range)
          ],
          node.range
        ),
        Node.createCallExpression(
          Node.createIdentifierExpression("isDefined", node.range),
          null,
          [
            Node.createIdentifierExpression(value.text + ".rethrow", node.range)
          ],
          node.range
        ),
        node.range
      ),
      Node.createCallExpression(
        Node.createPropertyAccessExpression(
          node.value,
          Node.createIdentifierExpression("rethrow", node.range),
          node.range
        ),
        null,
        [],
        node.range
      ),
      Node.createThrowStatement(
        node.value,
        node.range
      ),
      node.range
    );

    replaceRef(node, [newThrow], ref);
    // console.log(toString(newThrow))
  }
  static replace(sources: Source[]): void {
    const replacer = new ThrowReplacer();
    for (const source of sources) {
      replacer.source = source;
      replacer.visit(source);
    }
  }
}
