import { Visitor } from "../lib/visitor.js";
import {
  Node,
  CallExpression,
  IdentifierExpression,
  FunctionDeclaration,
  ReturnStatement,
  Token,
  Statement,
  BlockStatement,
  BreakStatement,
  DoStatement,
  NodeKind,
  NewExpression,
  PropertyAccessExpression,
  IfStatement,
  ThrowStatement,
  Program,
} from "assemblyscript/dist/assemblyscript.js";
import {
  cloneNode,
  getFnName,
  removeExtension,
  replaceAfter,
  replaceRef,
  stripExpr,
} from "../utils.js";
import { FunctionData, FunctionLinker } from "./function.js";
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
  public exception: CallExpression | ThrowStatement;
  public parent: FunctionDeclaration | DoStatement | null;
  constructor(
    exception: CallExpression | ThrowStatement,
    parent: FunctionDeclaration | DoStatement | null = null,
  ) {
    this.exception = exception;
    this.parent = parent;
  }
}

export class ExceptionLinker extends Visitor {
  static SN: ExceptionLinker = new ExceptionLinker();

  public program!: Program;
  public baseDir!: string;

  public changed: boolean = false;
  public fn: FunctionDeclaration | null = null;
  public loop: DoStatement | null = null;

  public exceptions: ExceptionParent[] = [];

  public baseException: boolean = false;

  public imports: Set<string> = new Set<string>();

  public linked: Set<string> = new Set<string>();

  visitCallExpression(
    node: CallExpression,
    ref: Node | Node[] | null = null,
  ): void {
    const fnName =
      node.expression.kind == NodeKind.Identifier
        ? (node.expression as IdentifierExpression).text
        : (node.expression as PropertyAccessExpression).property.text;

    if (reservedFns.includes(fnName)) return;

    if (fnName == "abort" || fnName == "unreachable") {
      // if (fnName == "abort") this.addImport(new Set<string>(["__AbortState"]), node.range.source); else this.addImport(new Set<string>(["__UnreachableState"]), node.range.source);

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

      // if (linkedFn.name.text != "parse") {
      //   console.log("Skipping function: " + linkedFn.name.text);
      //   console.log("Imported: " + linked.imported);
      //   return;
      // }

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

        // console.log("from: " + fromPath);
        // console.log("to: " + toPath);
        // console.log("base: " + baseDir);
        // console.log("pkg: " + pkgPath);

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

        // console.log("rel path: " + relPath)

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
      // @ts-expect-error
      if (!this.fn && remainingStmts != -1 && remainingStmts < ref.length) {
        // this.addImport(new Set<string>(["__ExceptionState"]), node.range.source)
        const errorCheck = Node.createIfStatement(
          Node.createUnaryPrefixExpression(
            Token.Exclamation,
            Node.createPropertyAccessExpression(
              Node.createIdentifierExpression("__ExceptionState", node.range),
              Node.createIdentifierExpression("Failed", node.range),
              node.range,
            ),
            node.range,
          ),
          Node.createBlockStatement(
            (ref as Statement[]).slice(remainingStmts + 1),
            node.range,
          ),
          null,
          node.range,
        );
        // if (DEBUG) console.log("Error Check:" + toString(errorCheck));
        super.visitBlockStatement(
          errorCheck.ifTrue as BlockStatement,
          errorCheck,
        );
        replaceAfter(node, [overrideCall, errorCheck], ref);
      } else {
        const breaker = this.getBreaker(node, this.fn);
        const unrollStmt = Node.createIfStatement(
          Node.createBinaryExpression(
            Token.Equals_Equals,
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
          // @ts-ignore
          cloneNode(linkedBody),
          linkedFn.arrowKind,
          linkedFn.range,
        );

        linked.linked = true;
        this.linked.add(linkedFn.name.text);
        // console.log("Set Fn " + overrideFn.name.text);
        const lastFn = this.fn;
        this.fn = overrideFn;
        // console.log("Release Fn " + overrideFn.name.text)
        // if (DEBUG) console.log("Linked Fn: " + toString(overrideFn));
        // console.log(toString(this.currentSource))
        // console.log("Visit Override Fn: " + "__try_" + linkedFn.name.text);
        super.visit(overrideFn, ref);
        this.fn = lastFn;
        replaceRef(linkedFn, [linkedFn, overrideFn], linked.ref);
        // console.log(toString(linkedFn.range.source))
      }

      if (DEBUG) console.log("Link: " + toString(overrideCall));
    }
    super.visitCallExpression(node, ref);
  }
  visitThrowStatement(node: ThrowStatement, ref?: Node | Node[] | null): void {
    const value = node.value as NewExpression;
    if (
      value.kind != NodeKind.New ||
      (value as NewExpression).typeName.identifier.text != "Error"
    )
      throw new Error(
        "__Exception handling only supports throwing Error classes",
      );

    // this.addImport(new Set<string>(["__ErrorState"]), node.range.source);
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

    // console.log("Fn (Throw): " + toString(this.fn));
    const breaker = this.getBreaker(node, this.fn);
    // console.log("Breaker (Throw): " + toString(breaker));
    if (!Array.isArray(ref))
      replaceRef(
        node,
        Node.createBlockStatement([newThrow, breaker], node.range),
        ref,
      );
    else replaceRef(node, [newThrow, breaker], ref);
  }
  visitFunctionDeclaration(
    node: FunctionDeclaration,
    isDefault?: boolean,
    ref?: Node | Node[] | null,
  ): void {
    // if (DEBUG) console.log("Set Fn " + node.name.text);
    const lastFn = this.fn;
    this.fn = node;
    super.visit(node.body, node);
    // if (DEBUG) console.log("Release Fn " + node.name.text)
    this.fn = lastFn;
    super.visit(node.name, node);
    super.visit(node.decorators, node);
    super.visit(node.typeParameters, node);
    super.visit(node.signature, node);
  }
  getBreaker(
    node: Node,
    parent: FunctionDeclaration | null = null,
  ): ReturnStatement | BreakStatement | IfStatement | null {
    let breakStmt: ReturnStatement | BreakStatement | IfStatement | null =
      Node.createReturnStatement(null, node.range);

    if (!this.fn) {
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
                  Token.Bar_Bar,
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

  static replace(node: Node | Node[]): void {
    const source = Array.isArray(node)
      ? node[0]?.range.source
      : node.range.source;

    ExceptionLinker.SN.fn = null;
    ExceptionLinker.SN.currentSource = source;

    if (ExceptionLinker.SN.currentSource.internalPath !== source.internalPath) {
      ExceptionLinker.SN.imports = new Set<string>();
      ExceptionLinker.SN.exceptions = [];
      ExceptionLinker.SN.baseException = false;
    }
    ExceptionLinker.SN.visit(node);
  }
}

function calcPath(from: string, toName: string): string {
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
