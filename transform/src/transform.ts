import {
  BlockStatement,
  CallExpression,
  CommonFlags,
  DoStatement,
  FunctionDeclaration,
  IdentifierExpression,
  IfStatement,
  Node,
  NodeKind,
  Program,
  PropertyAccessExpression,
  Source,
  ThrowStatement,
  Token,
  TryStatement,
} from "assemblyscript/dist/assemblyscript.js";
import { Visitor } from "./lib/visitor.js";
import { toString } from "./lib/util.js";
import { hasOnlyCalls, removeExtension, replaceRef } from "./utils.js";
import { ExceptionLinker } from "./linkers/exception.js";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const DEBUG = process.env["DEBUG"]
  ? process.env["DEBUG"] == "true"
    ? true
    : false
  : false;

export class TryTransform extends Visitor {
  public program!: Program;
  public baseDir!: string;

  public searching: boolean = false;
  public foundExceptions: Node[] = [];
  public overrideFns: FunctionDeclaration[] = [];
  public baseStatements: Node[] = [];

  public foundTry: boolean = false;
  visitTryStatement(node: TryStatement, ref?: Node | Node[] | null): void {
    this.foundTry = true;
    this.baseStatements = node.bodyStatements;
    if (DEBUG) console.log("Found try: " + toString(node));
    this.foundExceptions = [];

    let tryBlock: BlockStatement | DoStatement;
    let catchBlock: IfStatement;
    let finallyBlock: BlockStatement | DoStatement;

    const beforeTry = Node.createExpressionStatement(
      Node.createBinaryExpression(
        Token.Equals,
        Node.createPropertyAccessExpression(
          Node.createIdentifierExpression("__ExceptionState", node.range),
          Node.createIdentifierExpression("Failed", node.range),
          node.range,
        ),
        Node.createFalseExpression(node.range),
        node.range,
      ),
    );

    // if (DEBUG) console.log("Has Base Exception: " + hasBaseException)

    tryBlock = hasOnlyCalls(node.bodyStatements)
      ? Node.createBlockStatement(
          [beforeTry, ...node.bodyStatements],
          node.range,
        )
      : Node.createDoStatement(
          Node.createBlockStatement(
            [beforeTry, ...node.bodyStatements],
            node.range,
          ),
          Node.createFalseExpression(node.range),
          node.range,
        );

    ExceptionLinker.replace(tryBlock);

    if (DEBUG) console.log("Try Block/Loop: " + toString(tryBlock));

    if (node.catchStatements?.length) {
      // ExceptionLinker.SN.addImport(new Set<string>(["__ExceptionState", "__Exception"]), node.range.source);

      const catchVar = Node.createVariableStatement(
        null,
        [
          Node.createVariableDeclaration(
            node.catchVariable,
            null,
            CommonFlags.Let,
            null,
            Node.createNewExpression(
              Node.createSimpleTypeName("__Exception", node.range),
              null,
              [
                Node.createPropertyAccessExpression(
                  Node.createIdentifierExpression(
                    "__ExceptionState",
                    node.range,
                  ),
                  Node.createIdentifierExpression("Type", node.range),
                  node.range,
                ),
              ],
              node.range,
            ),
            node.range,
          ),
        ],
        node.range,
      );

      catchBlock = Node.createIfStatement(
        Node.createPropertyAccessExpression(
          Node.createIdentifierExpression("__ExceptionState", node.range),
          Node.createIdentifierExpression("Failed", node.range),
          node.range,
        ),
        Node.createBlockStatement(
          [catchVar, ...node.catchStatements, beforeTry],
          node.range,
        ),
        null,
        node.range,
      );

      if (DEBUG) console.log("Catch Block: " + toString(catchBlock));
    }

    if (node.finallyStatements) {
      finallyBlock = Node.createBlockStatement(
        node.finallyStatements,
        node.range,
      );

      if (DEBUG) console.log("Finally Block: " + toString(finallyBlock));
    }

    replaceRef(
      node,
      [tryBlock, catchBlock, finallyBlock].filter((v) => v != null),
      ref,
    );
    super.visit([tryBlock, catchBlock, finallyBlock]);
  }
  visitThrowStatement(node: ThrowStatement, ref?: Node | Node[] | null): void {
    this.foundTry = true;
    super.visitThrowStatement(node, ref);
  }
  visitCallExpression(node: CallExpression, ref?: Node | Node[] | null): void {
    const fnName =
      node.expression.kind == NodeKind.Identifier
        ? (node.expression as IdentifierExpression).text
        : (node.expression as PropertyAccessExpression).property.text;
    if (fnName == "abort" || fnName == "unreachable") this.foundTry = true;
    super.visitCallExpression(node, ref);
  }
  visitSource(node: Source): void {
    super.visitSource(node);
    if (this.foundTry) {
      // console.log("Found try: " + node.normalizedPath)
      this.foundTry = false;
      this.addImport(
        [
          "__AbortState",
          "__Exception",
          "__ExceptionState",
          "__ErrorState",
          "__UnreachableState",
        ],
        node,
      );
    }
    // if (DEBUG) console.log("Source: " + toString(node));
  }
  addImport(imports: string[], source: Source): void {
    const baseDir = path.resolve(
      fileURLToPath(import.meta.url),
      "..",
      "..",
      "..",
    );
    const pkgPath = path.join(process.cwd(), this.baseDir, "node_modules");
    let fromPath = source.normalizedPath;
    let toPath = path.join(baseDir, "assembly", "types");

    // console.log("exists: " + path.join(process.cwd(), fromPath));
    fromPath = fromPath.startsWith("~lib/")
      ? fs.existsSync(
          path.join(pkgPath, fromPath.slice(5, fromPath.indexOf("/", 5))),
        )
        ? path.join(pkgPath, fromPath.slice(5))
        : fromPath
      : path.join(process.cwd(), fromPath);

    // console.log("from: " + fromPath);
    // console.log("to: " + toPath);
    // console.log("base: " + baseDir);
    // console.log("pkg: " + pkgPath);

    for (const i of imports) {
      let file = "";
      if (i == "__AbortState") {
        file = "abort";
      } else if (i == "__ExceptionState" || i == "__Exception") {
        file = "exception";
      } else if (i == "__ErrorState") {
        file = "error";
      } else if (i == "__UnreachableState") {
        file = "unreachable";
      } else {
        continue;
      }

      let relPath = removeExtension(
        path.posix.join(
          ...path
            .relative(path.dirname(fromPath), path.join(toPath, file))
            .split(path.sep),
        ),
      );

      if (relPath.includes("node_modules" + path.sep + "try-as"))
        relPath =
          "try-as" +
          relPath.slice(
            relPath.indexOf("node_modules" + path.sep + "try-as") + 19,
          );
      // console.log("rel path: " + relPath)

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
            Node.createIdentifierExpression(i, source.range),
            null,
            source.range,
          ),
        ],
        Node.createStringLiteralExpression(relPath, source.range),
        source.range,
      );

      source.statements.unshift(importStmt);
      if (DEBUG)
        console.log(
          "Import: " + toString(importStmt) + " at " + source.internalPath,
        );
    }
  }
}
