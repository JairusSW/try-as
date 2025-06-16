import { BlockStatement, CommonFlags, FunctionDeclaration, ImportDeclaration, ImportStatement, Node, NodeKind, SourceKind, Statement, Token } from "assemblyscript/dist/assemblyscript.js";
import { CallRef } from "./callref.js";
import { addAfter, blockify, cloneNode, getBreaker, getFnName } from "../utils.js";
import { ExceptionRef } from "./exceptionref.js";
import { TryRef } from "./tryref.js";
import { SourceLinker } from "../passes/source.js";
import { indent } from "../globals/indent.js";
import { BaseRef } from "./baseref.js";
import { Globals } from "../globals/globals.js";

const rawValue = process.env["DEBUG"];
const DEBUG = rawValue === "true" ? 1 : rawValue === "false" || rawValue === "" ? 0 : isNaN(Number(rawValue)) ? 0 : Number(rawValue);

export class FunctionRef extends BaseRef {
  public node: FunctionDeclaration;
  public ref: Node | Node[] | null;

  public name: string;
  public path: string[];

  public tries: TryRef[] = [];
  public exceptions: (CallRef | ExceptionRef)[] = [];

  public callers: CallRef[] = [];

  public exported: boolean = false;
  public hasException: boolean = false;
  private generatedImport: boolean = false;

  private cloneBody: Statement;

  public state: "ready" | "done" = "ready";
  constructor(node: FunctionDeclaration, ref: Node | Node[] | null, path: string[] = []) {
    super();
    this.node = node;
    this.ref = ref;
    this.path = path;
    this.name = getFnName(node.name, path);
    this.exported = Boolean(node.flags & CommonFlags.Export);

    this.cloneBody = cloneNode(node.body);
  }
  isEntry(): boolean {
    return this.node.flags & CommonFlags.Export && this.node.range.source.sourceKind == SourceKind.UserEntry;
  }
  generate(): void {
    if (this.node.name.text.startsWith("__try_")) return;
    if (DEBUG > 0) console.log(indent + "Generating function " + this.name);
    indent.add();
    if (this.exported && !this.generatedImport) {
      this.generatedImport = true;
      const seenSources = new Set<string>();
      for (const caller of this.callers) {
        if (caller.name != this.name) continue;
        if (caller.node.range.source.internalPath == this.node.range.source.internalPath) continue;
        if (seenSources.has(caller.node.range.source.internalPath)) continue;
        seenSources.add(caller.node.range.source.internalPath);

        const callerSrc = Globals.sources.get(caller.node.range.source.internalPath);
        if (!callerSrc) throw new Error("Could not find " + caller.node.range.source.internalPath + " in sources!");

        let callerImport: ImportStatement | null = null;
        let callerDeclaration: ImportDeclaration | null = null;

        for (const imp of callerSrc.local.imports) {
          const decl = imp.declarations.find((b) => caller.name === b.name.text);
          if (decl) {
            callerImport = imp;
            callerDeclaration = decl;
            break;
          }
        }

        if (callerImport && callerDeclaration && !this.tries.length) {
          const newCallerImport = Node.createImportDeclaration(Node.createIdentifierExpression("__try_" + callerDeclaration.foreignName.text, caller.node.range.source.range), Node.createIdentifierExpression("__try_" + caller.name, caller.node.range.source.range), caller.node.range.source.range);

          callerImport.declarations.push(newCallerImport);
          if (DEBUG > 0) indent + "Added import " + newCallerImport.foreignName.text;
        }
      }
    }

    const returnStmt = getBreaker(this.node, this.node);
    const unrollCheck = Node.createIfStatement(Node.createBinaryExpression(Token.GreaterThan, Node.createPropertyAccessExpression(Node.createIdentifierExpression("__ExceptionState", this.node.range), Node.createIdentifierExpression("Failures", this.node.range), this.node.range), Node.createIntegerLiteralExpression(i64_zero, this.node.range), this.node.range), blockify(returnStmt), null, this.node.range);

    // const newBody = Node.createBlockStatement(
    //   [unrollCheck, ...blockify(this.node.body).statements],
    //   this.node.range
    // );

    const replacementFunction = Node.createFunctionDeclaration(Node.createIdentifierExpression(this.node.name.text, this.node.name.range), this.node.decorators, this.node.flags, this.node.typeParameters, this.node.signature, this.cloneBody, this.node.arrowKind, this.node.range);

    if (!this.tries.length) this.node.name = Node.createIdentifierExpression("__try_" + this.node.name.text, this.node.name.range);

    if (this.node.body.kind != NodeKind.Block) {
      this.node.body = blockify(this.node.body);
    }

    (this.node.body as BlockStatement).statements.unshift(unrollCheck);

    for (const exception of this.exceptions) {
      console.log(indent + "Generating exceptions");
      indent.add();
      exception.generate();
      indent.rm();
    }
    if (!this.isEntry() && !this.tries.length) {
      for (const caller of this.callers) {
        console.log(indent + "Generating callers");
        indent.add();
        caller.generate();
        indent.rm();
      }
    }
    for (const tryRef of this.tries) {
      console.log(indent + "Generating tries");
      indent.add();
      tryRef.generate();
      indent.rm();
    }

    if (!this.tries.length) addAfter(this.node, replacementFunction, this.ref);
    indent.rm();
  }
  update(ref: this): this {
    this.node = ref.node;
    this.ref = ref.ref;
    return this;
  }
}
