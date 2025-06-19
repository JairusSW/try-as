import { MethodDeclaration, Node, Statement } from "assemblyscript/dist/assemblyscript.js";
import { BaseRef } from "./baseref.js";
import { ClassRef } from "./classref";
import { TryRef } from "./tryref.js";
import { CallRef } from "./callref";
import { ExceptionRef } from "./exceptionref";
import { getName } from "../utils";

export class MethodRef extends BaseRef {
  public node: MethodDeclaration;
  public ref: Node | Node[] | null;

  public name: string;
  public parent: ClassRef;

  public tries: TryRef[] = [];
  public exceptions: (CallRef | ExceptionRef)[] = [];
  public callers: CallRef[] = [];

  public exported: boolean;
  public hasException: boolean = false;

  private cloneBody: Statement;
  constructor(node: MethodDeclaration, ref: Node | Node[] | null, parent: ClassRef) {
    super();
    this.node = node;
    this.ref = ref;
    this.parent = parent;
    this.name = getName(node.name, [this.parent, ...this.parent.path])
  }
}