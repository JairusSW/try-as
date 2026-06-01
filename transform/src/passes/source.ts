import { CallExpression, ClassDeclaration, CommonFlags, ExportMember, ExportStatement, FunctionDeclaration, IfStatement, ImportDeclaration, ImportStatement, MethodDeclaration, NamespaceDeclaration, Node, NodeKind, Source, SourceKind, ThrowStatement, TryStatement } from "assemblyscript/dist/assemblyscript.js";
import { SourceRef } from "../types/sourceref.js";
import { Visitor } from "../lib/visitor.js";
import { indent } from "../globals/indent.js";
import { FunctionRef } from "../types/functionref.js";
import { blockify, getName, isStmtListMember } from "../utils.js";
import { ExceptionRef } from "../types/exceptionref.js";
import { CallRef } from "../types/callref.js";
import { TryRef } from "../types/tryref.js";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { Globals } from "../globals/globals.js";
import path from "path";
import fs from "fs";

// Resolve a specifier from the consumer's project root via Node's module
// resolver — works for npm, yarn, symlinks, and (hoisted) pnpm without the
// caller needing --preserve-symlinks. `selfDir` guards against Node's
// package self-reference when the transform is being exercised from within
// try-as's own checkout (consumer cwd is inside try-as). A symlinked
// install where the consumer is OUTSIDE try-as is the opposite case and
// must not trip the guard — that's why the test is on cwd, not on the
// resolved path.
function resolveFromConsumer(specifier: string, selfDir?: string): string | null {
  const cwd = Globals.baseCWD || process.cwd();
  const anchor = path.join(cwd, "package.json");
  let resolved: string;
  try {
    resolved = createRequire(anchor).resolve(specifier);
  } catch {
    return null;
  }
  if (selfDir) {
    try {
      const cwdReal = fs.realpathSync(cwd);
      const selfReal = fs.realpathSync(selfDir);
      if (cwdReal === selfReal || cwdReal.startsWith(selfReal + path.sep)) return null;
    } catch {
      // realpath failure: fall through.
    }
  }
  return resolved;
}
import { toString } from "../lib/util.js";
import { ClassRef } from "../types/classref.js";
import { NamespaceRef } from "../types/namespaceref.js";
import { MethodRef } from "../types/methodref.js";

const rawValue = process.env["DEBUG"];
const DEBUG = rawValue == "true" ? 1 : rawValue == "false" || rawValue == "" ? 0 : isNaN(Number(rawValue)) ? 0 : Number(rawValue);

export interface LinkOptions {
  importScope?: "all" | "user";
}

export class SourceLinker extends Visitor {
  public node: Source;
  public state: "ready" | "gather" | "link" | "postprocess" | "done" = "ready";
  public source: SourceRef;

  public path: string[] = [];
  public parentSpace: NamespaceRef | ClassRef | null = null;
  public entryFns: FunctionRef[] = [];
  public entryFn: FunctionRef | null = null;

  public visitedFns: Set<FunctionRef | MethodRef> = new Set();

  // Track the nearest enclosing statement (and the array holding it) as we
  // descend, so a CallRef constructed deep in an expression slot (a variable
  // initializer, argument, or method-chain receiver) can anchor a trailing
  // unroll-check after the WHOLE statement. Pushed only for genuine statement-
  // list members (`isStmtListMember`): argument/param/declaration sub-arrays
  // hold expressions or declaration fragments, so they never push — splicing a
  // guard there would corrupt the AST.
  visit(node: Node | Node[] | null, ref: Node | Node[] | null = null): void {
    if (Array.isArray(node)) {
      for (const n of node) {
        const isStmt = isStmtListMember(n);
        if (isStmt) Globals.stmtStack.push({ node: n, container: node });
        this._visit(n, node);
        if (isStmt) Globals.stmtStack.pop();
      }
      return;
    }
    super.visit(node, ref);
  }

