import { FunctionDeclaration, Node, Source } from "assemblyscript/dist/assemblyscript.js";
import { Visitor } from "../lib/visitor.js";

class FunctionGetter extends Visitor {
  static SN: FunctionGetter = new FunctionGetter();

  public functions: [FunctionDeclaration, Node | Node[] | null][] = [];
  visitFunctionDeclaration(node: FunctionDeclaration, isDefault: boolean = false, ref: Node | Node[] | null = null): void {
    this.functions.push([node, ref]);
  }
  static getFunctions(source: Source): [FunctionDeclaration, Node | Node[] | null][] {
    FunctionGetter.SN.visit(source);
    const functions = FunctionGetter.SN.functions;
    FunctionGetter.SN.functions = [];
    return functions;
  }
}

export function getFunctions(source: Source): [FunctionDeclaration, Node | Node[] | null][] {
  return FunctionGetter.getFunctions(source);
}