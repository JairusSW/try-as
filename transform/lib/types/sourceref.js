export class SourceLocalRef {
    functions = [];
    imports = [];
}
export class SourceRef {
    node;
    tries = [];
    functions = [];
    imports = [];
    state = "ready";
    dependencies = new Set();
    local = new SourceLocalRef();
    constructor(source) {
        this.node = source;
    }
    generate() {
        for (const fn of this.functions) {
            fn.generate();
        }
        for (const tryRef of this.tries) {
            tryRef.generate();
        }
        for (const dependency of this.dependencies) {
            dependency.generate();
        }
    }
}
//# sourceMappingURL=sourceref.js.map