  constructor(sourceRef: SourceRef) {
    super();
    this.source = sourceRef;
    this.node = sourceRef.node;
  }
  visitImportStatement(node: ImportStatement, ref: Node | Node[] | null = null): void {
    if (this.state != "gather" || !node.internalPath) return super.visitImportStatement(node, ref);
    if (node.internalPath.startsWith("~lib/rt") || node.internalPath.startsWith("~lib/performance") || node.internalPath.startsWith("~lib/wasi_") || node.internalPath.startsWith("~lib/shared/")) return super.visitImportStatement(node, ref);
    this.source.local.imports.push(node);
    const targetSourceRef = Globals.sources.get(node.internalPath) || Globals.sources.get(node.internalPath + "/index");
    if (!targetSourceRef) return super.visitImportStatement(node, ref); // throw new Error("Could not find " + node.internalPath + " in sources!");
    if (targetSourceRef.state != "ready") return super.visitImportStatement(node, ref);
    if (node.internalPath == node.range.source.internalPath) return super.visitImportStatement(node, ref);
    if (DEBUG > 0) console.log(indent + node.range.source.internalPath + " -> " + targetSourceRef.node.internalPath);

    this.source.dependencies.add(targetSourceRef);
    targetSourceRef.linker.gather();
    super.visitImportStatement(node, ref);
  }
  public hasException: boolean = false;
  visitExportStatement(node: ExportStatement, ref: Node | Node[] | null = null): void {
    if (this.state != "gather" || !node.internalPath) return super.visitExportStatement(node, ref);
    if (node.internalPath.startsWith("~lib/rt") || node.internalPath.startsWith("~lib/performance") || node.internalPath.startsWith("~lib/wasi_") || node.internalPath.startsWith("~lib/shared/")) return super.visitExportStatement(node, ref);
    this.source.local.exports.push(node);
    const targetSourceRef = Globals.sources.get(node.internalPath) || Globals.sources.get(node.internalPath + "/index");
    if (!targetSourceRef) return super.visitExportStatement(node, ref); // throw new Error("Could not find " + node.internalPath + " in sources!");
    if (targetSourceRef.state != "ready") return super.visitExportStatement(node, ref);
    if (node.internalPath == node.range.source.internalPath) return super.visitExportStatement(node, ref);
    if (DEBUG > 0) console.log(indent + node.range.source.internalPath + " -> " + targetSourceRef.node.internalPath);

    this.source.dependencies.add(targetSourceRef);
    targetSourceRef.linker.gather();
    super.visitExportStatement(node, ref);
  }
  visitMethodDeclaration(node: MethodDeclaration, ref: Node | Node[] | null = null): void {
    if (this.state != "gather" || !this.parentSpace) return super.visitMethodDeclaration(node, ref);
    if (this.parentSpace instanceof NamespaceRef) return super.visitMethodDeclaration(node, ref);
    // Constructors are tracked too so their body throws get rewritten via the
    // shared exception-state machinery, but MethodRef.generate is careful not
    // to rename them (`constructor` is a reserved class-shape name).
    const methRef = new MethodRef(node, ref, this.source, this.parentSpace);
    Globals.methods.push(methRef);
    if (DEBUG > 0) console.log(indent + "Found method " + methRef.name);
    this.parentSpace.methods.push(methRef);
    super.visitMethodDeclaration(node, ref);
  }
  visitFunctionDeclaration(node: FunctionDeclaration, isDefault: boolean = false, ref: Node | Node[] | null = null): void {
    if (this.state == "gather") {
      const fnRef = new FunctionRef(node, ref, this.source, this.parentSpace as NamespaceRef | null);
      // console.log(indent + "Found function " + fnRef.qualifiedName);
      if (this.parentSpace && this.parentSpace instanceof NamespaceRef) {
        this.parentSpace.functions.push(fnRef);
      } else {
        this.source.local.functions.push(fnRef);
      }

      if (this.source.node.sourceKind == SourceKind.UserEntry && node.is(CommonFlags.Export)) {
        const fnRef = this.source.local.functions.find((v) => v.node == node) ?? null;
        if (fnRef && !fnRef.parent) {
          if (DEBUG > 0) console.log(indent + "Found entry function " + fnRef.qualifiedName);
          this.source.functions.push(fnRef!);
          Globals.refStack.add(fnRef!);

          this.entryFns.push(fnRef);
          Globals.lastFn = fnRef;
          Globals.parentFn = fnRef;
          super.visitFunctionDeclaration(fnRef.node, false, fnRef.ref);
          Globals.lastFn = null;
          Globals.parentFn = null;
          Globals.refStack.delete(fnRef!);
          return;
        }
      }

      Globals.parentFn = fnRef;
      super.visitFunctionDeclaration(node, isDefault, ref);
      Globals.parentFn = null;
      return;
    }
    // Match by node identity first so anonymous arrow callbacks
    // (`(): void => { throw ... }` passed to expect-like helpers) get
    // attributed to their own FunctionRef. Matching by name alone returns
    // null for arrows (their `node.name.text` is empty), which leaves the
    // body's throws orphaned. If we find an arrow's ref, also push it into
    // source.functions and Globals.refStack so `smashStack` marks it
    // hasException and SourceRef.generate emits its lowered body.
    const byNode = this.source.local.functions.find((v) => v.node == node) ?? null;
    const parentFn = byNode ?? this.source.local.functions.find((v) => v.name == node.name.text) ?? null;
    if (byNode && !this.source.functions.includes(byNode)) {
      this.source.functions.push(byNode);
    }
    // Save and restore parentFn around the body walk so nested arrows don't
    // clobber the OUTER tracked function's parentFn — otherwise `getBreaker`
    // would emit a bare `break;` after the arrow returns.
    //
    // For named top-level functions, ALSO set lastFn so visitTryStatement's
    // path A fires and attaches the try directly to the function's `tries`
    // (FunctionRef.generate's `if (!this.tries.length)` clone-and-rename
    // branch then correctly stays off). For anonymous arrows, leave lastFn
    // alone — their tries should fall through to the source-level path so
    // outer/inner try nesting flows through `Globals.lastTry` rather than
    // getting flattened onto the arrow itself.
    const isNamed = node.name.text.length > 0;
    const savedParentFn = Globals.parentFn;
    const savedLastFn = Globals.lastFn;
    Globals.parentFn = parentFn ?? savedParentFn;
    if (parentFn && isNamed) Globals.lastFn = parentFn;
    if (byNode) Globals.refStack.add(byNode);
    super.visitFunctionDeclaration(node, isDefault, ref);
    if (byNode) Globals.refStack.delete(byNode);
    Globals.parentFn = savedParentFn;
    Globals.lastFn = savedLastFn;
  }
  linkFunctionRef(fnRef: FunctionRef): void {
    if (!fnRef || (fnRef.visited && !fnRef.hasException)) return;
    indent.add();
    Globals.callStack.add(fnRef);

    if (DEBUG > 0) {
      const stackNames = Array.from(Globals.callStack.values())
        .map((fn) => fn.name)
        .join(", ");
      if (DEBUG > 0) console.log(`${indent}Stack [${stackNames}] ${this.node.internalPath}`);
    }

    fnRef.state = "done";
    const lastFn = Globals.lastFn;
    const parentFn = Globals.parentFn;
    Globals.lastFn = fnRef;
    Globals.parentFn = fnRef;
    fnRef.visited = true;
    super.visitFunctionDeclaration(fnRef.node, false, fnRef.ref);
    Globals.parentFn = parentFn;
    Globals.lastFn = lastFn;

    Globals.callStack.delete(fnRef);

    indent.rm();
  }

