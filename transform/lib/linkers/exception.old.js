import { Visitor } from "../lib/visitor.js";
import { Node } from "assemblyscript/dist/assemblyscript.js";
import {
  cloneNode,
  getFnName,
  removeExtension,
  replaceRef,
  stripExpr,
} from "../utils.js";
import { FunctionLinker } from "./function.old.js";
import { SimpleParser, toString } from "../lib/util.js";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";
const reservedFns = ["changetype", "__new", "__renew", "__link"];
const DEBUG = process.env["DEBUG"]
  ? process.env["DEBUG"] == "true"
    ? true
    : false
  : false;
export class ExceptionParent {
  exception;
  parent;
  constructor(exception, parent = null) {
    this.exception = exception;
    this.parent = parent;
  }
}
export class ExceptionLinker extends Visitor {
  static SN = new ExceptionLinker();
  program;
  baseDir;
  changed = false;
  fn = null;
  loop = null;
  exceptions = [];
  baseException = false;
  imports = new Set();
  linked = new Set();
  visitCallExpression(node, ref = null) {
    const fnName =
      node.expression.kind == 6
        ? node.expression.text
        : node.expression.property.text;
    if (reservedFns.includes(fnName)) return;
    if (fnName == "abort" || fnName == "unreachable") {
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
      const breakerStmt = this.getBreaker(node, this.fn);
      if (!Array.isArray(ref))
        replaceRef(
          node,
          Node.createBlockStatement([newException, breakerStmt], node.range),
          ref,
        );
      else replaceRef(node, [newException, breakerStmt], ref);
    } else {
      const linked = FunctionLinker.getFunction(node.expression);
      if (!linked) return;
      const linkedFn = linked.node;
      if (linked.imported && !linked.path) {
        const baseDir = path.join(process.cwd(), this.baseDir);
        const pkgPath = path.join(baseDir, "node_modules");
        let fromPath = node.range.source.normalizedPath;
        let toPath = linkedFn.range.source.normalizedPath;
        toPath = toPath.startsWith("~lib/")
          ? existsSync(
              path.join(pkgPath, toPath.slice(5, toPath.indexOf("/", 5))),
            )
            ? path.join(pkgPath, toPath.slice(5))
            : toPath
          : path.join(baseDir, toPath);
        fromPath = fromPath.startsWith("~lib/")
          ? existsSync(
              path.join(pkgPath, fromPath.slice(5, fromPath.indexOf("/", 5))),
            )
            ? path.join(pkgPath, fromPath.slice(5))
            : fromPath
          : path.join(baseDir, fromPath);
        let relPath = removeExtension(
          path.posix.join(
            ...path.relative(path.dirname(fromPath), toPath).split(path.sep),
          ),
        );
        if (
          !relPath.startsWith(".") &&
          !relPath.startsWith("/") &&
          !relPath.startsWith("try-as")
        ) {
          relPath = "./" + relPath;
        }
        const importStmt = Node.createImportStatement(
          [
            Node.createImportDeclaration(
              Node.createIdentifierExpression(
                "__try_" + linkedFn.name.text,
                node.range,
              ),
              null,
              node.range,
            ),
          ],
          Node.createStringLiteralExpression(relPath, node.range),
          node.range,
        );
        if (!this.imports.has("__try_" + linkedFn.name.text))
          node.range.source.statements.unshift(importStmt);
        this.imports.add("__try_" + linkedFn.name.text);
        if (DEBUG)
          console.log(
            "Import (call): " +
              toString(importStmt) +
              " at " +
              node.range.source.internalPath,
          );
      }
      const overrideCall = Node.createExpressionStatement(
        Node.createCallExpression(
          linked.path
            ? SimpleParser.parseExpression(
                getFnName(
                  "__try_" + linkedFn.name.text,
                  linked.path ? Array.from(linked.path.keys()) : null,
                ),
              )
            : Node.createIdentifierExpression(
                getFnName("__try_" + linkedFn.name.text),
                node.expression.range,
              ),
          node.typeArguments,
          node.args,
          node.range,
        ),
      );
      const remainingStmts = Array.isArray(ref)
        ? ref.findIndex((v) => stripExpr(v) == stripExpr(node))
        : -1;
      if (!this.fn && remainingStmts != -1 && remainingStmts < ref.length) {
        const errorCheck = Node.createIfStatement(
          Node.createUnaryPrefixExpression(
            95,
            Node.createPropertyAccessExpression(
              Node.createIdentifierExpression("__ExceptionState", node.range),
              Node.createIdentifierExpression("Failed", node.range),
              node.range,
            ),
            node.range,
          ),
          Node.createBlockStatement(ref.slice(remainingStmts + 1), node.range),
          null,
          node.range,
        );
        super.visitBlockStatement(errorCheck.ifTrue, errorCheck);
      } else {
        console.log("Fn: " + toString(this.fn));
        console.log("Loop: " + toString(this.loop));
        const breaker = this._getBreaker(node, null);
        const unrollStmt = Node.createIfStatement(
          Node.createBinaryExpression(
            76,
            Node.createPropertyAccessExpression(
              Node.createIdentifierExpression(
                "__ExceptionState",
                linkedFn.range,
              ),
              Node.createIdentifierExpression("Failed", linkedFn.range),
              linkedFn.range,
            ),
            Node.createTrueExpression(linkedFn.range),
            linkedFn.range,
          ),
          breaker,
          null,
          linkedFn.range,
        );
        replaceRef(node, [overrideCall, unrollStmt], ref);
        if (DEBUG)
          console.log(
            "Unroll Check: " + toString(unrollStmt) + "\nin\n" + toString(ref),
          );
      }
      if (!linked.linked && !this.linked.has(linkedFn.name.text)) {
        const linkedBody = linkedFn.body;
        const overrideFn = Node.createFunctionDeclaration(
          Node.createIdentifierExpression(
            "__try_" + linkedFn.name.text,
            linkedFn.name.range,
          ),
          linkedFn.decorators,
          linkedFn.flags,
          linkedFn.typeParameters,
          linkedFn.signature,
          cloneNode(linkedBody),
          linkedFn.arrowKind,
          linkedFn.range,
        );
        linked.linked = true;
        this.linked.add(linkedFn.name.text);
        const lastFn = this.fn;
        this.fn = overrideFn;
        super.visit(overrideFn, ref);
        this.fn = lastFn;
        replaceRef(linkedFn, [linkedFn, overrideFn], linked.ref);
      }
      if (DEBUG) console.log("Link: " + toString(overrideCall));
    }
    super.visitCallExpression(node, ref);
  }
  visitThrowStatement(node, ref) {
    const value = node.value;
    if (value.kind != 17 || value.typeName.identifier.text != "Error")
      throw new Error(
        "__Exception handling only supports throwing Error classes",
      );
    const newThrow = Node.createExpressionStatement(
      Node.createCallExpression(
        Node.createPropertyAccessExpression(
          Node.createIdentifierExpression("__ErrorState", node.range),
          Node.createIdentifierExpression("error", node.range),
          node.range,
        ),
        null,
        value.args,
        node.range,
      ),
    );
    const breaker = this.getBreaker(node, this.fn);
    if (!Array.isArray(ref))
      replaceRef(
        node,
        Node.createBlockStatement([newThrow, breaker], node.range),
        ref,
      );
    else replaceRef(node, [newThrow, breaker], ref);
  }
  visitFunctionDeclaration(node, isDefault, ref) {
    const lastFn = this.fn;
    this.fn = node;
    this.visit(node.body, node);
    this.fn = lastFn;
    super.visit(node.name, node);
    super.visit(node.decorators, node);
    super.visit(node.typeParameters, node);
    super.visit(node.signature, node);
  }
  visitDoStatement(node, ref) {
    console.log("Enter Do Statement...");
    const fn = this.fn;
    if (this.fn) this.fn = null;
    this.loop = node;
    super.visit(node.condition, node);
    super.visit(node.body, node);
    this.fn = fn;
    console.log("Exit Do Statement...");
  }
  visit(node, ref = null) {
    const fn = this.fn;
    const lp = this.loop;
    if (node == null) return;
    if (node instanceof Array) {
      for (const n of node) {
        this._visit(n, node);
      }
    } else {
      this._visit(node, ref);
    }
  }
  _getBreaker(node, parentFn = null) {
    let breakStmt = Node.createBreakStatement(null, node.range);
    if (parentFn) {
      const returnType = toString(parentFn.signature.returnType);
      if (DEBUG)
        console.log(
          "Return Type: " + returnType + " derived from " + parentFn.name.text,
        );
      if (returnType != "void" && returnType != "never") {
        breakStmt = Node.createIfStatement(
          Node.createCallExpression(
            Node.createIdentifierExpression("isBoolean", node.range),
            [parentFn.signature.returnType],
            [],
            node.range,
          ),
          Node.createReturnStatement(
            Node.createFalseExpression(node.range),
            node.range,
          ),
          Node.createIfStatement(
            Node.createCallExpression(
              Node.createIdentifierExpression("isInteger", node.range),
              [parentFn.signature.returnType],
              [],
              node.range,
            ),
            Node.createReturnStatement(
              Node.createIntegerLiteralExpression(i64_zero, node.range),
              node.range,
            ),
            Node.createIfStatement(
              Node.createCallExpression(
                Node.createIdentifierExpression("isFloat", node.range),
                [parentFn.signature.returnType],
                [],
                node.range,
              ),
              Node.createFloatLiteralExpression(0, node.range),
              Node.createIfStatement(
                Node.createBinaryExpression(
                  98,
                  Node.createCallExpression(
                    Node.createIdentifierExpression("isManaged", node.range),
                    [parentFn.signature.returnType],
                    [],
                    node.range,
                  ),
                  Node.createCallExpression(
                    Node.createIdentifierExpression("isUnmanaged", node.range),
                    [parentFn.signature.returnType],
                    [],
                    node.range,
                  ),
                  node.range,
                ),
                Node.createReturnStatement(
                  Node.createCallExpression(
                    Node.createIdentifierExpression("changetype", node.range),
                    [parentFn.signature.returnType],
                    [Node.createIntegerLiteralExpression(i64_zero, node.range)],
                    node.range,
                  ),
                  node.range,
                ),
                Node.createReturnStatement(null, node.range),
                node.range,
              ),
              node.range,
            ),
            node.range,
          ),
          node.range,
        );
      } else {
        breakStmt = Node.createReturnStatement(null, node.range);
      }
    }
    if (DEBUG) console.log("Break: " + toString(breakStmt));
    return breakStmt;
  }
  getBreaker(node, parent = null) {
    let breakStmt = Node.createReturnStatement(null, node.range);
    if (this.loop) {
      breakStmt = Node.createBreakStatement(null, node.range);
      return breakStmt;
    }
    if (parent) {
      const returnType = toString(parent.signature.returnType);
      if (DEBUG)
        console.log(
          "Return Type: " + returnType + " derived from " + parent.name.text,
        );
      if (returnType != "void" && returnType != "never") {
        breakStmt = Node.createIfStatement(
          Node.createCallExpression(
            Node.createIdentifierExpression("isBoolean", node.range),
            [parent.signature.returnType],
            [],
            node.range,
          ),
          Node.createReturnStatement(
            Node.createFalseExpression(node.range),
            node.range,
          ),
          Node.createIfStatement(
            Node.createCallExpression(
              Node.createIdentifierExpression("isInteger", node.range),
              [parent.signature.returnType],
              [],
              node.range,
            ),
            Node.createReturnStatement(
              Node.createIntegerLiteralExpression(i64_zero, node.range),
              node.range,
            ),
            Node.createIfStatement(
              Node.createCallExpression(
                Node.createIdentifierExpression("isFloat", node.range),
                [parent.signature.returnType],
                [],
                node.range,
              ),
              Node.createFloatLiteralExpression(0, node.range),
              Node.createIfStatement(
                Node.createBinaryExpression(
                  98,
                  Node.createCallExpression(
                    Node.createIdentifierExpression("isManaged", node.range),
                    [parent.signature.returnType],
                    [],
                    node.range,
                  ),
                  Node.createCallExpression(
                    Node.createIdentifierExpression("isUnmanaged", node.range),
                    [parent.signature.returnType],
                    [],
                    node.range,
                  ),
                  node.range,
                ),
                Node.createReturnStatement(
                  Node.createCallExpression(
                    Node.createIdentifierExpression("changetype", node.range),
                    [parent.signature.returnType],
                    [Node.createIntegerLiteralExpression(i64_zero, node.range)],
                    node.range,
                  ),
                  node.range,
                ),
                Node.createReturnStatement(null, node.range),
                node.range,
              ),
              node.range,
            ),
            node.range,
          ),
          node.range,
        );
      } else {
        breakStmt = Node.createReturnStatement(null, node.range);
      }
    }
    if (DEBUG) console.log("Return: " + toString(breakStmt));
    return breakStmt;
  }
  static replace(node) {
    const source = Array.isArray(node)
      ? node[0]?.range.source
      : node.range.source;
    ExceptionLinker.SN.fn = null;
    ExceptionLinker.SN.currentSource = source;
    if (ExceptionLinker.SN.currentSource.internalPath != source.internalPath) {
      ExceptionLinker.SN.imports = new Set();
      ExceptionLinker.SN.exceptions = [];
      ExceptionLinker.SN.baseException = false;
    }
    ExceptionLinker.SN.visit(node);
  }
}
function calcPath(from, toName) {
  const thisFile = fileURLToPath(import.meta.url);
  const baseDir = path.resolve(thisFile, "..", "..", "..", "..");
  let relPath = path.posix
    .join(
      ...path
        .relative(
          path.dirname(from),
          path.join(baseDir, "assembly", "types", toName),
        )
        .split(path.sep),
    )
    .replace(/^.*node_modules\/try-as/, "try-as");
  if (
    !relPath.startsWith(".") &&
    !relPath.startsWith("/") &&
    !relPath.startsWith("try-as")
  ) {
    relPath = "./" + relPath;
  }
  return relPath;
}
//# sourceMappingURL=exception.old.js.map
