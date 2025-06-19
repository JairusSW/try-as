import { BaseRef } from "./baseref.js";
import { getName } from "../utils";
export class MethodRef extends BaseRef {
    node;
    ref;
    name;
    parent;
    tries = [];
    exceptions = [];
    callers = [];
    exported;
    hasException = false;
    cloneBody;
    constructor(node, ref, parent) {
        super();
        this.node = node;
        this.ref = ref;
        this.parent = parent;
        this.name = getName(node.name, [this.parent, ...this.parent.path]);
    }
}
//# sourceMappingURL=methodref.js.map