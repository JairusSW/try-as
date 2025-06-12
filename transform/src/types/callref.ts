import { CallExpression, IdentifierExpression, Node, NodeKind, PropertyAccessExpression, Token } from "assemblyscript/dist/assemblyscript.js";
import { FunctionRef } from "./functionref.js";
import { blockify, getBreaker, getFnName } from "../utils.js";
import { indent } from "../globals/indent.js";

export class CallRef {
  public node: CallExpression;
  public ref: Node | Node[] | null;
  public calling: FunctionRef;
  public name: string;

  public parentFn: FunctionRef | null = null
  constructor(node: CallExpression, ref: Node | Node[] | null, calling: FunctionRef) {
    this.node = node;
    this.ref = ref;
    this.calling = calling;
    this.name = getFnName(node.expression);
  }
  generate(): void {
    const breaker = getBreaker(this.node, this.parentFn?.node);

    const newName = this.node.expression.kind == NodeKind.PropertyAccess
      ? Node.createPropertyAccessExpression(
        (this.node.expression as PropertyAccessExpression).expression,
        Node.createIdentifierExpression("__try_" + (this.node.expression as PropertyAccessExpression).property.text, this.node.range),
        this.node.range
      )
      :
      Node.createIdentifierExpression("__try_" + (this.node.expression as IdentifierExpression).text, this.node.range);

    const unrollCheck = Node.createIfStatement(
      Node.createBinaryExpression(
        Token.GreaterThan,
        Node.createPropertyAccessExpression(
          Node.createIdentifierExpression("__ExceptionState", this.node.range),
          Node.createIdentifierExpression("Failures", this.node.range),
          this.node.range
        ),
        Node.createIntegerLiteralExpression(i64_zero, this.node.range),
        this.node.range
      ),
      blockify(breaker),
      null,
      this.node.range
    );

    const overrideCall = Node.createExpressionStatement(
      Node.createCallExpression(
        newName,
        this.node.typeArguments,
        this.node.args,
        this.node.range
      )
    );

    console.log(indent + "Replaced call: " + getFnName(newName));
    // replaceRef(this.node, [unrollCheck, overrideCall], this.ref);
  }
}