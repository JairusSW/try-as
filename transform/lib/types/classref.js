import { BaseRef } from "./baseref.js";
import { getName } from "../utils.js";
export class ClassRef extends BaseRef {
    node;
    ref;
    name;
    path;
    parent;
    methods;
    exported;
    constructor(node, ref, parent) {
        super();
        this.node = node;
        this.ref = ref;
        this.parent = parent;
        this.path = this.parent ? [...this.parent.path, this.parent] : [];
        this.name = getName(node.name, this.path);
        this.exported = Boolean(node.flags & 2);
    }
}
//# sourceMappingURL=classref.js.map