  linkMethodRef(methRef: MethodRef): void {
    if (!methRef || (methRef.visited && !methRef.hasException)) return;
    indent.add();
    Globals.callStack.add(methRef);

    if (DEBUG > 0) {
      const stackNames = Array.from(Globals.callStack.values())
        .map((fn) => fn.name)
        .join(", ");
      if (DEBUG > 0) console.log(`${indent}Stack [${stackNames}] ${this.node.internalPath}`);
    }

    methRef.state = "done";
    const lastFn = Globals.lastFn;
    const parentFn = Globals.parentFn;
    Globals.lastFn = methRef;
    Globals.parentFn = methRef;
    methRef.visited = true;
    super.visitMethodDeclaration(methRef.node, methRef.ref);
    Globals.parentFn = parentFn;
    Globals.lastFn = lastFn;

    Globals.callStack.delete(methRef);

    indent.rm();
  }

  visitCallExpression(node: CallExpression, ref: Node | Node[] | null = null): void {
    if (this.state == "gather") return super.visitCallExpression(node, ref);
    // Trace calls whenever we're inside ANY tracked body — a named function
    // (`lastFn`), a try region (`lastTry`), OR an anonymous arrow / callback
    // body (`parentFn`). Anonymous arrows deliberately don't set `lastFn` (it
    // governs try-attachment), but their call chains must still be followed:
    // `expect((): void => { lib.parse(bad) }).toThrow()` has to walk into
    // `parse`'s deep (cross-module, generic) call graph so a reject-throw down
    // there is lowered to catchable state instead of staying a raw abort.
    if (this.state != "postprocess" && !Globals.lastFn && !Globals.lastTry && !Globals.parentFn) return super.visitCallExpression(node, ref);

    const fnName = getName(node.expression);
    // `inline.always(X)` / `inline.never(X)` / `unchecked(X)` and friends
    // are AS builtins that take a *plain CallExpression* argument and inline
    // its body in place. If we rename X to `__try_X`, the renamed body
    // starts with an `if (__ExceptionState.Failures > 0) return;` unroll
    // check — a Statement — and AS lands that inside the builtin's
    // expression slot, then asserts in `compileCommaExpression` /
    // `compileExpression`. Mark CallRefs created while walking the args so
    // CallRef.generate can skip the rename for them.
    if (fnName == "inline.always" || fnName == "inline.never" || fnName == "unchecked") {
      const wasInBuiltin = Globals.inInlineBuiltinArg;
      const savedWrapper = Globals.inlineBuiltinWrapper;
      Globals.inInlineBuiltinArg = true;
      Globals.inlineBuiltinWrapper = { node, ref };
      const result = super.visitCallExpression(node, ref);
      Globals.inInlineBuiltinArg = wasInBuiltin;
      Globals.inlineBuiltinWrapper = savedWrapper;
      return result;
    }

    if (fnName == "unreachable" || fnName == "abort") {
      if (DEBUG > 0) console.log(indent + "Found exception " + toString(node) + " " + node.range.source.internalPath);
      Globals.foundException = true;
      const newException = new ExceptionRef(node, ref, this.source, Globals.parentFn);
      newException.hasException = true;
      if (Globals.parentFn) Globals.parentFn.exceptions.push(newException);
      else if (Globals.lastTry) Globals.lastTry.exceptions.push(newException);
      // No enclosing function or try — top-level abort/unreachable, just
      // walk past it. Don't propagate via smashStack since there's nothing
      // to attribute to.
      else return super.visitCallExpression(node, ref);

      this.smashStack();

      return super.visitCallExpression(node, ref);
    }

    let [fnRef, fnSrc] = this.source.findFn(fnName);
    if (!fnRef || !fnSrc) return super.visitCallExpression(node, ref);
    const callRef = new CallRef(node, ref, fnRef, this.source, Globals.parentFn);
    callRef.inInlineBuiltinArg = Globals.inInlineBuiltinArg;
    callRef.inlineWrapper = Globals.inlineBuiltinWrapper;
    Globals.refStack.add(callRef);
    fnRef?.callers.push(callRef);

    if (DEBUG > 0) console.log(indent + "Found call " + toString(node) + " (" + fnRef?.name + "/" + fnRef?.hasException + ")");

    if (fnRef.hasException) {
      callRef.hasException = true;
      if (Globals.parentFn) Globals.parentFn.exceptions.push(callRef);
      else if (Globals.lastTry) Globals.lastTry.exceptions.push(callRef);
      // Throwing call outside any tracked function/try — likely at module
      // scope. Nothing to attribute the exception to, just walk on.
      else return super.visitCallExpression(node, ref);
      this.smashStack();
      // Callee throws and this site is registered — walk the args and stop.
      return super.visitCallExpression(node, ref);
    }

    // `inInlineBuiltinArg` marks ONLY the direct argument call of an
    // `inline.always(...)` / `unchecked(...)` builtin (already captured onto
    // this CallRef above). It must NOT leak into the callee's body: the calls
    // *inside* deserializeArray are ordinary calls, not builtin-arg slots, and
    // leaving the flag set would make CallRef.generate skip redirecting them —
    // so a throw deep inside an inline.always'd function stays a raw abort.
    const savedInlineArg = Globals.inInlineBuiltinArg;
    const savedInlineWrapper = Globals.inlineBuiltinWrapper;
    Globals.inInlineBuiltinArg = false;
    Globals.inlineBuiltinWrapper = null;
    // Re-link the callee body only the FIRST time it's resolved (`visited`
    // guards redundant work and recursion). But a throwing ARGUMENT can flag
    // THIS call site on any visit — `smashStack` marks the CallRef while it
    // sits on `refStack` — so we must still walk the arguments below and run
    // the post-argument registration regardless of `visited`. The old
    // `|| fnRef.visited` early return skipped that registration, orphaning
    // 2nd+ call sites of an already-visited (non-throwing) callee that took a
    // throwing argument: the CallRef was flagged hasException but never pushed
    // into the enclosing function's `exceptions`, so it was never rewritten —
    // no `isDefined`-if redirect, no trailing unroll-check, and statements
    // after the throwing call ran with `__ExceptionState.Failures` already set.
    if (!fnRef.visited) {
      if (fnSrc.node.internalPath != this.node.internalPath) fnSrc.linker.link();
      if (fnRef instanceof FunctionRef) fnSrc.linker.linkFunctionRef(fnRef);
      else fnSrc.linker.linkMethodRef(fnRef);
    }

    super.visitCallExpression(node, ref);
    Globals.inInlineBuiltinArg = savedInlineArg;
    Globals.inlineBuiltinWrapper = savedInlineWrapper;

    if (fnRef.hasException || callRef.hasException) {
      if (DEBUG > 0) console.log("Adding call to " + fnRef.qualifiedName);
      callRef.hasException = true;
      if (Globals.parentFn) Globals.parentFn.exceptions.push(callRef);
      else if (Globals.lastTry) Globals.lastTry.exceptions.push(callRef);
      // Throwing call outside any tracked function/try — likely at module
      // scope. Nothing to attribute the exception to, just walk on.
      else return super.visitCallExpression(node, ref);
      this.smashStack();
    }

    Globals.refStack.delete(callRef);
  }

