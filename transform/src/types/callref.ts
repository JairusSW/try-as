import { CallExpression, Node } from "assemblyscript/dist/assemblyscript.js";
import { FunctionRef } from "./functionref.js";

export class CallRef {
  public node: CallExpression;
  public ref: Node | Node[] | null;
  public calling: FunctionRef;
  constructor(node: CallExpression, ref: Node | Node[] | null, calling: FunctionRef) {
    this.node = node;
    this.ref = ref;
    this.calling = calling;
  }
}