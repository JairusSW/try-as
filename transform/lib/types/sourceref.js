export class SourceRef {
    source;
    tries = [];
    functions = [];
    imports = [];
    state = "ready";
    constructor(source) {
        this.source = source;
    }
}
//# sourceMappingURL=sourceref.js.map