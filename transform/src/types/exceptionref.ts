import { CallExpression,  Node, ThrowStatement } from "assemblyscript/dist/assemblyscript.js";
import { FunctionRef } from "./functionref.js";
import { LoopRef } from "./loopref.js";

export class ExceptionRef {
  public node: CallExpression | ThrowStatement;
  public ref: Node | Node[] | null;

  public parent: FunctionRef | LoopRef | null = null;
  constructor(node: CallExpression | ThrowStatement, ref: Node | Node[] | null) {
    this.node = node;
    this.ref = ref;
  }
}