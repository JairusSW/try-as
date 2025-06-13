import { BaseRef } from "./baseref.js";
import { SourceLinker } from "../passes/source.js";
export class SourceLocalRef {
    functions = [];
    imports = [];
    exports = [];
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
    findFn(name, indent = "", visitedPaths = new Set()) {
        const currentPath = this.node.internalPath;
        if (!currentPath || visitedPaths.has(currentPath))
            return null;
        visitedPaths.add(currentPath);
        let fnRef = this.functions.find(fn => fn.name === name);
        if (fnRef) {
            console.log(indent + `Identified ${name}() as exception`);
            return fnRef;
        }
        fnRef = this.local.functions.find(fn => fn.name === name);
        if (fnRef) {
            console.log(indent + `Found ${name} locally`);
            return fnRef;
        }
        const importMatch = this.local.imports.find(imp => imp.declarations.some(decl => name === decl.name.text || name.startsWith(decl.name.text + ".")));
        if (importMatch) {
            const basePath = importMatch.internalPath;
            let externSrc = SourceLinker.SS.sources.get(basePath) || SourceLinker.SS.sources.get(basePath + "/index");
            if (!externSrc) {
                throw new Error("Could not find " + basePath + " in sources!");
            }
            const result = externSrc.findFn(name, indent + "  ", visitedPaths);
            if (result) {
                console.log(indent + `Found ${name} externally`);
                return result;
            }
            const exported = externSrc.local.exports.find(exp => {
                if (exp.members) {
                    return exp.members.some(member => name === member.exportedName.text || name.startsWith(member.exportedName.text + "."));
                }
                else {
                    return true;
                }
            });
            if (exported) {
                const exportPath = exported.internalPath;
                const reexported = SourceLinker.SS.sources.get(exportPath) || SourceLinker.SS.sources.get(exportPath + "/index");
                if (reexported) {
                    const result = reexported.findFn(name, indent + "  ", visitedPaths);
                    if (result) {
                        console.log(indent + `Found ${name} exported externally`);
                        return result;
                    }
                }
            }
        }
        return null;
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