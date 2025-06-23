import { NamespaceDeclaration, Node } from "assemblyscript/dist/assemblyscript.js";
import { BaseRef } from "./baseref.js";
import { FunctionRef } from "./functionref.js";
import { getName } from "../utils.js";
import { indent } from "../globals/indent.js";
import { ClassRef } from "./classref.js";
import { SourceRef } from "./sourceref.js";

const rawValue = process.env["DEBUG"];
const DEBUG = rawValue == "true" ? 1 : rawValue == "false" || rawValue == "" ? 0 : isNaN(Number(rawValue)) ? 0 : Number(rawValue);

export class NamespaceRef extends BaseRef {
  public node: NamespaceDeclaration;
  public ref: Node | Node[] | null;
  public source: SourceRef;

  public name: string;
  public qualifiedName: string;
  public path: NamespaceRef[];
  public parent: NamespaceRef | null;

  public functions: FunctionRef[] = [];
  public namespaces: NamespaceRef[] = [];
  public classes: ClassRef[] = [];
  constructor(node: NamespaceDeclaration, ref: Node | Node[] | null, source: SourceRef, parent: NamespaceRef | null) {
    super();
    this.node = node;
    this.ref = ref;
    this.source = source;
    this.parent = parent;

    this.path = this.parent ? [...this.parent.path, this.parent] : [];
    this.name = node.name.text;
    this.qualifiedName = getName(node.name, this.path);
  }
  generate(): void {
    if (!this.hasException) return;
    if (DEBUG > 0) console.log(indent + "Generating namespace " + this.name);
    indent.add();
    for (const fn of this.functions) {
      fn.generate();
    }
    for (const namespace of this.namespaces) {
      namespace.generate();
    }
    indent.rm();
  }
}
