import { CallExpression, IdentifierExpression, Node, NodeKind, PropertyAccessExpression, Token } from "assemblyscript/dist/assemblyscript.js";
import { FunctionRef } from "./functionref.js";
import { addAfter, blockify, getBreaker, getName, isRefStatement, replaceRef } from "../utils.js";
import { indent } from "../globals/indent.js";
import { toString } from "../lib/util.js";
import { BaseRef } from "./baseref.js";
import { MethodRef } from "./methodref.js";
import { SourceRef } from "./sourceref.js";

const rawValue = process.env["DEBUG"];
const DEBUG = rawValue == "true" ? 1 : rawValue == "false" || rawValue == "" ? 0 : isNaN(Number(rawValue)) ? 0 : Number(rawValue);

export class CallRef extends BaseRef {
  public node: CallExpression;
  public ref: Node | Node[] | null;
  public source: SourceRef;
  public calling: FunctionRef | MethodRef;
  public name: string;

  public parent: FunctionRef | MethodRef | null;

  private generated: boolean = false;
  constructor(node: CallExpression, ref: Node | Node[] | null, calling: FunctionRef | MethodRef, parent: FunctionRef | MethodRef | null) {
    super();
    this.node = node;
    this.ref = ref;
    this.calling = calling;
    this.parent = parent;

    this.name = getName(node.expression);
  }
  generate(): void {
    if (!this.hasException) return;
    if (this.generated) return;
    this.generated = true;

    const breaker = getBreaker(this.node, this.parent?.node);

    if (this.node.expression.kind == NodeKind.PropertyAccess && !(this.node.expression as PropertyAccessExpression).property.text.startsWith("__try_")) {
      (this.node.expression as PropertyAccessExpression).property.text = (this.calling.tries.length ? "__try_" : "__try_") + (this.node.expression as PropertyAccessExpression).property.text;
    } else if (!(this.node.expression as IdentifierExpression).text.startsWith("__try_")) {
      (this.node.expression as IdentifierExpression).text = (this.calling.tries.length ? "__try_" : "__try_") + (this.node.expression as IdentifierExpression).text;
    } else {
      return;
    }

    const unrollCheck = Node.createIfStatement(Node.createBinaryExpression(Token.GreaterThan, Node.createPropertyAccessExpression(Node.createIdentifierExpression("__ExceptionState", this.node.range), Node.createIdentifierExpression("Failures", this.node.range), this.node.range), Node.createIntegerLiteralExpression(i64_zero, this.node.range), this.node.range), blockify(breaker), null, this.node.range);

    if (DEBUG > 0) console.log(indent + "Replaced call: " + toString(this.node));

    if (isRefStatement(this.node, this.ref)) addAfter(this.node, unrollCheck, this.ref);
  }
  update(ref: this): this {
    this.node = ref.node;
    this.ref = ref.ref;
    return this;
  }
}
