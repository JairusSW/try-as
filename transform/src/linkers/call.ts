import { Visitor } from "../lib/visitor.js";
import {
  Node,
  CallExpression,
  IdentifierExpression,
  Statement,
  NodeKind,
  PropertyAccessExpression,
  BlockStatement,
  ExpressionStatement,
} from "assemblyscript/dist/assemblyscript.js";
import { FunctionLinker } from "./function.js";
import { toString } from "../lib/util.js";

const reservedFns = ["changetype", "__new", "__renew", "__link"];
export class CallLinker extends Visitor {
  static SN: CallLinker = new CallLinker();
  public ignoredCalls: CallExpression[] = [];
  public hasException: boolean = false;
  visitCallExpression(
    node: CallExpression,
    ref: Node | Node[] | null = null,
  ): void {
    const fnName =
      node.expression.kind == NodeKind.Identifier
        ? (node.expression as IdentifierExpression).text
        : (node.expression as PropertyAccessExpression).property.text;

    if (
      reservedFns.includes(fnName) ||
      toString(node.expression).startsWith("__try_")
    ) {
      super.visitCallExpression(node, ref);
      return;
    }

    const linked = FunctionLinker.getFunction(node.expression);
    if (!linked) {
      super.visitCallExpression(node, ref);
      return;
    }
    this.hasException = true;
  }
  static hasException(body: Statement | Statement[]): boolean {
    if (!body) return false;
    if (!Array.isArray(body)) {
      if (body.kind == NodeKind.Block)
        body = (body as BlockStatement).statements;
      else body = [body];
    }
    CallLinker.SN.visit(body);
    const hasException = CallLinker.SN.hasException;
    CallLinker.SN.hasException = false;
    CallLinker.SN.ignoredCalls = [];
    return hasException;
  }
}
