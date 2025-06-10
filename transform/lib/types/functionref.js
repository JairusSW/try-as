import { getFnName } from "../utils.js";
export class FunctionRef {
    node;
    ref;
    name;
    path;
    tries = [];
    exceptions = [];
    exported = false;
    constructor(node, ref, path = []) {
        this.node = node;
        this.ref = ref;
        this.path = path;
        this.name = getFnName(node.name, path);
    }
}
//# sourceMappingURL=functionref.js.map