import { BaseRef } from "./baseref.js";
export class SourceLocalRef {
    functions = [];
    imports = [];
}
export class SourceRef extends BaseRef {
    node;
    tries = [];
    functions = [];
    imports = [];
    state = "ready";
    dependencies = new Set();
    local = new SourceLocalRef();
    generated = false;
    constructor(source) {
        super();
        this.node = source;
    }
    generate() {
        if (this.generated)
            return;
        this.generated = true;
        for (const fn of this.functions) {
            fn.generate();
        }
        for (const dependency of this.dependencies) {
            dependency.generate();
        }
        for (const tryRef of this.tries) {
            tryRef.generate();
        }
    }
    update(ref) {
        this.node = ref.node;
        this.tries = ref.tries;
        this.functions = ref.functions;
        this.imports = ref.imports;
        return this;
    }
}
//# sourceMappingURL=sourceref.js.map