  visitThrowStatement(node: ThrowStatement, ref: Node | Node[] | null = null): void {
    if (this.state != "link" && this.state != "done" && this.state != "postprocess") return super.visitThrowStatement(node, ref);
    // Identifier throws inside a catch body are handled by ThrowReplacer
    // (isDefined-guarded __try_rethrow / rethrow / throw fallback) so user
    // hooks like `RethrowPreference.__try_rethrow` still fire when a
    // re-thrown identifier value carries them.  Walk past without creating
    // an ExceptionRef so the raw ThrowStatement survives into the post pass.
    if (Globals.inCatchBody && node.value.kind == NodeKind.Identifier) return super.visitThrowStatement(node, ref);
    // Allow throws inside any tracked function (e.g. arrow callbacks passed
    // to test helpers), not just throws nested in a try block — otherwise
    // `expect((): void => { throw ... }).toThrow()` keeps the raw throw and
    // aborts at runtime.
    if (this.state != "postprocess" && !Globals.lastTry && !Globals.parentFn) return super.visitThrowStatement(node, ref);
    // Throws inside @inline parentFns ARE rewritten now: FunctionRef.generate
    // emits a non-inline `__try_<name>` shadow for throwing @inline functions
    // (keeping the original @inline for non-exception callers), so the lowered
    // throw lives in a real function and never has to inline into an expression
    // slot. (Previously these throws were left raw — uncatchable.)
    if (DEBUG > 0) console.log(indent + "Found exception " + toString(node));
    Globals.foundException = true;
    const newException = new ExceptionRef(node, ref, this.source, Globals.parentFn);
    if (Globals.parentFn) Globals.parentFn.exceptions.push(newException);
    else if (Globals.lastTry) Globals.lastTry.exceptions.push(newException);
    // No enclosing function or try — top-level throw. Nothing to attribute
    // it to, so walk past it without smashStack.
    else return super.visitThrowStatement(node, ref);

    this.smashStack();

    return super.visitThrowStatement(node, ref);
  }

