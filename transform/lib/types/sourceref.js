import { BaseRef } from "./baseref.js";
import { SourceLinker } from "../passes/source.js";
import { indent } from "../globals/indent.js";
import { Globals } from "../globals/globals.js";
const rawValue = process.env["DEBUG"];
const DEBUG = rawValue == "true" ? 1 : rawValue == "false" || rawValue == "" ? 0 : isNaN(Number(rawValue)) ? 0 : Number(rawValue);
export class SourceLocalRef {
    namespaces = [];
    classes = [];
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
    classes = [];
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
    findLocalNs(qualifiedName, namespaces = this.local.namespaces, path = qualifiedName?.split(".") || []) {
        if (!path.length)
            return null;
        if (path.length == 1) {
            for (const namespace of namespaces) {
                if (namespace.name == path[0])
                    return namespace;
            }
            return null;
        }
        else {
            for (const namespace of namespaces) {
                if (namespace.name != path[0])
                    continue;
                const found = this.findLocalNs(null, namespace.namespaces, path.slice(1));
                if (found)
                    return found;
            }
            return null;
        }
    }
    findLocalFn(qualifiedName, functions = this.local.functions, path = qualifiedName?.split(".") || []) {
        if (!path.length)
            return null;
        if (path.length == 1) {
            for (const fn of functions) {
                if (fn.name == path[0])
                    return fn;
            }
            return null;
        }
        else {
            const fnName = path.pop();
            const ns = this.findLocalNs(null, this.local.namespaces, path);
            if (!ns)
                return null;
            for (const fn of ns.functions) {
                if (fn.name == fnName)
                    return fn;
            }
            return null;
        }
    }
    findLocalClass(qualifiedName, namespaces = this.local.namespaces, path = qualifiedName?.split(".") || []) {
        if (!path.length)
            return null;
        if (path.length === 1) {
            for (const cls of this.local.classes) {
                if (cls.name === path[0])
                    return cls;
            }
            return null;
        }
        else {
            const className = path.pop();
            const ns = this.findLocalNs(null, namespaces, path);
            if (!ns || !className)
                return null;
            for (const cls of ns.classes) {
                if (cls.name === className)
                    return cls;
            }
            return null;
        }
    }
    findLocalMethod(qualifiedName, namespaces = this.local.namespaces, path = qualifiedName?.split(".") || []) {
        if (!path.length)
            return null;
        if (path.length === 2) {
            const [className, methodName] = path;
            for (const cls of this.local.classes) {
                if (cls.name !== className)
                    continue;
                for (const method of cls.methods) {
                    if (method.name === methodName)
                        return method;
                }
            }
            return null;
        }
        else if (path.length > 2) {
            const methodName = path.pop();
            const classPath = path;
            const cls = this.findLocalClass(null, namespaces, classPath);
            if (cls && methodName) {
                for (const method of cls.methods) {
                    if (method.name === methodName)
                        return method;
                }
            }
        }
        return null;
    }
    getSourceByPath(path) {
        return Globals.sources.get(path) || Globals.sources.get(path + "/index") || null;
    }
    remapImportQuery(imp, qualifiedName) {
        if (!imp.declarations?.length)
            return qualifiedName;
        for (const decl of imp.declarations) {
            const local = decl.name.text;
            if (qualifiedName != local && !qualifiedName.startsWith(local + "."))
                continue;
            const foreign = decl.foreignName.text;
            return foreign + qualifiedName.slice(local.length);
        }
        return qualifiedName;
    }
    remapExportQueries(exp, qualifiedName) {
        if (!exp.members?.length)
            return [qualifiedName];
        const out = [];
        for (const member of exp.members) {
            const exported = member.exportedName.text;
            if (qualifiedName != exported && !qualifiedName.startsWith(exported + "."))
                continue;
            const local = member.localName.text;
            out.push(local + qualifiedName.slice(exported.length));
        }
        return out;
    }
    collectImportTargets(source, qualifiedName, visitedPaths, out, seen = new Set()) {
        const sourcePath = source.node.internalPath;
        const seenKey = sourcePath + "::" + qualifiedName;
        if (seen.has(seenKey))
            return;
        seen.add(seenKey);
        out.push([source, qualifiedName]);
        for (const exp of source.local.exports) {
            if (!exp.internalPath)
                continue;
            const targetPath = exp.internalPath;
            if (visitedPaths.has(targetPath))
                continue;
            const remappedQueries = this.remapExportQueries(exp, qualifiedName);
            if (!remappedQueries.length)
                continue;
            const target = this.getSourceByPath(targetPath);
            if (!target)
                continue;
            visitedPaths.add(targetPath);
            for (const remapped of remappedQueries) {
                this.collectImportTargets(target, remapped, visitedPaths, out, seen);
            }
        }
    }
    resolveImportTargets(imp, qualifiedName, visitedPaths) {
        if (!imp.internalPath)
            return [];
        const basePath = imp.internalPath;
        if (visitedPaths.has(basePath))
            return [];
        visitedPaths.add(basePath);
        const baseSource = this.getSourceByPath(basePath);
        if (!baseSource)
            return [];
        const remappedName = this.remapImportQuery(imp, qualifiedName);
        const targets = [];
        this.collectImportTargets(baseSource, remappedName, visitedPaths, targets);
        return targets;
    }
    findImportedFn(qualifiedName, visitedPaths = new Set()) {
        if (!qualifiedName)
            return [null, null];
        for (const imp of this.local.imports) {
            const matchesImport = imp.declarations?.some((decl) => qualifiedName == decl.name.text || qualifiedName.startsWith(decl.name.text + "."));
            if (!matchesImport)
                continue;
            const targets = this.resolveImportTargets(imp, qualifiedName, visitedPaths);
            for (const [externSource, lookupName] of targets) {
                const fn = externSource.findLocalFn(lookupName);
                if (fn)
                    return [fn, externSource];
            }
        }
        return [null, null];
    }
    findImportedNs(qualifiedName, visitedPaths = new Set()) {
        if (!qualifiedName)
            return [null, null];
        for (const imp of this.local.imports) {
            const matchesImport = imp.declarations?.some((decl) => qualifiedName == decl.name.text || qualifiedName.startsWith(decl.name.text + "."));
            if (!matchesImport)
                continue;
            const targets = this.resolveImportTargets(imp, qualifiedName, visitedPaths);
            for (const [externSource, lookupName] of targets) {
                const ns = externSource.findLocalNs(lookupName);
                if (ns)
                    return [ns, externSource];
            }
        }
        return [null, null];
    }
    findImportedMethod(qualifiedName, visitedPaths = new Set()) {
        if (!qualifiedName)
            return [null, null];
        for (const imp of this.local.imports) {
            const matches = imp.declarations?.some((decl) => qualifiedName == decl.name.text || qualifiedName.startsWith(decl.name.text + "."));
            if (!matches)
                continue;
            const targets = this.resolveImportTargets(imp, qualifiedName, visitedPaths);
            for (const [externSource, lookupName] of targets) {
                const method = externSource.findLocalMethod(lookupName);
                if (method)
                    return [method, externSource];
            }
        }
        return [null, null];
    }
    findFn(name, visitedPaths = new Set()) {
        if (!name)
            return [null, null];
        const currentPath = this.node.internalPath;
        if (!currentPath || visitedPaths.has(currentPath))
            return [null, null];
        visitedPaths.add(currentPath);
        let fnRef = this.findLocalFn(name);
        if (fnRef) {
            if (DEBUG > 0)
                console.log(indent + "Found function: " + fnRef.qualifiedName + " (local)");
            return [fnRef, this];
        }
        {
            const [externFn, externSrc] = this.findImportedFn(name, visitedPaths);
            if (externFn) {
                if (DEBUG > 0)
                    console.log(indent + "Found imported function: " + externFn.qualifiedName + " (imported/" + externFn.hasException + ")");
                return [externFn, externSrc];
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
        for (const cls of this.classes) {
            cls.generate();
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