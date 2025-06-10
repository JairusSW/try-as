import { DoStatement, ForOfStatement, ForStatement, Node, WhileStatement } from "assemblyscript/dist/assemblyscript.js";

export class LoopRef {
  public node: DoStatement | WhileStatement | ForStatement | ForOfStatement;
  public ref: Node | Node[] | null;
  constructor(node: DoStatement | WhileStatement | ForStatement | ForOfStatement, ref: Node | Node[] | null) {
    this.node = node;
    this.ref = ref;
  }
}