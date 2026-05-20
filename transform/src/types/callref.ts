import { CallExpression, Expression, IdentifierExpression, Node, NodeKind, PropertyAccessExpression, Token } from "assemblyscript/dist/assemblyscript.js";
import { FunctionRef } from "./functionref.js";
import { addAfter, blockify, cloneNode, getBreaker, getName, isRefStatement, replaceCallExpression, replaceCallWithIsDefinedIf, replaceRef } from "../utils.js";
import { indent } from "../globals/indent.js";
import { toString } from "../lib/util.js";
import { BaseRef } from "./baseref.js";
import { MethodRef } from "./methodref.js";
import { SourceRef } from "./sourceref.js";

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

  private generated: boolean = false;
  constructor(node: CallExpression, ref: Node | Node[] | null, calling: FunctionRef | MethodRef, source: SourceRef, parent: FunctionRef | MethodRef | null) {
    super();
    this.node = node;
    this.ref = ref;
    this.calling = calling;
    this.source = source;
    this.parent = parent;

    this.name = getName(node.expression);
  }
  generate(): void {
    if (!this.hasException) return;
    if (this.generated) return;
    this.generated = true;

    // Don't rename calls that sit in `inline.always(...)` / `inline.never(...)`
    // / `unchecked(...)` arg slots. AS's builtin handler inlines the callee
    // body directly into the builtin's expression position; the renamed
    // `__try_<name>` version starts with an `if (Failures > 0) return;`
    // unroll-check, and AS's compileExpression / compileCommaExpression
    // assert when statements land in expression position.
    if (this.inInlineBuiltinArg) return;

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

    // @inline callees get their body inlined at the call site by AS, so the
    // ternary wrap (which replaces the call expression itself) ends up inside
    // AS's inliner and trips a compiler assert. Skip them — the inlined body
    // is rewritten in place by the callee's FunctionRef.generate anyway, so
    // exception-state updates still happen even without a renamed call site.
    const decorators = this.calling.node.decorators;
    if (decorators) {
      for (const dec of decorators) {
        if (dec.name.kind == NodeKind.Identifier && (dec.name as IdentifierExpression).text == "inline") return;
      }
    }

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

    // Expression position: we can't inject a trailing isDefined-if statement
    // here, but we leave the renamed `__try_X` call in place. The transformed
    // callee writes __ExceptionState.Failures on failure, so propagation
    // still works — the next statement-level checkpoint (another rewritten
    // call, the surrounding try's do/while break, or the function's exit
    // path) picks up the failure. Reverting to the original (un-transformed)
    // name here would call the raw abort/throw and trap the wasm module.
    // We don't wrap with a ternary because AS builtins like `inline.always`
    // require a plain CallExpression argument.
    if (DEBUG > 0) console.log(indent + "Kept rename (expression position) for " + originalName + " -> " + renamedName);
  }
  update(ref: this): this {
    this.node = ref.node;
    this.ref = ref.ref;
    return this;
  }
}
