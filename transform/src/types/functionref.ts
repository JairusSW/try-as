import { BlockStatement, CommonFlags, FunctionDeclaration, IdentifierExpression, ImportDeclaration, ImportStatement, Node, SourceKind, Statement, Token } from "assemblyscript/dist/assemblyscript.js";
import { NodeKind } from "../types.js";
import { CallRef } from "./callref.js";
import { addAfter, blockify, cloneNode, getBreaker, getName } from "../utils.js";
import { ExceptionRef } from "./exceptionref.js";
import { TryRef } from "./tryref.js";
import { SourceLinker } from "../passes/source.js";
import { indent } from "../globals/indent.js";
import { BaseRef } from "./baseref.js";
import { Globals } from "../globals/globals.js";
import { NamespaceRef } from "./namespaceref.js";
import { SourceRef } from "./sourceref.js";

const rawValue = process.env["DEBUG"];
const DEBUG = rawValue == "true" ? 1 : rawValue == "false" || rawValue == "" ? 0 : isNaN(Number(rawValue)) ? 0 : Number(rawValue);

export class FunctionRef extends BaseRef {
  public node: FunctionDeclaration;
  public ref: Node | Node[] | null;
  public source: SourceRef;

  public name: string;
  public qualifiedName: string;
  public path: NamespaceRef[];
  public parent: NamespaceRef | null;

  public tries: TryRef[] = [];
  public exceptions: (CallRef | ExceptionRef)[] = [];

  public callers: CallRef[] = [];

  public baseFn: boolean = false;
  public exported: boolean = false;
  private generatedImport: boolean = false;

  private cloneBody: Statement;

  public state: "ready" | "done" = "ready";
  constructor(node: FunctionDeclaration, ref: Node | Node[] | null, source: SourceRef, parent: NamespaceRef | null) {
    super();
    this.node = node;
    this.ref = ref;
    this.source = source;
    this.parent = parent;

    this.path = this.parent ? [...this.parent.path, this.parent] : [];
    this.name = node.name.text;
    this.qualifiedName = getName(node.name, this.path);
    this.exported = Boolean(node.flags & CommonFlags.Export);

    this.cloneBody = cloneNode(node.body)!;
  }
  isEntryFn(): boolean {
    return Boolean(this.node.flags & CommonFlags.Export && this.node.range.source.sourceKind == SourceKind.UserEntry);
  }
  generate(): void {
    if (!this.hasException) return;
    if (this.node.name.text.startsWith("__try_")) return;
    // @inline throwing functions need special care. AS substitutes the body at
    // every call site, and a body carrying our lowered throw (state-update +
    // `return` breaker) is control flow that AS can't inline into an expression
    // slot (e.g. `out.push(f(x))`, or a coverage `return (__COVER, f(x))`).
    // Rather than leave the throw raw (uncatchable abort), keep the ORIGINAL
    // `@inline` function for non-exception callers (they still inline at full
    // speed) and emit a NON-inline `__try_<name>` shadow for exception-context
    // callers: a real function call sidesteps the inliner entirely, so its
    // breakers are legal and the throw is catchable. The only cost is the lost
    // inline at try-as-traced call sites, and only when try-as is active.
    let isInline = false;
    if (this.node.decorators) {
      for (const dec of this.node.decorators) {
        if (dec.name.kind == NodeKind.Identifier && (dec.name as IdentifierExpression).text == "inline") {
          isInline = true;
          break;
        }
      }
    }
    if (DEBUG > 0) console.log(indent + "Generating function " + this.qualifiedName);
    indent.add();
    if (this.exported && !this.generatedImport) {
      this.generatedImport = true;
      const seenImports = new Set<string>();
      for (const caller of this.callers) {
        if (caller.node.range.source.internalPath == this.node.range.source.internalPath) continue;
        const seenKey = caller.node.range.source.internalPath + "::" + caller.name;
        if (seenImports.has(seenKey)) continue;
        seenImports.add(seenKey);

        const callerSrc = Globals.sources.get(caller.node.range.source.internalPath);
        if (!callerSrc) throw new Error("Could not find " + caller.node.range.source.internalPath + " in sources!");

        let callerImport: ImportStatement | null = null;
        let callerDeclaration: ImportDeclaration | null = null;

        for (const imp of callerSrc.local.imports) {
          const decl = imp.declarations?.find((b) => caller.name == b.name.text);
          if (decl) {
            callerImport = imp;
            callerDeclaration = decl;
            break;
          }
        }

        if (callerImport && callerDeclaration && !this.tries.length) {
          const newCallerImport = Node.createImportDeclaration(Node.createIdentifierExpression("__try_" + callerDeclaration.foreignName.text, caller.node.range.source.range), Node.createIdentifierExpression("__try_" + caller.name, caller.node.range.source.range), caller.node.range.source.range);

          callerImport.declarations?.push(newCallerImport);
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

    // The kept original (replacementFunction, above) keeps `@inline` — it serves
    // non-exception callers. The `__try_` shadow (this.node) must NOT be inline:
    // its lowered-throw control flow can't be inlined into an expression slot.
    // Reassign to a filtered array (don't mutate the shared one the original
    // now references) so only the shadow loses `@inline`.
    if (isInline && this.node.decorators) {
      this.node.decorators = this.node.decorators.filter((d) => !(d.name.kind == NodeKind.Identifier && (d.name as IdentifierExpression).text == "inline"));
    }

    // Anonymous arrow callbacks (`(): void => { … }`) have an empty
    // `name.text`. Renaming them to `__try_` would trip the AST-builder
    // assertion `declaration.name.text.length == 0` in the DEBUG WRITE
    // pass and adds nothing — nothing references arrows by name. Keep
    // them anonymous; the body's lowered throws still update
    // `__ExceptionState`.
    const isAnonymous = this.node.name.text.length == 0;
    if (!this.tries.length && !isAnonymous) this.node.name = Node.createIdentifierExpression("__try_" + this.node.name.text, this.node.name.range);

    if (this.node.body && this.node.body.kind != NodeKind.Block) {
      this.node.body = blockify(this.node.body);
    }

    (this.node.body as BlockStatement).statements.unshift(unrollCheck);

    for (const exception of this.exceptions) {
      if (DEBUG > 0) console.log(indent + "Generating exceptions");
      indent.add();
      exception.generate();
      indent.rm();
    }
    // if (!this.tries.length) {
    for (const caller of this.callers) {
      if (DEBUG > 0) console.log(indent + "Generating callers");
      indent.add();
      caller.generate();
      indent.rm();
    }
    // }
    for (const tryRef of this.tries) {
      if (DEBUG > 0) console.log(indent + "Generating tries");
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