  visitTryStatement(node: TryStatement, ref: Node | Node[] | null = null): void {
    // if (this.entryFn) {
    //   const tryRef = new TryRef(node, ref, this.source);
    //   this.entryFn.tries.push(tryRef);
    //   const lastFn = Globals.lastFn;
    //   const parentFn = Globals.parentFn;
    //   Globals.lastFn = this.entryFn;
    //   Globals.parentFn = null;
    //   Globals.refStack.add(tryRef);
    //   this.visit(node.bodyStatements, node);
    //   Globals.refStack.delete(tryRef);
    //   Globals.parentFn = parentFn;
    //   Globals.lastFn = lastFn;
    //   this.visit(node.catchVariable, node);
    //   this.visit(node.catchStatements, node);
    //   this.visit(node.finallyStatements, node);
    //   return;
    // } else
    if (Globals.lastFn) {
      if (DEBUG > 0 && this.state == "link") console.log(indent + "Entered Try");
      const tryRef = new TryRef(node, ref, this.source);
      Globals.lastFn.tries.push(tryRef);
      const lastTry = Globals.lastTry;
      const parentFn = Globals.parentFn;
      Globals.lastTry = tryRef;
      Globals.parentFn = null;
      Globals.refStack.add(tryRef);
      this.visit(node.bodyStatements, node);
      Globals.refStack.delete(tryRef);
      Globals.lastTry = lastTry;
      this.visit(node.catchVariable, node);
      // Visit catch body with parentFn cleared and lastTry pointed at this
      // try, so exception rewrites inside the catch use `break` (handled by
      // TryRef.generate wrapping the catch in its own do/while) rather than a
      // function-`return` that would skip the trailing finally block.
      Globals.lastTry = tryRef;
      Globals.refStack.add(tryRef);
      const wasInCatchA = Globals.inCatchBody;
      Globals.inCatchBody = true;
      this.visit(node.catchStatements, node);
      Globals.inCatchBody = wasInCatchA;
      Globals.refStack.delete(tryRef);
      Globals.parentFn = parentFn;
      Globals.lastTry = lastTry;
      this.visit(node.finallyStatements, node);
      if (DEBUG > 0 && this.state == "link") console.log(indent + "Exited Try");
      return;
    }

    if (this.state != "link") return super.visitTryStatement(node, ref);

    const tryRef = new TryRef(node, ref, this.source);
    (Globals.lastTry ? Globals.lastTry.tries : this.source.tries).push(tryRef);

    if (DEBUG > 0) console.log(indent + "Entered Try");
    const lastTry = Globals.lastTry;
    const parentFn = Globals.parentFn;
    Globals.lastTry = tryRef;
    Globals.parentFn = null;
    Globals.refStack.add(tryRef);
    this.visit(node.bodyStatements, node);
    Globals.refStack.delete(tryRef);
    Globals.lastTry = lastTry;
    this.visit(node.catchVariable, node);
    // See comment above: catch body is visited with parentFn cleared so
    // generated exception rewrites break out of the catch's wrapping
    // do/while rather than returning from the enclosing function.
    Globals.lastTry = tryRef;
    Globals.refStack.add(tryRef);
    const wasInCatchB = Globals.inCatchBody;
    Globals.inCatchBody = true;
    this.visit(node.catchStatements, node);
    Globals.inCatchBody = wasInCatchB;
    Globals.refStack.delete(tryRef);
    Globals.parentFn = parentFn;
    Globals.lastTry = lastTry;
    this.visit(node.finallyStatements, node);
    if (DEBUG > 0) console.log(indent + "Exited Try");

    Globals.lastTry = lastTry;
  }

