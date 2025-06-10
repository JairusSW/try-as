import {  CallExpression, ClassDeclaration, FunctionDeclaration, ImportStatement, NamespaceDeclaration, Node, Source, SourceKind } from "assemblyscript/dist/assemblyscript.js";
import { SourceRef } from "../types/sourceref.js";
import { Visitor } from "../lib/visitor.js";
import { indent } from "../globals/indent.js";
import { FunctionRef } from "../types/functionref.js";
import { getFnName } from "../utils.js";
import { ExceptionRef } from "../types/exceptionref.js";
import { CallRef } from "../types/callref.js";

class SourceState {
  public sources: Map<string, SourceRef> = new Map();
}

export class SourceLinker extends Visitor {
  static SS: SourceState = new SourceState();

  public node: Source;
  public name: string;
  public state: "ready" | "gather" | "link" | "done" = "ready";
  public source: SourceRef;

  public path: string[] = [];
  public lastFn: FunctionRef | null = null;

  public gatheredFns: FunctionRef[] = [];

  // private fnStack: FunctionRef[] = [];

  visitImportStatement(node: ImportStatement, ref: Node | Node[] | null = null): void {
    const targetSourceRef = SourceLinker.SS.sources.get(node.internalPath);
    if (!targetSourceRef) throw new Error("Could not find " + node.internalPath + " in sources!");
    if (targetSourceRef.state != "ready") return super.visitImportStatement(node, ref);
    if (node.internalPath == node.range.source.internalPath) return super.visitImportStatement(node, ref);
    console.log(indent + node.internalPath + " -> " + targetSourceRef.source.internalPath);
    indent.add();

    const newLinker = new SourceLinker();
    newLinker.link(targetSourceRef.source);
    indent.rm();
  }

  visitFunctionDeclaration(node: FunctionDeclaration, isDefault: boolean = false, ref: Node | Node[] | null = null): void {
    if (this.state != "gather") return this.linkFunctionRef(this.gatheredFns.find((v) => v.name == getFnName(node, this.path)));
    if (!node.body || !node.name.text.length) return; // TODO: Handle this later
    const fnRef = new FunctionRef(node, ref, this.path.slice());
    this.gatheredFns.push(fnRef);
    return super.visitFunctionDeclaration(node, isDefault, ref);
  }

  linkFunctionRef(fnRef: FunctionRef): void {
    if (!fnRef) return;
    if (this.source.functions.some((v) => v.name == fnRef.name)) return;

    console.log(indent + "Found function " + fnRef.name)
    this.source.functions.push(fnRef);
    const oldFn = this.lastFn;
    this.lastFn = fnRef;

    super.visit(fnRef.node, fnRef.ref);
    this.lastFn = oldFn;
  }

  visitCallExpression(node: CallExpression, ref: Node | Node[] | null = null): void {
    if (this.state != "link") return super.visitCallExpression(node, ref);
    const fnName = getFnName(node.expression);
    if (fnName == "unreachable" || fnName == "abort") {
      super.visitCallExpression(node, ref);
      const newException = new ExceptionRef(node, ref);
      this.lastFn.exceptions.push(newException);
      return;
    }
    
    const targetName = getFnName(node.expression);
    console.log(indent + "Looking for " + targetName)
    let fnRef = this.gatheredFns.find((v) => v.name == targetName);
    if (fnRef) {
      console.log(indent + "Found " + targetName + " locally");
    } else {
      const externDec = this.source.imports.find((a) =>
        a.declarations.find((b) =>
          targetName == b.name.text || targetName.startsWith(b.name.text + ".")
        )
      );
      if (externDec) {
        const externSrc = SourceLinker.SS.sources.get(externDec.internalPath);
        if (!externSrc) throw new Error("Could not find " + externDec.internalPath + " in sources!");
        fnRef = externSrc.functions.find((v) => v.name == targetName);
        if (fnRef) console.log(indent + "Found " + targetName + " externally");
      }
    }
    if (!fnRef) return super.visitCallExpression(node, ref);
    
    const callRef = new CallRef(node, ref, fnRef);
    this.lastFn.exceptions.push(callRef);

    this.linkFunctionRef(fnRef);

    super.visitCallExpression(node, ref);
  }

  visitNamespaceDeclaration(node: NamespaceDeclaration, isDefault: boolean = false, ref: Node | Node[] | null = null): void {
      this.path.push(node.name.text);
      super.visitNamespaceDeclaration(node, isDefault, ref);
      const index = this.path.lastIndexOf(node.name.text);
      if (index !== -1) {
        this.path.splice(index, 1);
      }
    }
    visitClassDeclaration(node: ClassDeclaration, isDefault: boolean = false, ref: Node | Node[] | null = null): void {
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

  link(source: Source): void {
    if (this.state != "ready") return;
    this.state = "gather";
    console.log(indent + "Linking " + source.internalPath);
    this.source = SourceLinker.SS.sources.get(source.internalPath)!;
    this.source.state = "linking";

    super.visit(source);

    this.state = "link";

    super.visit(source);

    this.state = "done";
  }

  static link(sources: Source[]): void {
    for (const source of sources) {
      SourceLinker.SS.sources.set(source.internalPath, new SourceRef(source));
    }

    const entrySource = sources.find((v) => v.sourceKind == SourceKind.UserEntry);
    if (!entrySource) throw new Error("Could not find main entry point in sources");

    console.log("Entry: " + entrySource.internalPath);

    const linker = new SourceLinker();
    linker.link(entrySource);
  }
}