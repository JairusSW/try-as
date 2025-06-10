import { FunctionDeclaration, Node } from "assemblyscript/dist/assemblyscript.js";
import { CallRef } from "./callref.js";
import { getFnName } from "../utils.js";
import { ExceptionRef } from "./exceptionref.js";
import { TryRef } from "./tryref.js";

export class FunctionRef {
  public node: FunctionDeclaration;
  public ref: Node | Node[] | null;

  public name: string;
  public path: string[];

  public tries: TryRef[] = [];
  public exceptions: (CallRef | ExceptionRef)[] = [];

  public exported: boolean = false;
  constructor(node: FunctionDeclaration, ref: Node | Node[] | null, path: string[] = []) {
    this.node = node;
    this.ref = ref;
    this.path = path;
    this.name = getFnName(node.name, path);
  }
}