  visitNamespaceDeclaration(node: NamespaceDeclaration, isDefault: boolean = false, ref: Node | Node[] | null = null): void {
    if (this.state != "gather") return super.visitNamespaceDeclaration(node, isDefault, ref);
    if (DEBUG > 0) console.log(indent + "Found namespace " + node.name.text);
    indent.add();
    const namespaceRef = new NamespaceRef(node, ref, this.source, this.parentSpace as NamespaceRef | null);
    this.source.local.namespaces.push(namespaceRef);
    // Also nest under the parent namespace so `findLocalNs` can walk a dotted
    // path like `Outer.Inner.boom`: it recurses through each parent's
    // `.namespaces`, and without this a nested namespace only ever lived in the
    // flat source-level list — leaving `Outer.namespaces` empty so the walk
    // dead-ended and the call into it was never redirected (raw abort trapped).
    // NamespaceRef.generate guards against the resulting double-reachability.
    if (this.parentSpace instanceof NamespaceRef) this.parentSpace.namespaces.push(namespaceRef);
    const parentSpace = this.parentSpace;
    this.parentSpace = namespaceRef;
    super.visitNamespaceDeclaration(node, isDefault, ref);
    this.parentSpace = parentSpace;
    indent.rm();
  }
  visitClassDeclaration(node: ClassDeclaration, isDefault: boolean = false, ref: Node | Node[] | null = null): void {
    if (this.state != "gather") return super.visitClassDeclaration(node, isDefault, ref);
    super.visit(node.name, node);
    this.visit(node.decorators, node);
    if (node.isGeneric ? node.typeParameters != null : node.typeParameters == null) {
      if (DEBUG > 0) console.log(indent + "Found class " + node.name.text);
      indent.add();
      const classRef = new ClassRef(node, ref, this.source, this.parentSpace as NamespaceRef | null);
      this.source.local.classes.push(classRef);
      // Record the inheritance edge so MethodRef.generate can keep methods on
      // either side of it (base or derived) at their original name — renaming a
      // virtual method to `__try_<name>` breaks AS's vtable override linkage.
      if (node.extendsType) {
        const base = node.extendsType.name.identifier.text;
        Globals.inheritanceClasses.add(node.name.text);
        Globals.inheritanceClasses.add(base);
      }
      super.visit(node.typeParameters, node);
      super.visit(node.extendsType, node);
      super.visit(node.implementsTypes, node);
      Globals.refStack.add(classRef);
      const parentSpace = this.parentSpace;
      this.parentSpace = classRef;
      super.visit(node.members, node);
      this.parentSpace = parentSpace;
      Globals.refStack.delete(classRef);
      indent.rm();
    } else {
      throw new Error("Expected type parameters to match class declaration, but found type mismatch instead!");
    }
  }

  linkClassRef(classRef: ClassRef): void {
    Globals.refStack.add(classRef);
    const parentSpace = this.parentSpace;
    this.parentSpace = classRef;
    for (const method of classRef.methods) {
      this.linkMethodRef(method);
    }

    if (classRef.hasException) this.source.classes.push(classRef);
    this.parentSpace = parentSpace;
    Globals.refStack.delete(classRef);
    return;
  }

  visitIfStatement(node: IfStatement, ref: Node | Node[] | null = null): void {
    if (this.state != "gather") return super.visitIfStatement(node, ref);
    if (node.ifTrue && node.ifTrue.kind != NodeKind.Block) node.ifTrue = blockify(node.ifTrue);
    if (node.ifFalse && node.ifFalse.kind != NodeKind.Block) node.ifFalse = blockify(node.ifFalse);
    return super.visitIfStatement(node, ref);
  }

  smashStack(): void {
    for (const a of Globals.refStack) {
      a.hasException = true;
    }
    for (const fn of Globals.callStack.values()) {
      if (fn.hasException) continue;
      fn.hasException = true;

      if (fn.path.length) {
        for (const parent of fn.path) {
          if (parent.hasException) continue;
          if (DEBUG > 0) console.log(indent + "Added " + (fn instanceof MethodRef ? "class" : "namespace") + " (parent): " + parent.qualifiedName + " " + fn.source.node.internalPath);
          parent.hasException = true;
          if (parent instanceof NamespaceRef) this.source.namespaces.push(parent);
          else this.source.classes.push(parent);
        }
      } else {
        if (fn instanceof FunctionRef) fn.source.functions.push(fn);
        else if (!fn.parent.hasException) fn.source.classes.push(fn.parent);
      }

      if (fn instanceof FunctionRef) {
        if (DEBUG > 0) console.log(indent + (fn.path.length ? "  " : "") + "Added function: " + fn.qualifiedName + " " + fn.source.node.internalPath);
        else if (DEBUG > 0) console.log(indent + (fn.path.length ? "  " : "") + "Added method: " + fn.qualifiedName + " " + fn.source.node.internalPath);
      }
    }
    Globals.callStack.clear();
    Globals.refStack.clear();
    Globals.foundException = false;
  }

  gather(): void {
    if (this.state != "ready") return;
    Globals.refStack.add(this.source);
    indent.add();
    this.source.state = "linking";
    this.state = "gather";
    if (DEBUG > 0) console.log(indent + "Gathering " + this.node.internalPath);
    super.visit(this.node);
    Globals.refStack.delete(this.source);
    indent.rm();
  }

