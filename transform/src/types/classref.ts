import { BaseRef } from "./baseref.js";
import { ClassDeclaration } from "types:assemblyscript/src/index";
import { CommonFlags, Node } from "assemblyscript/dist/assemblyscript.js";
import { NamespaceRef } from "./namespaceref.js";
import { MethodRef } from "./methodref.js";
import { getName } from "../utils.js";
import { SourceRef } from "./sourceref.js";
import { indent } from "../globals/indent.js";

export class ClassRef extends BaseRef {
  public node: ClassDeclaration;
  public ref: Node | Node[] | null;
  public source: SourceRef;

  public name: string;
  public qualifiedName: string;
  public path: NamespaceRef[];
  public parent: NamespaceRef | null;

  public methods: MethodRef[] = [];
  public exported: boolean;
  constructor(node: ClassDeclaration, ref: Node | Node[] | null, source: SourceRef, parent: NamespaceRef | null) {
    super();
    this.node = node;
    this.ref = ref;
    this.source = source;
    this.parent = parent;

    this.path = this.parent ? [...this.parent.path, this.parent] : [];
    this.name = node.name.text;
    this.qualifiedName = getName(node.name, this.path);

    this.exported = Boolean(node.flags & CommonFlags.Export);
  }
  generate(): void {
    if (!this.hasException) return;

    console.log(indent + "Generating tries");
    indent.add();
    for (const method of this.methods) {
      method.generate();
    }
    indent.rm();
  }
}