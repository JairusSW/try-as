import { Visitor } from "../lib/visitor.js";
import { getFnName } from "../utils.js";
import { CallLinker } from "./call.js";
import { toString } from "../lib/util.js";
const DEBUG = process.env["DEBUG"]
  ? process.env["DEBUG"] == "true"
    ? true
    : false
  : false;
export class FunctionData {
  unroller;
  node;
  ref;
  linked = false;
  path;
  exported = false;
  imported = false;
  constructor(
    node,
    ref,
    exported = false,
    hasBaseException = false,
    path = null,
  ) {
    this.node = node;
    this.ref = ref;
    this.exported = exported;
    this.path = path;
    this.unroller = hasBaseException;
  }
  clone() {
    const fn = new FunctionData(
      this.node,
      this.ref,
      this.exported,
      this.unroller,
      this.path,
    );
    fn.linked = this.linked;
    fn.imported = this.imported;
    return fn;
  }
}
export class SourceData {
  source;
  fns;
  imports;
  constructor(source, fns = [], imports = []) {
    this.source = source;
    this.fns = fns;
    this.imports = imports;
  }
}
export class FunctionLinkerState {
  path;
  foundException = false;
  sourceData;
  sD;
  visitedSources;
  constructor(path, foundException, sourceData, sD, visitedSources) {
    this.path = path;
    this.sourceData = sourceData;
    this.foundException = foundException;
    this.sD = sD;
    this.visitedSources = visitedSources;
  }
}
export class FunctionLinker extends Visitor {
  static SN = new FunctionLinker();
  path = new Map();
  foundException = false;
  sources = [];
  sourceData = [];
  sD;
  visitedSources = new Set();
  visitImportStatement(node, ref) {
    const path = node.internalPath;
    const pathSource =
      this.sources.find((v) => v.internalPath == path) ||
      this.sources.find((v) => v.internalPath == path + "/assembly/index") ||
      this.sources.find((v) => v.internalPath == path + "/index");
    if (!pathSource) return;
    const externSource = this.analyzeSource(pathSource);
    this.sD.imports.push(externSource);
  }
  visitFunctionDeclaration(node, isDefault, ref) {
    super.visitFunctionDeclaration(node, isDefault, ref);
    const hasException = CallLinker.hasException(node.body);
    if (this.foundException || hasException) {
      const path = this.path.size ? new Map(this.path.entries()) : null;
      this.sD.fns.push(
        new FunctionData(
          node,
          ref,
          node.flags & 2 ? true : false,
          hasException,
          path,
        ),
      );
      if (DEBUG)
        console.log(
          "Added Function" +
            (hasException ? " (unroller): " : ":") +
            node.name.text +
            " in " +
            node.range.source.internalPath,
        );
      this.foundException = false;
    }
  }
  visitMethodDeclaration(node, ref) {
    this.foundException = false;
    super.visitMethodDeclaration(node, ref);
    if (this.foundException) {
      const hasException = CallLinker.hasException(node.body);
      const path = this.path.size ? new Map(this.path.entries()) : null;
      this.sD.fns.push(new FunctionData(node, ref, false, hasException, path));
    }
  }
  visitCallExpression(node, ref) {
    const fnName = getFnName(node.expression);
    if (!fnName) return super.visitCallExpression(node, ref);
    if (fnName === "abort" || fnName === "unreachable") {
      this.foundException = true;
    }
    super.visitCallExpression(node, ref);
  }
  visitThrowStatement(node, ref) {
    this.foundException = true;
  }
  visitNamespaceDeclaration(node, isDefault, ref) {
    const nsName = node.name.text;
    this.path.set(nsName, node);
    super.visitNamespaceDeclaration(node, isDefault, ref);
    this.path.delete(nsName);
  }
  visitClassDeclaration(node, isDefault, ref) {
    this.path.set(node.name.text, node);
    super.visitClassDeclaration(node, isDefault, ref);
    this.path.delete(node.name.text);
  }
  visitSource(node, ref) {
    if (!node) return;
    if (this.visitedSources.has(node.internalPath)) return;
    this.sD = new SourceData(node);
    this.sourceData.push(this.sD);
    super.visitSource(node, ref);
    this.visitedSources.add(node.internalPath);
  }
  analyzeSource(node) {
    if (this.visitedSources.has(node.internalPath)) {
      const foundSource = this.sourceData.find(
        (v) => v.source.internalPath == node.internalPath,
      );
      if (foundSource) return foundSource;
    }
    const state = this.saveState();
    const visitor = new FunctionLinker();
    this.restoreState(state, visitor);
    visitor.visitSource(node);
    this.sourceData = visitor.sourceData;
    return visitor.sD;
  }
  saveState(o = this) {
    return new FunctionLinkerState(
      this.path,
      this.foundException,
      this.sourceData,
      this.sD,
      this.visitedSources,
    );
  }
  restoreState(state, o = this) {
    o.path = state.path;
    o.foundException = state.foundException;
    o.sourceData = state.sourceData;
    o.sD = state.sD;
    o.visitedSources = state.visitedSources;
  }
  static visitSources(sources) {
    FunctionLinker.SN.sources = sources;
    for (const source of sources) {
      FunctionLinker.SN.visitSource(source);
    }
    console.log("Functions: ");
    FunctionLinker.SN.sD.fns.forEach((v) =>
      console.log("  " + toString(v.node)),
    );
  }
  static getFunction(fnName, path = null) {
    const name = getFnName(fnName, path);
    if (name == "console.log") return null;
    const source = fnName.range.source;
    const sourceData = FunctionLinker.SN.sourceData.find(
      (v) => v.source.internalPath == source.internalPath,
    );
    if (!sourceData) return null;
    const localFn = sourceData.fns.find((v) => {
      return (
        name ==
        getFnName(v.node.name, v.path ? Array.from(v.path.keys()) : null)
      );
    });
    if (localFn) return localFn;
    for (const imported of sourceData.imports) {
      let importedFn = imported.fns.find((v) => {
        return (
          v.exported &&
          name ==
            getFnName(v.node.name, v.path ? Array.from(v.path.keys()) : null)
        );
      });
      if (importedFn) {
        importedFn = importedFn.clone();
        importedFn.imported = true;
        return importedFn;
      }
    }
    return null;
  }
  static getNamespace(ns) {
    return FunctionLinker.SN.path.get(ns) ?? null;
  }
  static rmFunction(fnName) {
    const index = FunctionLinker.SN.sD.fns.findIndex(
      (fn) => getFnName(fn.node.name) === fnName,
    );
    if (index !== -1) {
      FunctionLinker.SN.sD.fns.splice(index, 1);
    }
  }
  static reset() {
    FunctionLinker.SN.sD.fns = [];
    FunctionLinker.SN.path.clear();
  }
}
//# sourceMappingURL=function.js.map