  link(entry: boolean = false): void {
    if (this.state != "gather") return;
    Globals.refStack.add(this.source);
    indent.add();

    this.state = "link";
    if (DEBUG > 0) console.log(indent + "Linking " + (entry ? "(entry) " : "") + this.node.internalPath);
    if (entry) super.visit(this.node);

    if (DEBUG > 0) console.log(indent + "Done linking " + (entry ? "(entry) " : "") + this.node.internalPath);
    if (DEBUG > 0) console.log(indent + "Postprocessing " + (entry ? "(entry) " : "") + this.node.internalPath);
    this.state = "postprocess";
    for (const classRef of this.source.local.classes) {
      this.linkClassRef(classRef);
    }
    if (DEBUG > 0) console.log(indent + "Done postprocessing " + (entry ? "(entry) " : "") + this.node.internalPath);

    this.state = "done";
    this.source.state = "done";
    Globals.refStack.delete(this.source);
    indent.rm();
    // this.addImports(this.node);
  }

  static addImports(node: Source): void {
    const baseDir = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
    const pkgPath = path.join(Globals.baseCWD, "node_modules");

    // If try-as is reachable as a module from the consumer (npm, yarn,
    // pnpm-hoisted, or symlinked via `npm link` / `file:...`), always emit a
    // bare `try-as/assembly/types/...` specifier. AS's module resolution
    // walks node_modules transparently and follows symlinks, so this works
    // without the user needing `--preserve-symlinks`. Computing a relative
    // path was what made the symlinked-install case explode: `path.relative`
    // from the consumer's cwd to try-as's realpath produces something like
    // `../../../actual/try-as`, and AS resolves that into a SECOND copy of
    // each types file alongside the `~lib/try-as/...` one the user's
    // `import "try-as"` already pulled in — duplicate declarations, then
    // assertion in `program.initialize`.
    const consumerHasTryAs = resolveFromConsumer("try-as/package.json", baseDir) != null;

    let relDir: string;
    if (consumerHasTryAs) {
      relDir = "try-as/assembly/types";
    } else {
      let fromPath = node.range.source.normalizedPath;
      fromPath = fromPath.startsWith("~lib/") ? (fs.existsSync(path.join(pkgPath, fromPath.slice(5, fromPath.indexOf("/", 5)))) ? path.join(pkgPath, fromPath.slice(5)) : fromPath) : path.join(Globals.baseCWD, fromPath);
      relDir = path.posix.join(...path.relative(path.dirname(fromPath), path.join(baseDir, "assembly", "types")).split(path.sep));
      if (relDir.includes("node_modules" + path.sep + "try-as")) {
        relDir = "try-as" + relDir.slice(relDir.indexOf("node_modules" + path.sep + "try-as") + 19);
      } else if (!relDir.startsWith(".") && !relDir.startsWith("/") && !relDir.startsWith("try-as")) {
        relDir = "./" + relDir;
      }
    }

    const addImport = (file: string, names: string[]) => {
      const imps: ImportDeclaration[] = [];

      for (const name of names) {
        const imp = Node.createImportDeclaration(Node.createIdentifierExpression(name, node.range), Node.createIdentifierExpression("__" + name, node.range), node.range);

        imps.push(imp);
      }

      const stmt = Node.createImportStatement(imps, Node.createStringLiteralExpression(relDir + "/" + file, node.range), node.range);
      node.range.source.statements.unshift(stmt);
    };

    addImport("abort", ["AbortState"]);
    addImport("unreachable", ["UnreachableState"]);
    addImport("error", ["ErrorState"]);
    addImport("exception", ["Exception", "ExceptionState"]);
  }

  private static getSourceRefByPath(pathName: string): SourceRef | null {
    return Globals.sources.get(pathName) || Globals.sources.get(pathName + "/index") || null;
  }

  private static sourceExportsSymbol(sourceRef: SourceRef, exportedName: string, visited = new Set<string>()): boolean {
    const sourcePath = sourceRef.node.internalPath;
    const visitKey = sourcePath + "::" + exportedName;
    if (visited.has(visitKey)) return false;
    visited.add(visitKey);

    if (sourceRef.local.functions.some((fn) => fn.exported && fn.node.name.text == exportedName)) {
      return true;
    }

    for (const exp of sourceRef.local.exports) {
      if (!exp.internalPath || !exp.members?.length) continue;
      const target = this.getSourceRefByPath(exp.internalPath);
      if (!target) continue;

      for (const member of exp.members) {
        if (member.exportedName.text != exportedName) continue;
        if (this.sourceExportsSymbol(target, member.localName.text, visited)) {
          return true;
        }
      }
    }

    return false;
  }

  static addTryReexports(source: Source): boolean {
    let changed = false;
    for (const stmt of source.statements) {
      if (stmt.kind != NodeKind.Export) continue;
      const exp = stmt as ExportStatement;
      if (!exp.internalPath || !exp.members?.length) continue;

      const targetSource = this.getSourceRefByPath(exp.internalPath);
      if (!targetSource) continue;

      const existingNames = new Set(exp.members.map((member) => member.exportedName.text));
      const additions: ExportMember[] = [];

      for (const member of exp.members) {
        if (member.exportedName.text.startsWith("__try_")) continue;

        const tryLocal = "__try_" + member.localName.text;
        const tryExported = "__try_" + member.exportedName.text;
        if (existingNames.has(tryExported)) continue;
        if (!this.sourceExportsSymbol(targetSource, tryLocal)) continue;

        const tryMember = Node.createExportMember(Node.createIdentifierExpression(tryLocal, member.localName.range), Node.createIdentifierExpression(tryExported, member.exportedName.range), member.range);

        additions.push(tryMember);
        existingNames.add(tryExported);
      }

      if (additions.length) {
        exp.members.push(...additions);
        changed = true;
      }
    }
    return changed;
  }

