import { BlockStatement, CommonFlags, DoStatement, IfStatement, Node, Range, Token, TryStatement } from "assemblyscript/dist/assemblyscript.js";
import { cloneNode, replaceRef } from "../utils.js";
import { toString } from "../lib/util.js";
import { indent } from "../globals/indent.js";
import { BaseRef } from "./baseref.js";
import { CallRef } from "./callref.js";
import { ExceptionRef } from "./exceptionref.js";
import { SourceRef } from "./sourceref.js";

const rawValue = process.env["DEBUG"];
const DEBUG = rawValue == "true" ? 1 : rawValue == "false" || rawValue == "" ? 0 : isNaN(Number(rawValue)) ? 0 : Number(rawValue);

export class TryRef extends BaseRef {
  public node: TryStatement;
  public ref: Node | Node[] | null;
  public source: SourceRef;

  public tries: TryRef[] = [];
  public exceptions: (CallRef | ExceptionRef)[] = [];

  public tryBlock: DoStatement | null = null;
  public catchBlock: IfStatement | null = null;
  public finallyBlock: BlockStatement | DoStatement | null = null;
  constructor(node: TryStatement, ref: Node | Node[] | null, source: SourceRef) {
    super();
    this.node = node;
    this.ref = ref;
    this.source = source;
  }
  generate(): void {
    // if (!this.hasException) return;
    for (const exception of this.exceptions) {
      exception.generate();
    }
    for (const tri of this.tries) {
      tri.generate();
    }
    // if (!this.override) return;
    const tryRange = this.node.bodyStatements.length ? new Range(this.node.bodyStatements[0].range.start, this.node.bodyStatements[this.node.bodyStatements.length - 1].range.end) : this.node.range;

    this.tryBlock = Node.createDoStatement(Node.createBlockStatement([...cloneNode(this.node.bodyStatements)], tryRange), Node.createFalseExpression(this.node.range), tryRange);

    // console.log("Ref: " + toString(ref));
    if (DEBUG > 0)
      console.log(
        indent +
          "Try Block/Loop: " +
          toString(this.tryBlock)
            .split("\n")
            .join("\n" + indent),
      );

    if (this.node.catchStatements?.length) {
      const catchRange = new Range(this.node.catchStatements[0].range.start, this.node.catchStatements[this.node.catchStatements.length - 1].range.end);

      const catchVar = Node.createVariableStatement(null, [Node.createVariableDeclaration(this.node.catchVariable!, null, CommonFlags.Let, null, Node.createNewExpression(Node.createSimpleTypeName("__Exception", this.node.range), null, [Node.createPropertyAccessExpression(Node.createIdentifierExpression("__ExceptionState", this.node.range), Node.createIdentifierExpression("Type", this.node.range), this.node.range)], this.node.range), this.node.range)], this.node.range);

      const stateReset = Node.createExpressionStatement(Node.createUnaryPostfixExpression(Token.Minus_Minus, Node.createPropertyAccessExpression(Node.createIdentifierExpression("__ExceptionState", this.node.range), Node.createIdentifierExpression("Failures", this.node.range), this.node.range), this.node.range));

      this.catchBlock = Node.createIfStatement(
        Node.createBinaryExpression(Token.GreaterThan, Node.createPropertyAccessExpression(Node.createIdentifierExpression("__ExceptionState", this.node.range), Node.createIdentifierExpression("Failures", this.node.range), this.node.range), Node.createIntegerLiteralExpression(i64_zero, this.node.range), this.node.range),
        // Node.createDoStatement(
        Node.createBlockStatement([catchVar, stateReset, ...cloneNode(this.node.catchStatements)], this.node.range),
        // Node.createFalseExpression(this.node.range),
        // this.node.range,
        // ),
        null,
        this.node.range,
      );
      if (DEBUG > 0)
        console.log(
          indent +
            "Catch Block: " +
            toString(this.catchBlock)
              .split("\n")
              .join("\n" + indent),
        );
    }

    if (this.node.finallyStatements) {
      this.finallyBlock = Node.createBlockStatement(cloneNode(this.node.finallyStatements), this.node.range);

      if (DEBUG > 0)
        console.log(
          indent +
            "Finally Block: " +
            toString(this.finallyBlock)
              .split("\n")
              .join("\n" + indent),
        );
    }

    replaceRef(
      this.node,
      [this.tryBlock, this.catchBlock, this.finallyBlock].filter((v) => v != null),
      this.ref,
    );
  }
  update(ref: this): this {
    this.node = ref.node;
    this.ref = ref.ref;
    this.tryBlock = ref.tryBlock;
    this.catchBlock = ref.catchBlock;
    this.finallyBlock = ref.finallyBlock;
    return this;
  }
}
