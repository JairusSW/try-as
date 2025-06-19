import { BaseRef } from "./baseref.js";
import { SourceLinker } from "../passes/source.js";
import { indent } from "../globals/indent.js";
import { Globals } from "../globals/globals.js";
const rawValue = process.env["DEBUG"];
const DEBUG = rawValue === "true" ? 1 : rawValue === "false" || rawValue === "" ? 0 : isNaN(Number(rawValue)) ? 0 : Number(rawValue);
export class SourceLocalRef {
    functions = [];
    imports = [];
    exports = [];
}
export class SourceRef extends BaseRef {
    linker;
    node;
    tries = [];
    functions = [];
    namespaces = [];
    imports = [];
    state = "ready";
    dependencies = new Set();
    local = new SourceLocalRef();
    generated = false;
    constructor(source) {
        super();
        this.node = source;
        this.linker = new SourceLinker(this);
    }
    findFn(name, visitedPaths = new Set()) {
        const currentPath = this.node.internalPath;
        if (!currentPath || visitedPaths.has(currentPath))
            return [null, null];
        visitedPaths.add(currentPath);
        let fnRef = this.functions.find((fn) => fn?.name === name);
        if (fnRef) {
            if (DEBUG > 0)
                indent + `Identified ${name}() as exception`;
            return [fnRef, this];
        }
        fnRef = this.local.functions.find((fn) => fn.name === name);
        if (fnRef) {
            if (DEBUG > 0)
                console.log(indent + `Found ${name} locally`);
            return [fnRef, this];
        }
        const importMatch = this.local.imports.find((imp) => imp.declarations.some((decl) => name === decl.name.text || name.startsWith(decl.name.text + ".")));
        if (importMatch) {
            const basePath = importMatch.internalPath;
            let externSrc = Globals.sources.get(basePath) || Globals.sources.get(basePath + "/index");
            if (!externSrc) {
                throw new Error("Could not find " + basePath + " in sources!");
            }
            const result = externSrc.findFn(name, visitedPaths);
            if (result) {
                if (DEBUG > 0)
                    console.log(indent + `Found ${name} externally`);
                return result;
            }
            const exported = externSrc.local.exports.find((exp) => {
                if (exp.members) {
                    return exp.members.some((member) => name === member.exportedName.text || name.startsWith(member.exportedName.text + "."));
                }
                else {
                    return true;
                }
            });
            if (exported) {
                const exportPath = exported.internalPath;
                const reexported = Globals.sources.get(exportPath) || Globals.sources.get(exportPath + "/index");
                if (reexported) {
                    const result = reexported.findFn(name, visitedPaths);
                    if (result) {
                        if (DEBUG > 0)
                            console.log(indent + `Found ${name} exported externally`);
                        return result;
                    }
                }
            }
        }
        return [null, null];
    }
    generate() {
        if (this.generated)
            return;
        this.generated = true;
        for (const fn of this.functions) {
            fn.generate();
        }
        for (const fn of this.namespaces) {
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