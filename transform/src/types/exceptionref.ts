import { CallExpression, ExpressionStatement, NewExpression, Node, NodeKind, ThrowStatement } from "assemblyscript/dist/assemblyscript.js";
import { FunctionRef } from "./functionref.js";
import { getBreaker, getFnName, isRefStatement, replaceRef } from "../utils.js";
import { toString } from "../lib/util.js";
import { indent } from "../globals/indent.js";
import { BaseRef } from "./baseref.js";

const rawValue = process.env["DEBUG"];
const DEBUG = rawValue === "true" ? 1 : rawValue === "false" || rawValue === "" ? 0 : isNaN(Number(rawValue)) ? 0 : Number(rawValue);

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
      console.log(indent + "Is Statement: " + isRefStatement(node, this.ref));
      const fnName = getFnName(node.expression);
      const newException = fnName == "abort" ? Node.createExpressionStatement(Node.createCallExpression(Node.createPropertyAccessExpression(Node.createIdentifierExpression("__AbortState", node.range), Node.createIdentifierExpression("abort", node.range), node.range), null, node.args, node.range)) : Node.createExpressionStatement(Node.createCallExpression(Node.createPropertyAccessExpression(Node.createIdentifierExpression("__UnreachableState", node.range), Node.createIdentifierExpression("unreachable", node.range), node.range), null, node.args, node.range));

      const breaker = getBreaker(node, this.parentFn?.node);

      if (DEBUG > 0) console.log(indent + "Added Exception: " + toString(newException));
      if (isRefStatement(node, this.ref)) replaceRef(this.node, [newException, breaker], this.ref);
      else replaceRef(this.node, newException, this.ref);
    } else if (this.node.kind == NodeKind.Throw) {
      const node = this.node as ThrowStatement;
      let newException: ExpressionStatement;
      if (node.value.kind == NodeKind.New) {
        const value = node.value as NewExpression;
        newException = Node.createExpressionStatement(
          Node.createCallExpression(
            Node.createPropertyAccessExpression(
              Node.createIdentifierExpression("__ErrorState", node.range),
              Node.createIdentifierExpression("error", node.range),
              node.range
            ),
            null,
            [
              value,
              Node.createStringLiteralExpression(
                node.range.source.normalizedPath,
                node.range
              ),
              Node.createFloatLiteralExpression(
                node.range.source.lineAt(node.range.start),
                node.range
              ),
              Node.createFloatLiteralExpression(
                node.range.source.columnAt(),
                node.range
              )
            ],
            node.range
          )
        );
      }
      const breaker = getBreaker(node, this.parentFn?.node);
      if (DEBUG > 0) console.log(indent + "Added Exception: " + toString(newException));
      if (isRefStatement(node, this.ref)) replaceRef(this.node, [newException, breaker], this.ref);
      else replaceRef(this.node, newException, this.ref);
    }
  }
  update(ref: this): this {
    this.node = ref.node;
    this.ref = ref.ref;
    return this;
  }
}