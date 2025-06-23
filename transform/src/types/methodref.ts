import { BlockStatement, MethodDeclaration, Node, NodeKind, Statement, Token } from "assemblyscript/dist/assemblyscript.js";
import { BaseRef } from "./baseref.js";
import { ClassRef } from "./classref";
import { TryRef } from "./tryref.js";
import { CallRef } from "./callref";
import { ExceptionRef } from "./exceptionref";
import { addAfter, blockify, cloneNode, getBreaker, getName } from "../utils.js";
import { NamespaceRef } from "./namespaceref.js";
import { indent } from "../globals/indent.js";
import { SourceRef } from "./sourceref.js";

const rawValue = process.env["DEBUG"];
const DEBUG = rawValue == "true" ? 1 : rawValue == "false" || rawValue == "" ? 0 : isNaN(Number(rawValue)) ? 0 : Number(rawValue);

export class MethodRef extends BaseRef {
  public node: MethodDeclaration;
  public ref: Node | Node[] | null;
  public source: SourceRef;

  public name: string;
  public qualifiedName: string;
  public path: (NamespaceRef | ClassRef)[] = [];
  public parent: ClassRef;

  public tries: TryRef[] = [];
  public exceptions: (CallRef | ExceptionRef)[] = [];
  public callers: CallRef[] = [];

  private cloneBody: Statement;

  public state: "ready" | "done" = "ready";
  constructor(node: MethodDeclaration, ref: Node | Node[] | null, source: SourceRef, parent: ClassRef) {
    super();
    this.node = node;
    this.ref = ref;
    this.source = source;
    this.parent = parent;

    this.path = this.parent ? [...this.parent.path, this.parent] : [];
    this.name = node.name.text;
    this.qualifiedName = getName(node.name, this.path);

    this.cloneBody = cloneNode(node.body);
  }

  generate(): void {
    if (!this.hasException) return;
    if (this.node.name.text.startsWith("__try_")) return;
    if (DEBUG > 0) console.log(indent + "Generating method " + this.qualifiedName);
    indent.add();

    const returnStmt = getBreaker(this.node, this.node);
    const unrollCheck = Node.createIfStatement(Node.createBinaryExpression(Token.GreaterThan, Node.createPropertyAccessExpression(Node.createIdentifierExpression("__ExceptionState", this.node.range), Node.createIdentifierExpression("Failures", this.node.range), this.node.range), Node.createIntegerLiteralExpression(i64_zero, this.node.range), this.node.range), blockify(returnStmt), null, this.node.range);

    // const newBody = Node.createBlockStatement(
    //   [unrollCheck, ...blockify(this.node.body).statements],
    //   this.node.range
    // );

    const replacementMethod = Node.createMethodDeclaration(Node.createIdentifierExpression(this.node.name.text, this.node.name.range), this.node.decorators, this.node.flags, this.node.typeParameters, this.node.signature, this.cloneBody, this.node.range);

    if (!this.tries.length) this.node.name = Node.createIdentifierExpression("__try_" + this.node.name.text, this.node.name.range);

    if (this.node.body.kind != NodeKind.Block) {
      this.node.body = blockify(this.node.body);
    }

    (this.node.body as BlockStatement).statements.unshift(unrollCheck);

    for (const exception of this.exceptions) {
      if (DEBUG > 0) console.log(indent + "Generating exceptions");
      indent.add();
      exception.generate();
      indent.rm();
    }
    for (const caller of this.callers) {
      if (DEBUG > 0) console.log(indent + "Generating callers");
      indent.add();
      caller.generate();
      indent.rm();
    }
    for (const tryRef of this.tries) {
      if (DEBUG > 0) console.log(indent + "Generating tries");
      indent.add();
      tryRef.generate();
      indent.rm();
    }

    if (!this.tries.length) addAfter(this.node, replacementMethod, this.ref);
    indent.rm();
  }
  update(ref: this): this {
    this.node = ref.node;
    this.ref = ref.ref;
    return this;
  }
}
