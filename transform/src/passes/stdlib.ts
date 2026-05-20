import { CommonFlags, FunctionDeclaration, MethodDeclaration, Node, Source, ThrowStatement } from "assemblyscript/dist/assemblyscript.js";
import { NodeKind } from "../types.js";
import { Visitor } from "../lib/visitor.js";
import { cloneNode, getBreaker, replaceRef } from "../utils.js";

type FnLike = FunctionDeclaration | MethodDeclaration;

export class StdlibThrowRewriter extends Visitor {
  private source: Source | null = null;
  private currentFn: FnLike | null = null;

  private isStdlibSource(path: string): boolean {
    if (!path.startsWith("~lib/")) return false;
    if (path.startsWith("~lib/rt")) return false;
    if (path.startsWith("~lib/performance")) return false;
    if (path.startsWith("~lib/wasi_")) return false;
    if (path.startsWith("~lib/shared/")) return false;
    if (path.startsWith("~lib/try-as/")) return false;
    return true;
  }

  visitSource(node: Source, ref: Node | Node[] | null = null): void {
    const lastSource = this.source;
    this.source = node;
    super.visitSource(node, ref);
    this.source = lastSource;
  }

  visitFunctionDeclaration(node: FunctionDeclaration, isDefault: boolean = false, ref: Node | Node[] | null = null): void {
    const lastFn = this.currentFn;
    this.currentFn = node;
    super.visitFunctionDeclaration(node, isDefault, ref);
    this.currentFn = lastFn;
  }

  visitMethodDeclaration(node: MethodDeclaration, ref: Node | Node[] | null = null): void {
    const lastFn = this.currentFn;
    this.currentFn = node;
    super.visitMethodDeclaration(node, ref);
    this.currentFn = lastFn;
  }

  visitThrowStatement(node: ThrowStatement, ref: Node | Node[] | null = null): void {
    super.visitThrowStatement(node, ref);

    if (!this.source || !this.currentFn || !this.isStdlibSource(this.source.internalPath)) return;
    // Skip constructors. The breaker emits typed default-value returns based
    // on parentFn.signature.returnType, which is synthetic / unprintable for
    // constructors and produces invalid `isBoolean<>()` calls. Use the flag
    // bit instead of `name.kind == Constructor` because the latter has been
    // flaky across AS releases.
    if (this.currentFn.flags & CommonFlags.Constructor) return;
    if (this.currentFn instanceof MethodDeclaration && this.currentFn.name.kind == NodeKind.Constructor) return;
    const newException = Node.createExpressionStatement(Node.createCallExpression(Node.createPropertyAccessExpression(Node.createIdentifierExpression("__ErrorState", node.range), Node.createIdentifierExpression("error", node.range), node.range), null, [cloneNode(node.value), Node.createStringLiteralExpression(node.range.source.normalizedPath, node.range), Node.createIntegerLiteralExpression(i64_new(node.range.source.lineAt(node.range.start)), node.range), Node.createIntegerLiteralExpression(i64_new(node.range.source.columnAt()), node.range)], node.range));

    const breaker = getBreaker(node, this.currentFn);
    if (Array.isArray(ref)) {
      replaceRef(node, [newException, breaker], ref);
    } else {
      replaceRef(node, Node.createBlockStatement([newException, breaker], node.range), ref);
    }
  }

  static rewrite(sources: Source[]): void {
    const rewriter = new StdlibThrowRewriter();
    for (const source of sources) {
      rewriter.visit(source);
    }
  }
}
