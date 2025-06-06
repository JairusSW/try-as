import { Node } from "assemblyscript/dist/assemblyscript.js";
import { Visitor } from "./lib/visitor.js";
import { Try } from "./transform.js";
import {
  blockify,
  getBreaker,
  getFnName,
  replaceRef,
  stripExpr,
} from "./utils.js";
import { SimpleParser, toString } from "./lib/util.js";
export class Linker extends Visitor {
  static SN = new Linker();
  visitCallExpression(node, ref) {
    const fnName = getFnName(node.expression);
    if (fnName == "unreachable" || fnName == "abort") {
      this.replaceExceptionCall(node, ref);
      return;
    }
    const linkedFn = Try.SN.getFnByNameNoPath(node.range.source, fnName);
    if (!linkedFn) return;
    console.log("Need to link function: " + fnName);
    const overrideCall = Node.createExpressionStatement(
      Node.createCallExpression(
        linkedFn.path
          ? SimpleParser.parseExpression(
              getFnName("__try_" + linkedFn.name, linkedFn.path),
            )
          : Node.createIdentifierExpression(
              getFnName("__try_" + linkedFn.node.name.text),
              node.expression.range,
            ),
        node.typeArguments,
        node.args,
        node.range,
      ),
    );
    replaceRef(node, overrideCall, ref);
  }
  replaceExceptionCall(node, ref) {
    console.log("Replacing Exception Call: " + toString(node));
    const fnName = getFnName(node.expression);
    const newException =
      fnName == "abort"
        ? Node.createExpressionStatement(
            Node.createCallExpression(
              Node.createPropertyAccessExpression(
                Node.createIdentifierExpression("__AbortState", node.range),
                Node.createIdentifierExpression("abort", node.range),
                node.range,
              ),
              null,
              node.args,
              node.range,
            ),
          )
        : Node.createExpressionStatement(
            Node.createCallExpression(
              Node.createPropertyAccessExpression(
                Node.createIdentifierExpression(
                  "__UnreachableState",
                  node.range,
                ),
                Node.createIdentifierExpression("unreachable", node.range),
                node.range,
              ),
              null,
              node.args,
              node.range,
            ),
          );
    console.log("New Exception: " + toString(newException));
    replaceRef(node, newException, ref);
  }
  static link() {
    for (const source of Try.SN.sources) {
      for (const exception of source.exceptions) {
        exception.generate();
        Linker.SN.visit([
          exception.tryBlock,
          exception.catchBlock,
          exception.finallyBlock,
        ]);
      }
      for (const fn of source.functions) {
        if (!fn.hasException) continue;
        console.log("Overriding Function: " + fn.node.name.text);
        const breaker = getBreaker(fn.node, fn.node);
        const unrollCheck = Node.createIfStatement(
          Node.createBinaryExpression(
            73,
            Node.createPropertyAccessExpression(
              Node.createIdentifierExpression(
                "__ExceptionState",
                fn.node.range,
              ),
              Node.createIdentifierExpression("Failures", fn.node.range),
              fn.node.range,
            ),
            Node.createIntegerLiteralExpression(i64_zero, fn.node.range),
            fn.node.range,
          ),
          blockify(breaker),
          null,
          fn.node.range,
        );
        const newBody = Node.createBlockStatement(
          [unrollCheck, ...blockify(fn.node.body).statements, breaker],
          fn.node.range,
        );
        const overrideFn = Node.createFunctionDeclaration(
          Node.createIdentifierExpression(
            "__try_" + fn.node.name.text,
            fn.node.name.range,
          ),
          fn.node.decorators,
          fn.node.flags,
          fn.node.typeParameters,
          fn.node.signature,
          newBody,
          fn.node.arrowKind,
          fn.node.range,
        );
        for (let i = 0; i < newBody.statements.length; i++) {
          const stmt = stripExpr(newBody.statements[i]);
          if (stmt.kind == 9) {
            const call = stmt;
            const callName = getFnName(call.expression);
            console.log(callName);
            if (callName == "abort" || callName == "unreachable") {
              console.log("Found top level abort");
              if (i < newBody.statements.length - 2) {
                replaceRef(stmt, [stmt, unrollCheck], newBody.statements);
              }
            }
            if (fn.callers.find((c) => c.node == call)) {
              console.log("Found caller in base function: " + toString(call));
            }
          }
        }
        Linker.SN.visit(overrideFn);
        for (const caller of fn.callers) {
          console.log("Linking Caller: " + getFnName(caller.node.expression));
          Linker.SN.visit(caller.node, caller.ref);
        }
        replaceRef(fn.node, [fn.node, overrideFn], fn.ref);
      }
    }
  }
}
//# sourceMappingURL=linker.old.js.map
