import { BaseRef } from "./baseref.js";
import { Globals } from "../globals/globals.js";
import { ClassDeclaration } from "types:assemblyscript/src/index";
import { CommonFlags, Node } from "assemblyscript/dist/assemblyscript.js";
import { NamespaceRef } from "./namespaceref.js";
import { MethodRef } from "./methodref.js";
import { getName } from "../utils.js";

export class ClassRef extends BaseRef {
  public node: ClassDeclaration;
  public ref: Node | Node[] | null;
  
  public name: string;
  public path: NamespaceRef[];
  public parent: NamespaceRef | null;

  public methods: MethodRef[];
  public exported: boolean;

  constructor(node: ClassDeclaration, ref: Node | Node[] | null, parent: NamespaceRef | null) {
    super();
    this.node = node;
    this.ref = ref;
    this.parent = parent;

    this.path = this.parent ? [...this.parent.path, this.parent] : [];
    this.name = getName(node.name, this.path);

    this.exported = Boolean(node.flags & CommonFlags.Export);
  }
}