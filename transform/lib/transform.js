import { Node, } from "assemblyscript/dist/assemblyscript.js";
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
    program;
    baseDir;
    searching = false;
    foundExceptions = [];
    overrideFns = [];
    baseStatements = [];
    foundTry = false;
    visitTryStatement(node, ref) {
        this.foundTry = true;
        this.baseStatements = node.bodyStatements;
        if (DEBUG)
            console.log("Found try: " + toString(node));
        this.foundExceptions = [];
        let tryBlock;
        let catchBlock;
        let finallyBlock;
        const beforeTry = Node.createExpressionStatement(Node.createBinaryExpression(101, Node.createPropertyAccessExpression(Node.createIdentifierExpression("__ExceptionState", node.range), Node.createIdentifierExpression("Failed", node.range), node.range), Node.createFalseExpression(node.range), node.range));
        tryBlock = hasOnlyCalls(node.bodyStatements)
            ? Node.createBlockStatement([beforeTry, ...node.bodyStatements], node.range)
            : Node.createDoStatement(Node.createBlockStatement([beforeTry, ...node.bodyStatements], node.range), Node.createFalseExpression(node.range), node.range);
        ExceptionLinker.replace(tryBlock);
        if (DEBUG)
            console.log("Try Block/Loop: " + toString(tryBlock));
        if (node.catchStatements?.length) {
            const catchVar = Node.createVariableStatement(null, [
                Node.createVariableDeclaration(node.catchVariable, null, 16, null, Node.createNewExpression(Node.createSimpleTypeName("__Exception", node.range), null, [
                    Node.createPropertyAccessExpression(Node.createIdentifierExpression("__ExceptionState", node.range), Node.createIdentifierExpression("Type", node.range), node.range),
                ], node.range), node.range),
            ], node.range);
            catchBlock = Node.createIfStatement(Node.createPropertyAccessExpression(Node.createIdentifierExpression("__ExceptionState", node.range), Node.createIdentifierExpression("Failed", node.range), node.range), Node.createBlockStatement([catchVar, ...node.catchStatements, beforeTry], node.range), null, node.range);
            if (DEBUG)
                console.log("Catch Block: " + toString(catchBlock));
        }
        if (node.finallyStatements) {
            finallyBlock = Node.createBlockStatement(node.finallyStatements, node.range);
            if (DEBUG)
                console.log("Finally Block: " + toString(finallyBlock));
        }
        replaceRef(node, [tryBlock, catchBlock, finallyBlock].filter((v) => v != null), ref);
        super.visit([tryBlock, catchBlock, finallyBlock]);
    }
    visitThrowStatement(node, ref) {
        this.foundTry = true;
        super.visitThrowStatement(node, ref);
    }
    visitCallExpression(node, ref) {
        const fnName = node.expression.kind == 6
            ? node.expression.text
            : node.expression.property.text;
        if (fnName == "abort" || fnName == "unreachable")
            this.foundTry = true;
        super.visitCallExpression(node, ref);
    }
    visitSource(node) {
        super.visitSource(node);
        if (this.foundTry) {
            this.foundTry = false;
            this.addImport([
                "__AbortState",
                "__Exception",
                "__ExceptionState",
                "__ErrorState",
                "__UnreachableState",
            ], node);
        }
    }
    addImport(imports, source) {
        const baseDir = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..");
        const pkgPath = path.join(process.cwd(), this.baseDir, "node_modules");
        let fromPath = source.normalizedPath;
        let toPath = path.join(baseDir, "assembly", "types");
        fromPath = fromPath.startsWith("~lib/")
            ? fs.existsSync(path.join(pkgPath, fromPath.slice(5, fromPath.indexOf("/", 5))))
                ? path.join(pkgPath, fromPath.slice(5))
                : fromPath
            : path.join(process.cwd(), fromPath);
        for (const i of imports) {
            let file = "";
            if (i == "__AbortState") {
                file = "abort";
            }
            else if (i == "__ExceptionState" || i == "__Exception") {
                file = "exception";
            }
            else if (i == "__ErrorState") {
                file = "error";
            }
            else if (i == "__UnreachableState") {
                file = "unreachable";
            }
            else {
                continue;
            }
            let relPath = removeExtension(path.posix.join(...path
                .relative(path.dirname(fromPath), path.join(toPath, file))
                .split(path.sep)));
            if (relPath.includes("node_modules" + path.sep + "as-try"))
                relPath =
                    "as-try" +
                        relPath.slice(relPath.indexOf("node_modules" + path.sep + "as-try") + 19);
            if (!relPath.startsWith(".") &&
                !relPath.startsWith("/") &&
                !relPath.startsWith("as-try")) {
                relPath = "./" + relPath;
            }
            const importStmt = Node.createImportStatement([
                Node.createImportDeclaration(Node.createIdentifierExpression(i, source.range), null, source.range),
            ], Node.createStringLiteralExpression(relPath, source.range), source.range);
            source.statements.unshift(importStmt);
            if (DEBUG)
                console.log("Import: " + toString(importStmt) + " at " + source.internalPath);
        }
    }
}
//# sourceMappingURL=transform.js.map