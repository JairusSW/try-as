import { BaseRef } from "./baseref.js";
import { getName } from "../utils.js";
import { indent } from "../globals/indent.js";
const rawValue = process.env["DEBUG"];
const DEBUG = rawValue == "true" ? 1 : rawValue == "false" || rawValue == "" ? 0 : isNaN(Number(rawValue)) ? 0 : Number(rawValue);
export class ClassRef extends BaseRef {
    node;
    ref;
    source;
    name;
    qualifiedName;
    path;
    parent;
    methods = [];
    exported;
    constructor(node, ref, source, parent) {
        super();
        this.node = node;
        this.ref = ref;
        this.source = source;
        this.parent = parent;
        this.path = this.parent ? [...this.parent.path, this.parent] : [];
        this.name = node.name.text;
        this.qualifiedName = getName(node.name, this.path);
        this.exported = Boolean(node.flags & 2);
    }
    generate() {
        if (!this.hasException)
            return;
        if (DEBUG > 0)
            console.log(indent + "Generating methods");
        indent.add();
        for (const method of this.methods) {
            method.generate();
        }
        indent.rm();
    }
}
//# sourceMappingURL=classref.js.map