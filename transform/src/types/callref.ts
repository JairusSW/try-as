import { CallExpression, Expression, IdentifierExpression, Node, NodeKind, PropertyAccessExpression, Token } from "assemblyscript/dist/assemblyscript.js";
import { FunctionRef } from "./functionref.js";
import { addAfter, addUnrollCheckAfter, blockify, cloneNode, getBreaker, getName, isRefStatement, replaceCallExpression, replaceCallWithIsDefinedIf, replaceRef, stripExpr } from "../utils.js";
import { indent } from "../globals/indent.js";
import { toString } from "../lib/util.js";
import { BaseRef } from "./baseref.js";
import { MethodRef } from "./methodref.js";
import { SourceRef } from "./sourceref.js";
import { Globals } from "../globals/globals.js";

const rawValue = process.env["DEBUG"];
const DEBUG = rawValue == "true" ? 1 : rawValue == "false" || rawValue == "" ? 0 : isNaN(Number(rawValue)) ? 0 : Number(rawValue);

export class CallRef extends BaseRef {
  public node: CallExpression;
  public ref: Node | Node[] | null;
  public source: SourceRef;
  public calling: FunctionRef | MethodRef;
  public name: string;

  public parent: FunctionRef | MethodRef | null;

  // Set at construction by the linker when the call sits inside an
  // AS-builtin arg slot like `inline.always(callExpr)`. CallRef.generate
  // skips the `__try_` rename for these — see Globals.inInlineBuiltinArg.
  public inInlineBuiltinArg: boolean = false;

  // When this call IS the direct argument of an `inline.always(...)` /
  // `unchecked(...)` builtin, the wrapper call (and its container ref) so
  // generate() can drop the wrapper and call the `__try_` shadow normally.
  public inlineWrapper: { node: CallExpression; ref: Node | Node[] | null } | null = null;

  // The statement this call is nested inside, and the array holding it,
  // captured from Globals.stmtStack at construction. Used to anchor an unroll
  // check after the whole statement when the call sits in a non-statement
  // expression slot (a variable initializer, method-chain receiver, or
  // argument) that has no statement `ref` of its own.
  public enclosingStmt: Node | null;
  public enclosingStmtContainer: Node[] | null;

