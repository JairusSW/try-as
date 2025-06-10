export class TryRef {
    node;
    ref;
    tryBlock;
    catchBlock;
    finallyBlock;
    parent = null;
    callStack = [];
    path = [];
    constructor(node, ref = null) {
        this.node = node;
        this.ref = ref;
    }
}
//# sourceMappingURL=tryref.js.map