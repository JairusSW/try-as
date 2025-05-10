import { Visitor } from "../lib/visitor.js";
import { FunctionLinker } from "./function.js";
import { toString } from "../lib/util.js";
const reservedFns = ["changetype", "__new", "__renew", "__link"];
export class CallLinker extends Visitor {
  static SN = new CallLinker();
  ignoredCalls = [];
  hasException = false;
  visitCallExpression(node, ref = null) {
    const fnName =
      node.expression.kind == 6
        ? node.expression.text
        : node.expression.property.text;
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
  static hasException(body) {
    if (!Array.isArray(body)) {
      if (body.kind == 30) body = body.statements;
      else body = [body];
    }
    CallLinker.SN.visit(body);
    const hasException = CallLinker.SN.hasException;
    CallLinker.SN.hasException = false;
    CallLinker.SN.ignoredCalls = [];
    return hasException;
  }
}
//# sourceMappingURL=call.js.map
