import { CallExpression, ExpressionStatement, Node, ThrowStatement } from "assemblyscript/dist/assemblyscript.js";
import { NodeKind } from "../types.js";
import { FunctionRef } from "./functionref.js";
import { cloneNode, getBreaker, getBreakerValue, getName, isRefStatement, replaceRef } from "../utils.js";
import { toString } from "../lib/util.js";
import { indent } from "../globals/indent.js";
import { BaseRef } from "./baseref.js";
import { MethodRef } from "./methodref.js";
import { SourceRef } from "./sourceref.js";

const rawValue = process.env["DEBUG"];
const DEBUG = rawValue == "true" ? 1 : rawValue == "false" || rawValue == "" ? 0 : isNaN(Number(rawValue)) ? 0 : Number(rawValue);

export class ExceptionRef extends BaseRef {
  public node: CallExpression | ThrowStatement;
  public ref: Node | Node[] | null;
  public source: SourceRef;

  public name: string;
  public parent: FunctionRef | MethodRef | null = null;
  private generated: boolean = false;

  public hasException: boolean = true;
  constructor(node: CallExpression | ThrowStatement, ref: Node | Node[] | null, source: SourceRef, parent: FunctionRef | MethodRef | null) {
    super();
    this.node = node;
    this.ref = ref;
    this.source = source;
    this.parent = parent;
    this.name = node.kind == NodeKind.Call ? "abort" : "throw";
  }
  generate(): void {
    if (!this.hasException) return;
    if (this.generated) return;
    this.generated = true;
    if (this.node.kind == NodeKind.Call) {
      const node = this.node as CallExpression;
      // console.log(indent + "Is Statement: " + isRefStatement(node, this.ref));
      const fnName = getName(node.expression);
      const stateCall = fnName == "abort" ? Node.createCallExpression(Node.createPropertyAccessExpression(Node.createIdentifierExpression("__AbortState", node.range), Node.createIdentifierExpression("abort", node.range), node.range), null, node.args, node.range) : Node.createCallExpression(Node.createPropertyAccessExpression(Node.createIdentifierExpression("__UnreachableState", node.range), Node.createIdentifierExpression("unreachable", node.range), node.range), null, node.args, node.range);
      const newException = Node.createExpressionStatement(stateCall);

      const breaker = getBreaker(node, this.parent?.node);

      if (DEBUG > 0) console.log(indent + "Added Exception: " + toString(newException));
      // `replaceRef([stateCall, breaker], ...)` splices two statements — valid
      // only where the call is a statement. `isRefStatement` is true whenever
      // the REF is a statement, which misclassifies the call being the DIRECT
      // value of a `return` (`return abort()` / `return unreachable()`): there
      // replaceRef would set `return.value` to the statement ARRAY, emitting
      // malformed `return X()if (…) …` that AS asserts on. Route that case to
      // the value path below (it sets `return.value` to a single comma
      // expression). Coverage's `return (__COVER, abort())` is NOT this case —
      // there the return's value is the comma, not the call — so it is
      // unaffected and keeps its existing handling.
      const refNode = Array.isArray(this.ref) ? null : (this.ref as { kind: number; value?: Node } | null);
      const isReturnValue = refNode != null && refNode.kind == NodeKind.Return && refNode.value == this.node;
      if (isRefStatement(node, this.ref) && !isReturnValue) {
        replaceRef(this.node, [newException, breaker], this.ref);
      } else {
        // Expression position (the coverage transform's `(__COVER, abort())`, or
        // a direct `return abort()`): the call's result is used as a value, so a
        // bare void state-call would put `void` in a value slot and trip AS's
        // compileCommaExpression. Yield `(stateCall, <typed default>)` so the
        // slot stays type-correct (or the bare void call when no value is needed).
        const value = getBreakerValue(node, this.parent?.node ?? null);
        if (value) replaceRef(this.node, Node.createCommaExpression([stateCall, value], node.range), this.ref);
        else replaceRef(this.node, stateCall, this.ref);
      }
    } else if (this.node.kind == NodeKind.Throw) {
      const node = this.node as ThrowStatement;
      const newException: ExpressionStatement = Node.createExpressionStatement(Node.createCallExpression(Node.createPropertyAccessExpression(Node.createIdentifierExpression("__ErrorState", node.range), Node.createIdentifierExpression("error", node.range), node.range), null, [cloneNode(node.value), Node.createStringLiteralExpression(node.range.source.normalizedPath, node.range), Node.createIntegerLiteralExpression(i64_new(node.range.source.lineAt(node.range.start)), node.range), Node.createIntegerLiteralExpression(i64_new(node.range.source.columnAt()), node.range)], node.range));

      const breaker = getBreaker(node, this.parent?.node);
      if (DEBUG > 0) console.log(indent + "Added Exception: " + toString(newException));
      if (isRefStatement(node, this.ref)) replaceRef(this.node, [newException, breaker], this.ref);
      else replaceRef(this.node, newException, this.ref);
    }
  }
  update(ref: this): this {
    this.node = ref.node;
    this.ref = ref.ref;
    return this;
  }
}