  static link(sources: Source[], options: LinkOptions = {}): void {
    const importScope = options.importScope || "all";
    const shouldInjectImports = (source: Source): boolean => {
      if (importScope == "all") return true;
      return source.sourceKind == SourceKind.User || source.sourceKind == SourceKind.UserEntry;
    };

    if (DEBUG > 0) console.log("\n========SOURCES========\n");
    for (const source of sources) {
      Globals.sources.set(source.internalPath, new SourceRef(source));
      if (DEBUG > 0) console.log(source.internalPath);
    }

    const entrySources = sources.filter((v) => v.sourceKind == SourceKind.UserEntry);
    if (!entrySources.length) throw new Error("Could not find main entry point in sources");

    for (const entrySource of entrySources) {
      if (DEBUG > 0) console.log("\n========LINKING========\n");
      if (DEBUG > 0) console.log("Entry: " + entrySource.internalPath);

      const entrySourceRef = Globals.sources.get(entrySource.internalPath)!;
      entrySourceRef.linker.gather();
      entrySourceRef.linker.link(true);
    }

    // -----------------------------------------------------------------------
    // Exception-propagation fixpoint (order-independence).
    //
    // `link()` marks a call site for `__try_` redirection only if the callee
    // was ALREADY known to throw when that call was visited. A callee first
    // resolved via one path leaves call sites in OTHER callers (visited
    // earlier) un-redirected — generate() then leaves them calling the raw
    // throwing original, which traps. This bites dispatcher chains: a `f<T>()`
    // that branches on a compile-time constant and returns one of several
    // throwing helpers (branch visit-order vs. helper first-resolution is not
    // guaranteed). Close the gap structurally: propagate `callee.hasException`
    // to every caller's CallRef until stable, so every call into a throwing
    // function is redirected regardless of visit order. Try-owning parents are
    // left as link decided them (their lowered try/catch governs escape); a
    // try-less parent can only propagate.
    const allRefs: (FunctionRef | MethodRef)[] = [];
    const pushNs = (ns: NamespaceRef): void => {
      for (const fn of ns.functions) allRefs.push(fn);
      for (const cls of ns.classes) for (const m of cls.methods) allRefs.push(m);
      for (const child of ns.namespaces) pushNs(child);
    };
    for (const src of Globals.sources.values()) {
      for (const fn of src.local.functions) allRefs.push(fn);
      for (const cls of src.local.classes) for (const m of cls.methods) allRefs.push(m);
      for (const ns of src.local.namespaces) pushNs(ns);
    }
    for (const m of Globals.methods) allRefs.push(m);

    let propagated = true;
    while (propagated) {
      propagated = false;
      for (const callee of allRefs) {
        if (!callee.hasException) continue;
        for (const callRef of callee.callers) {
          if (callRef.hasException) continue;
          const parent = callRef.parent;
          if (!parent) continue;
          if (parent.tries.length) continue;
          callRef.hasException = true;
          propagated = true;
          if (!parent.exceptions.includes(callRef)) parent.exceptions.push(callRef);
          if (!parent.hasException) parent.hasException = true;
        }
      }
    }

    for (const entrySource of entrySources) {
      if (DEBUG > 0) console.log("\n========GENERATING========\n");
      const entryRef = Globals.sources.get(entrySource.internalPath);
      if (!entryRef) throw new Error("Could not find " + entrySource.internalPath + " in sources!");
      entryRef.generate();
    }

    let changed = true;
    while (changed) {
      changed = false;
      for (const source of sources) {
        if (this.addTryReexports(source)) {
          changed = true;
        }
      }
    }

    for (const source of sources) {
      if (!shouldInjectImports(source)) continue;

      const baseDir = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
      // console.log("Base Dir: " + baseDir);
      const pkgPath = path.join(Globals.baseCWD, "node_modules");
      let fromPath = source.normalizedPath;

      fromPath = fromPath.startsWith("~lib/") ? (fs.existsSync(path.join(pkgPath, fromPath.slice(5, fromPath.indexOf("/", 5)))) ? path.join(pkgPath, fromPath.slice(5)) : fromPath) : path.join(Globals.baseCWD, fromPath);

      let relDir = path.posix.join(...path.relative(path.dirname(fromPath), path.join(baseDir, "assembly", "types")).split(path.sep));

      if (relDir.includes("node_modules" + path.sep + "try-as")) {
        relDir = "try-as" + relDir.slice(relDir.indexOf("node_modules" + path.sep + "try-as") + 19);
      } else if (!relDir.startsWith(".") && !relDir.startsWith("/") && !relDir.startsWith("try-as")) {
        relDir = "./" + relDir;
      }

      this.addImports(source);
    }
  }
}
