import { IdentifierExpression, Node, NodeKind,Source,ThrowStatement, Token } from "assemblyscript/dist/assemblyscript.js";

import { Visitor } from "../lib/visitor.js";
import { indent } from "../globals/indent.js";
import { replaceRef } from "../utils.js";
import { toString } from "../lib/util.js";

const rawValue = process.env["DEBUG"];
const DEBUG = rawValue === "true" ? 1 : rawValue === "false" || rawValue === "" ? 0 : isNaN(Number(rawValue)) ? 0 : Number(rawValue);

export class ThrowReplacer extends Visitor {
  visitThrowStatement(node: ThrowStatement, ref: Node | Node[] | null = null): void {
    if (node.value.kind != NodeKind.Identifier) return super.visitThrowStatement(node, ref);
    console.log(indent + "Found ThrowStatement " + toString(node));

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
    console.log(toString(newThrow))
    // super.visitThrowStatement(newThrow, ref);
  }
  static replace(sources: Source[]): void {
    for (const source of sources) {
      new ThrowReplacer().visit(source);
    }
  }
}
