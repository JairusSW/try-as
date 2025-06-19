import { Node } from "assemblyscript/dist/assemblyscript.js";
import { Visitor } from "./lib/visitor.js";
import { CallRef, FunctionRef, Try, LoopRef } from "./transform.js";
import {
  blockify,
  getBreaker,
  getFnName,
  hasBaseException,
  replaceRef,
  stripExpr,
} from "./utils.js";
import { SimpleParser, toString } from "./lib/util.js";
export var PassKind;
(function (PassKind) {
  PassKind[(PassKind["Collect"] = 0)] = "Collect";
  PassKind[(PassKind["Link"] = 1)] = "Link";
})(PassKind || (PassKind = {}));
export class Linker extends Visitor {
  static SN = new Linker();
  pass = PassKind.Collect;
  callStack = [];
  calls = [];
  path = [];
  foundException = false;
  searching = false;
  fn = null;
  loop = null;
  src;
  visitFunctionDeclaration(node, isDefault, ref) {
    if (this.pass == PassKind.Link) {
      const oldFn = this.fn;
      const oldLoop = this.loop;
      this.fn = new FunctionRef(node, [], ref);
      if (this.loop) this.loop = null;
      super.visitFunctionDeclaration(node, isDefault, ref);
      this.loop = oldLoop;
      this.fn = oldFn;
      return;
    }
    if (this.pass != PassKind.Collect) return;
    if (!node.body) return;
    const fnRef = new FunctionRef(node, [], ref);
    if (node.flags & 2) fnRef.exported = true;
    if (hasBaseException(node.body.statements)) fnRef.hasException = true;
    super.visit(node.body, node);
    if (Globals.foundException) {
      fnRef.hasException = true;
      Try.SN.addFnRef(node.range.source, fnRef, false);
      console.log(
        "Added Function: " +
          (this.path.length ? this.path.join(".") + "." : "") +
          node.name.text +
          " from " +
          node.range.source.internalPath,
      );
      if (!this.searching) Globals.foundException = false;
    }
  }
  visitCallExpression(_node, ref) {
    if (this.pass == PassKind.Collect) {
      const fnName = getFnName(_node.expression, this.path);
      if (fnName == "unreachable" || fnName == "abort") {
        Globals.foundException = true;
        return;
      }
      const callRef = new CallRef(_node, ref, this.path.slice());
      this.calls.push(callRef);
      return;
    }
    if (this.pass != PassKind.Link) return;
    let fnName = getFnName(_node.expression, this.path);
    if (fnName == "unreachable" || fnName == "abort") {
      this.replaceExceptionCall(_node, ref);
      return;
    }
    const node = this.calls.find((c) => c.node == _node)?.node;
    if (!node) return;
    fnName = getFnName(node.expression, this.path);
    let isExact = false;
    let fnRef = Try.SN.getFnByName(node.range.source, fnName);
    if (!fnRef) {
      const possibleSource = this.src.imports.find((v) => {
        for (const dec of v.declarations) {
          if (fnName == dec.name.text) isExact = true;
          if (fnName.includes(dec.name.text)) return v;
        }
        return null;
      });
      if (possibleSource) {
        console.log(
          "Found imported function: " +
            fnName +
            " in " +
            possibleSource.internalPath,
        );
        console.log(
          "Sources: " +
            Try.SN.sources.map((v) => v.source.internalPath).join(" "),
        );
        fnRef = Try.SN.getFnByName(possibleSource.internalPath, fnName);
        console.log("FnRef: ");
      }
    }
    if (!fnRef) return;
    const callRef = new CallRef(node, ref, this.path.slice());
    if (fnRef.callers.find((c) => c.node == node)) return;
    fnRef.callers.push(callRef);
    console.log("Added Call: " + fnRef.node.name.text);
    const overrideCall = Node.createExpressionStatement(
      Node.createCallExpression(
        fnRef.path
          ? SimpleParser.parseExpression(
              getFnName("__try_" + fnRef.name, fnRef.path),
            )
          : Node.createIdentifierExpression(
              getFnName("__try_" + fnRef.node.name.text),
              node.expression.range,
            ),
        node.typeArguments,
        node.args,
        node.range,
      ),
    );
    replaceRef(node, overrideCall, ref);
    super.visit(node.args, node);
    super.visit(fnRef.node, fnRef.ref);
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
    const breaker = getBreaker(node, this.fn?.node);
    console.log("New Exception: " + toString(newException));
    replaceRef(node, [newException, breaker], ref);
  }
  visitNamespaceDeclaration(node, isDefault, ref) {
    this.path.push(node.name.text);
    super.visitNamespaceDeclaration(node, isDefault, ref);
    const index = this.path.lastIndexOf(node.name.text);
    if (index != -1) {
      this.path.splice(index, 1);
    }
  }
  visitClassDeclaration(node, isDefault, ref) {
    super.visit(node.name, node);
    super.visit(node.decorators, node);
    if (
      node.isGeneric ? node.typeParameters != null : node.typeParameters == null
    ) {
      super.visit(node.typeParameters, node);
      super.visit(node.extendsType, node);
      super.visit(node.implementsTypes, node);
      this.path.push(node.name.text);
      this.visit(node.members, node);
      const index = this.path.lastIndexOf(node.name.text);
      if (index != -1) {
        this.path.splice(index, 1);
      }
    } else {
      throw new Error(
        "Expected to type parameters to match class declaration, but found type mismatch instead!",
      );
    }
  }
  visitWhileStatement(node, ref) {
    const oldLoop = this.loop;
    this.loop = new LoopRef(node, ref);
    super.visitWhileStatement(node, ref);
    this.loop = oldLoop;
  }
  visitDoStatement(node, ref) {
    const oldLoop = this.loop;
    this.loop = new LoopRef(node, ref);
    super.visitDoStatement(node, ref);
    this.loop = oldLoop;
  }
  visitForOfStatement(node, ref) {
    const oldLoop = this.loop;
    this.loop = new LoopRef(node, ref);
    super.visitForOfStatement(node, ref);
    this.loop = oldLoop;
  }
  visitForStatement(node, ref) {
    const oldLoop = this.loop;
    this.loop = new LoopRef(node, ref);
    super.visitForStatement(node, ref);
    this.loop = oldLoop;
  }
  visitSource(node, ref) {
    this.pass = PassKind.Collect;
    super.visitSource(node, ref);
  }
  static visitSource(node) {
    Linker.SN.visitSource(node);
  }
  static runPass(pass, source) {
    if (pass == PassKind.Collect) {
      Linker.collect(source);
    } else if (pass == PassKind.Link) {
      Linker.link(source);
    }
  }
  static collect(source) {
    Linker.SN.pass = PassKind.Collect;
    Linker.SN.visitSource(source);
  }
  static link(source) {
    Linker.SN.pass = PassKind.Link;
    const src = Try.SN.sources.find(
      (v) => v.source.internalPath == source.internalPath,
    );
    Linker.SN.src = src;
    if (!src) return;
    for (const exception of src.exceptions) {
      exception.generate();
      Linker.SN.fn = exception.fn;
      Linker.SN.loop = exception.loop;
      Linker.SN.path = exception.path;
      Linker.SN.visit(exception.tryBlock, exception.node);
      Linker.SN.fn = exception.fn;
      Linker.SN.loop = exception.loop;
      Linker.SN.path = exception.path;
      Linker.SN.visit(exception.catchBlock, exception.node);
      Linker.SN.fn = exception.fn;
      Linker.SN.loop = exception.loop;
      Linker.SN.path = exception.path;
      Linker.SN.visit(exception.finallyBlock, exception.node);
    }
    for (const fn of src.functions) {
      console.log("Overriding Function: " + fn.node.name.text);
      const breaker = getBreaker(fn.node, fn.node);
      const unrollCheck = Node.createIfStatement(
        Node.createBinaryExpression(
          73,
          Node.createPropertyAccessExpression(
            Node.createIdentifierExpression("__ExceptionState", fn.node.range),
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
        [unrollCheck, ...blockify(fn.node.body).statements],
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
      replaceRef(fn.node, [fn.node, overrideFn], fn.ref);
    }
  }
}
//# sourceMappingURL=linker.js.map
