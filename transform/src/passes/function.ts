import { BlockStatement, CallExpression, ClassDeclaration, CommonFlags, FunctionDeclaration, ImportDeclaration, NamespaceDeclaration, Node, Source } from "assemblyscript/dist/assemblyscript.js";
import { Visitor } from "../lib/visitor.js";
import { CallRef, FunctionRef, Try } from "../transform.js";
import { getFnName, hasBaseException } from "../utils.js";
import { toString } from "../lib/util.js";
import { ImportStatement, TryStatement } from "types:assemblyscript/src/ast";

export class FunctionLinker extends Visitor {
  static SN: FunctionLinker = new FunctionLinker();

  public callStack: Set<FunctionRef> = new Set();
  public calls: [CallExpression, Node | Node[] | null][] = [];

  public fnRefs: FunctionRef[] = [];

  public path: string[] = [];
  private foundException: boolean = false;
  private foundTry: boolean = false;
  private searching: boolean = false;
  private imports: ImportStatement[] = [];

  private stage: "gather" | "analyze" = "gather";

  visitImportStatement(node: ImportStatement, ref?: Node | Node[] | null): void {
    if (!Try.SN.sources.find((v) => v.source.internalPath == node.internalPath)?.visited) {
      const externSource = Try.SN.parser.sources.find((v) => v.internalPath == node.internalPath);
      if (externSource) {
        console.log("Redirecting from " + node.range.source.internalPath + " to " + externSource.internalPath);
        Try.SN.visitSrc(externSource, new FunctionLinker());
        console.log("Back to " + node.range.source.internalPath);
      }
    }
    this.imports.push(node);
  }

  visitTryStatement(node: TryStatement, ref?: Node | Node[] | null): void {
    if (this.stage == "analyze") this.foundTry = true;
    super.visitTryStatement(node, ref);
  }

  visitFunctionDeclaration(node: FunctionDeclaration, isDefault?: boolean, ref: Node | Node[] | null = null): void {
    if (this.stage != "gather") return;
    if (!node.body || !node.name.text.length) return;

    const fnRef = new FunctionRef(node, [], ref);
    if (node.flags & CommonFlags.Export) fnRef.exported = true;
    if (hasBaseException((node.body as BlockStatement).statements)) fnRef.hasException = true;

    super.visitFunctionDeclaration(node, isDefault, ref);
    if (this.foundTry) {
      fnRef.hasTry = true;
      this.foundTry = false;
    }
    this.fnRefs.push(fnRef);

    // console.log("Added Function To Stack: " + node.name.text)
    this.callStack.add(fnRef);
    if (this.foundException) {
      fnRef.hasException = true;
      Try.SN.addFnRef(node.range.source, fnRef, false);
      console.log("Added Function: " + (this.path.length ? this.path.join(".") + "." : "") + node.name.text + " from " + node.range.source.internalPath);
      if (!this.searching) this.foundException = false;

      for (const call of this.callStack.values()) {
        call.hasException = true;
      }
    }
    this.callStack.delete(fnRef);
  }
  visitCallExpression(node: CallExpression, ref: Node | Node[] | null = null): void {
    const fnName = getFnName(node.expression, this.path);
    if (fnName == "unreachable" || fnName == "abort") {
      this.foundException = true;
      return super.visitCallExpression(node, ref);
    }

    if (this.stage == "gather") {
      this.calls.push([node, ref]);
      return super.visitCallExpression(node, ref);
    }

    if (this.stage != "analyze") return;
    if (!node.expression) return;

    const rawFnName = getFnName(node.expression);
    let fnRef = this.fnRefs.find((v) => v.name == rawFnName); // Local Search
    if (fnRef) {
      console.log("Found " + fnName + " locally");
      console.log("Added Function: " + (this.path.length ? this.path.join(".") + "." : "") + fnRef.node.name.text + " from " + node.range.source.internalPath);
      Try.SN.addFnRef(node.range.source, fnRef);
    } else {
      let externDec: ImportDeclaration | null = null;
      const externImport = this.imports.find((v) => {
        // External search
        for (const dec of v.declarations) {
          if (fnName.includes(dec.name.text)) {
            externDec = dec;
            return v;
          }
        }
        return null;
      });

      if (externImport) {
        fnRef = Try.SN.getFnByName(externImport.internalPath, fnName);
        if (!fnRef) return;
        if (fnRef) console.log("Found " + fnName + " externally");
        // console.log("Added Function: " + (this.path.length ? this.path.join(".") + "." : "") + fnRef.node.name.text + " from " + fnRef.node.range.source.internalPath);
        // Try.SN.addFnRef(fnRef.node.range.source, fnRef);
        if (!externImport.declarations.some((v) => v.name.text == "__try_" + fnRef.name)) {
          const newImport = Node.createImportDeclaration(Node.createIdentifierExpression("__try_" + externDec.foreignName.text, node.range), Node.createIdentifierExpression("__try_" + fnRef.name, node.range, false), node.range);

          externImport.declarations.push(newImport);
        }
      }
    }

    if (!fnRef) return;

    const callRef = new CallRef(node, ref, this.path.slice());
    // fnRef.callers.push(callRef);

    this.callStack.add(fnRef);

    console.log(
      "Call Stack: " +
        Array.from(this.callStack.values())
          .reverse()
          .map((v) => v.name)
          .join(" -> "),
    );
    super.visitCallExpression(node, ref);
  }
  visitNamespaceDeclaration(node: NamespaceDeclaration, isDefault?: boolean, ref?: Node | Node[] | null): void {
    this.path.push(node.name.text);
    super.visitNamespaceDeclaration(node, isDefault, ref);
    const index = this.path.lastIndexOf(node.name.text);
    if (index !== -1) {
      this.path.splice(index, 1);
    }
  }
  visitClassDeclaration(node: ClassDeclaration, isDefault?: boolean, ref?: Node | Node[] | null): void {
    super.visit(node.name, node);
    super.visit(node.decorators, node);
    if (node.isGeneric ? node.typeParameters != null : node.typeParameters == null) {
      super.visit(node.typeParameters, node);
      super.visit(node.extendsType, node);
      super.visit(node.implementsTypes, node);
      this.path.push(node.name.text);
      this.visit(node.members, node);
      const index = this.path.lastIndexOf(node.name.text);
      if (index !== -1) {
        this.path.splice(index, 1);
      }
    } else {
      throw new Error("Expected to type parameters to match class declaration, but found type mismatch instead!");
    }
  }
  visitSource(node: Source, ref?: Node | Node[] | null): void {
    this.stage = "gather";
    super.visitSource(node, ref);
    this.stage = "analyze";
    for (const [n, r] of this.calls) {
      this.visitCallExpression(n, r);
    }
    this.callStack.clear();
    this.calls = [];
    this.currentSource = null;
    this.fnRefs = [];
    this.foundException = false;
    this.imports = [];
    this.path = [];
  }
  runPass(source: Source) {
    this.visitSource(source);
  }
}
