import { FunctionDeclaration, MethodDeclaration, NewExpression, Node, NodeKind, Source, ThrowStatement } from "assemblyscript/dist/assemblyscript.js";
import { Visitor } from "../lib/visitor.js";
import { getBreaker, replaceRef } from "../utils.js";

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
    if (node.value.kind != NodeKind.New) return;
    if (this.currentFn instanceof MethodDeclaration && this.currentFn.name.kind == NodeKind.Constructor) return;

    const value = node.value as NewExpression;
    const newException = Node.createExpressionStatement(
      Node.createCallExpression(
        Node.createPropertyAccessExpression(Node.createIdentifierExpression("__ErrorState", node.range), Node.createIdentifierExpression("error", node.range), node.range),
        null,
        [
          value,
          Node.createStringLiteralExpression(node.range.source.normalizedPath, node.range),
          Node.createStringLiteralExpression(node.range.source.lineAt(node.range.start).toString(), node.range),
          Node.createStringLiteralExpression(node.range.source.columnAt().toString(), node.range),
        ],
        node.range,
      ),
    );

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
