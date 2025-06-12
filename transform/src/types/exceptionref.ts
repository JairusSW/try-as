import { CallExpression, NewExpression, Node, NodeKind, ThrowStatement } from "assemblyscript/dist/assemblyscript.js";
import { FunctionRef } from "./functionref.js";
import { getBreaker, getFnName, replaceRef } from "../utils.js";
import { toString } from "../lib/util.js";
import { indent } from "../globals/indent.js";
import { BaseRef } from "./baseref.js";

export class ExceptionRef extends BaseRef {
  public node: CallExpression | ThrowStatement;
  public ref: Node | Node[] | null;

  public parentFn: FunctionRef | null = null;

  private generated: boolean = false;
  constructor(node: CallExpression | ThrowStatement, ref: Node | Node[] | null) {
    super();
    this.node = node;
    this.ref = ref;
  }
  generate(): void {
    if (this.generated) return;
    this.generated = true;

    if (this.node.kind == NodeKind.Call) {
      const node = this.node as CallExpression;
      const fnName = getFnName(node.expression);
      const newException = fnName == "abort"
        ? Node.createExpressionStatement(
          Node.createCallExpression(
            Node.createPropertyAccessExpression(
              Node.createIdentifierExpression("__AbortState", node.range),
              Node.createIdentifierExpression("abort", node.range),
              node.range),
            null,
            node.args,
            node.range
          )
        )
        : Node.createExpressionStatement(
          Node.createCallExpression(
            Node.createPropertyAccessExpression(
              Node.createIdentifierExpression("__UnreachableState", node.range),
              Node.createIdentifierExpression("unreachable", node.range),
              node.range
            ),
            null,
            node.args,
            node.range
          )
        );

      const breaker = getBreaker(node, this.parentFn?.node);

      console.log(indent + "Added Exception: " + toString(newException));
      replaceRef(this.node, [newException, breaker], this.ref);
    } else if (this.node.kind == NodeKind.Throw) {
      const node = this.node as ThrowStatement;
      if (node.value.kind != NodeKind.New || toString((node.value as NewExpression).typeName) != "Error") throw new Error("Unsupported Throw: " + toString(node));
      const value = node.value as NewExpression;
      const newException = Node.createExpressionStatement(
        Node.createCallExpression(
          Node.createPropertyAccessExpression(
            Node.createIdentifierExpression("__ErrorState", node.range),
            Node.createIdentifierExpression("error", node.range),
            node.range),
          null,
          value.args,
          node.range
        )
      );

      const breaker = getBreaker(node, this.parentFn?.node);
      console.log(indent + "Added Exception: " + toString(newException));
      replaceRef(this.node, [newException, breaker], this.ref);
    }
  }
  update(ref: this): this {
    this.node = ref.node;
    this.ref = ref.ref;
    return this;
  }
}