  private generated: boolean = false;
  constructor(node: CallExpression, ref: Node | Node[] | null, calling: FunctionRef | MethodRef, source: SourceRef, parent: FunctionRef | MethodRef | null) {
    super();
    this.node = node;
    this.ref = ref;
    this.calling = calling;
    this.source = source;
    this.parent = parent;

    this.name = getName(node.expression);

    const top = Globals.stmtStack[Globals.stmtStack.length - 1];
    this.enclosingStmt = top ? top.node : null;
    this.enclosingStmtContainer = top ? top.container : null;
  }
  generate(): void {
    if (!this.hasException) return;
    if (this.generated) return;
    this.generated = true;

    // Calls in `inline.always(...)` / `inline.never(...)` / `unchecked(...)`
    // arg slots can't simply be renamed to `__try_<name>`: AS inlines the
    // callee body into the builtin's expression position, and the shadow's
    // leading `if (Failures > 0) return;` unroll-check is a statement that
    // `compileExpression` / `compileCommaExpression` assert on.
    //
    // But if the callee THROWS, inlining its raw original means a deep throw
    // stays a raw abort (uncatchable) — the whole point of try-as is lost for
    // that path. So when this call is the builtin's DIRECT throwing argument,
    // drop the builtin wrapper and call the `__try_` shadow normally below
    // (trading the forced inline for catchability). Otherwise keep the old
    // behavior and leave the call alone.
    const isInlineUnwrap = this.inInlineBuiltinArg && this.calling.hasException && this.inlineWrapper != null && this.inlineWrapper.node.args.length == 1 && this.inlineWrapper.node.args[0] == this.node;
    if (this.inInlineBuiltinArg && !isInlineUnwrap) return;

    const breaker = getBreaker(this.node, this.parent?.node);
    const range = this.node.range;

    // Identify the callee name. Bail out if the call expression is neither
    // an identifier nor a property access, or if it's already been renamed
    // (a previous pass already handled this call).
    const expr = this.node.expression;
    let originalName = "";
    let isPropertyAccess = false;
    if (expr.kind == NodeKind.PropertyAccess) {
      const propAccess = expr as PropertyAccessExpression;
      if (propAccess.property.text.startsWith("__try_")) return;
      originalName = propAccess.property.text;
      isPropertyAccess = true;
    } else if (expr.kind == NodeKind.Identifier) {
      const ident = expr as IdentifierExpression;
      if (ident.text.startsWith("__try_")) return;
      originalName = ident.text;
    } else {
      return;
    }

    // If the calling function has its own try blocks, leave the original
    // call alone — exceptions are caught inside the callee, no propagation
    // needed at this site.
    if (this.calling.tries.length) return;

    // A throwing @inline callee now gets a NON-inline `__try_<name>` shadow
    // (see FunctionRef.generate). Redirect this call to it via the usual
    // isDefined-guarded rename: the shadow is a real function, so the call is a
    // plain call (no inlining into expression position), and the original
    // `@inline` still serves non-exception callers. The `isDefined(__try_X)`
    // guard keeps this safe even if no shadow was emitted for a given callee.

    const renamedName = "__try_" + originalName;

    // The declaration may or may not have actually been renamed to
    // `__try_<name>` by its ref.generate(): the linker can mark functions
    // exception-aware via smashStack while the rename branch never runs
    // (generic / static-factory methods are the typical offenders). Rather
    // than gambling on the rename's reachability, wrap the call as
    //   isDefined(__try_X) ? __try_X(args) : X(args)
    // and let AS pick the branch at compile time.
    const originalCallClone = cloneNode(this.node) as CallExpression;

    // Mutate `this.node` so it becomes the renamed (then-branch) call.
    if (isPropertyAccess) {
      (this.node.expression as PropertyAccessExpression).property.text = renamedName;
    } else {
      (this.node.expression as IdentifierExpression).text = renamedName;
    }

    // The isDefined() guard wants a *reference* to the renamed callee —
    // re-build the expression rather than sharing nodes with the call.
    let isDefinedArg: Expression;
    if (isPropertyAccess) {
      const propAccess = this.node.expression as PropertyAccessExpression;
      isDefinedArg = Node.createPropertyAccessExpression(cloneNode(propAccess.expression) as Expression, Node.createIdentifierExpression(renamedName, range), range);
    } else {
      isDefinedArg = Node.createIdentifierExpression(renamedName, range);
    }
    const unrollCheck = Node.createIfStatement(Node.createBinaryExpression(Token.GreaterThan, Node.createPropertyAccessExpression(Node.createIdentifierExpression("__ExceptionState", range), Node.createIdentifierExpression("Failures", range), range), Node.createIntegerLiteralExpression(i64_zero, range), range), blockify(breaker), null, range);

    // inline.always(...) direct-arg unwrap: replace the whole builtin call with
    // the now-renamed `__try_<name>(...)` call, and anchor an unroll-check after
    // the enclosing statement so a failure short-circuits the rest of the block.
    if (isInlineUnwrap) {
      replaceCallExpression(this.inlineWrapper!.node, this.node, this.inlineWrapper!.ref);
      // Anchor an unroll-check after the enclosing statement ONLY when control
      // can fall through to the next statement. After a `return`, control
      // already leaves — an extra trailing statement is dead AND breaks AS when
      // the enclosing function is itself inline-compiled (a statement can't sit
      // in the resulting comma/expression position).
      if (this.enclosingStmt && this.enclosingStmtContainer && this.enclosingStmt.kind != NodeKind.Return) {
        addAfter(this.enclosingStmt, unrollCheck, this.enclosingStmtContainer);
      }
      if (DEBUG > 0) console.log(indent + "Unwrapped inline builtin for " + originalName + " -> " + renamedName);
      return;
    }

    // Add the unroll-check anchored to `this.node` BEFORE we swap — addAfter
    // looks the call up by stripExpr and would miss it after replacement.
    const wasStatement = isRefStatement(this.node, this.ref);
    if (wasStatement) addAfter(this.node, unrollCheck, this.ref);

    // Statement position: emit `if (isDefined(__try_X)) __try_X(...) else X(...)`.
    // AS folds isDefined() reliably at the IfStatement boundary and emits
    // only the chosen branch, so the un-taken side never reaches the
    // compiler's builtin-call assertion.
    const placedAsIf = replaceCallWithIsDefinedIf(this.node, isDefinedArg, this.node, originalCallClone, this.ref);
    if (placedAsIf) {
      if (DEBUG > 0) console.log(indent + "Replaced call with isDefined-if for " + originalName);
      return;
    }

    // Expression position — no statement slot for an isDefined-if guard.
    //
    // Two sub-cases, distinguished by whether the CALLEE itself throws:
    //
    //  • Callee throws (`this.calling.hasException`) — a `__try_<name>` shadow
    //    IS generated, so leave the bare renamed `__try_X` call in place. The
    //    transformed callee writes `__ExceptionState.Failures` on failure and
    //    the next statement-level checkpoint picks it up. Reverting to the
    //    original name here would call the raw abort/throw and trap.
    //
    //  • Callee is clean and was only flagged because an ARGUMENT throws
    //    (`expect(JSON.parse(bad))`, `wrap(a, thisThrows())` used as a
    //    sub-expression) — there is NO `__try_<name>` shadow to call (a shadow
    //    is only emitted when the callee itself throws), and with no isDefined
    //    guard here the bare rename dangles (`Cannot find name '__try_expect'`).
    //    Revert this site to the original call; the throwing ARGUMENT has its
    //    own CallRef that is rewritten independently, and the enclosing
    //    checkpoint catches the failure. (At STATEMENT position this branch
    //    isn't reached — `replaceCallWithIsDefinedIf` above handles it, folding
    //    `isDefined(__try_X)` to the original AND adding the trailing unroll
    //    check that short-circuits the rest of the block.)
    if (!this.calling.hasException) {
      if (isPropertyAccess) {
        (this.node.expression as PropertyAccessExpression).property.text = originalName;
      } else {
        (this.node.expression as IdentifierExpression).text = originalName;
      }
      if (DEBUG > 0) console.log(indent + "Reverted rename (clean callee, expression position) for " + originalName);
      return;
    }

    // The throwing callee stays renamed to `__try_X` and writes
    // `__ExceptionState.Failures` on failure. But because it sits in an
    // expression slot (a variable initializer, a method-chain receiver, an
    // argument), there's no statement `ref` of its own to anchor a trailing
    // unroll check — so without help the statements AFTER this one would run
    // with Failures already set (`const r = f(a, throws()); next();` ran
    // `next()`). Anchor the unroll check after the whole ENCLOSING statement
    // instead, so a throw mid-expression short-circuits the rest of the block.
    // Reaching here means `replaceCallWithIsDefinedIf` already declined (the
    // call is NOT at statement position — it's a variable initializer,
    // method-chain receiver, or argument). Anchor the trailing unroll-check
    // after the whole enclosing statement so the rest of the block is
    // short-circuited. Skip only when the call IS that statement (nothing to
    // anchor around) or control already leaves via `return` (the check would
    // be dead and breaks AS if the enclosing fn is inline-compiled).
    // `addUnrollCheckAfter` dedupes, so an enclosing call that also anchored a
    // check here doesn't produce a doubled guard.
    const callIsWholeStmt = this.enclosingStmt != null && stripExpr(this.enclosingStmt) == this.node;
    if (this.enclosingStmt && this.enclosingStmtContainer && !callIsWholeStmt && this.enclosingStmt.kind != NodeKind.Return) {
      addUnrollCheckAfter(this.enclosingStmt, unrollCheck, this.enclosingStmtContainer);
    }
    if (DEBUG > 0) console.log(indent + "Kept rename (expression position) for " + originalName + " -> " + renamedName);
  }
  update(ref: this): this {
    this.node = ref.node;
    this.ref = ref.ref;
    return this;
  }
}
