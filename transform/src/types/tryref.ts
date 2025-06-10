import { BlockStatement,  DoStatement,  IfStatement,  Node, TryStatement } from "assemblyscript/dist/assemblyscript.js";
import { FunctionRef } from "./functionref.js";
import { LoopRef } from "./loopref.js";

export class TryRef {
  public node: TryStatement;
  public ref: Node | Node[] | null;

  public tryBlock: DoStatement;
  public catchBlock: IfStatement;
  public finallyBlock: BlockStatement | DoStatement;

  public parent: FunctionRef | LoopRef | null = null;
  public callStack: FunctionRef[] = [];
  public path: string[] = [];
  constructor(node: TryStatement, ref: Node | Node[] | null = null) {
    this.node = node;
    this.ref = ref;
  }
}