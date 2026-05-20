import { BlockStatement, BreakStatement, CommonFlags, Expression, ExpressionStatement, FunctionDeclaration, IdentifierExpression, IfStatement, MethodDeclaration, Node, PropertyAccessExpression, ReturnStatement, Statement, Token } from "assemblyscript/dist/assemblyscript.js";
import { NodeKind } from "./types.js";
import { toString } from "./lib/util.js";
import path from "path";
import { NamespaceRef } from "./types/namespaceref.js";
import { ClassRef } from "./types/classref.js";

export function replaceRef(node: Node, replacement: Node | Node[], ref: Node | Node[] | null): void {
  if (!node || !ref) return;
  const nodeExpr = stripExpr(node);

  if (Array.isArray(ref)) {
    for (let i = 0; i < ref.length; i++) {
      if (stripExpr(ref[i]) == nodeExpr) {
        if (Array.isArray(replacement)) ref.splice(i, 1, ...replacement);
        else ref.splice(i, 1, replacement);
        return;
      }
    }
  } else if (typeof ref == "object") {
    for (const key of Object.keys(ref)) {
      // @ts-ignore
      const current = ref[key] as Node | Node[];
      if (Array.isArray(current)) {
        for (let i = 0; i < current.length; i++) {
          if (stripExpr(current[i]) == nodeExpr) {
            if (Array.isArray(replacement)) current.splice(i, 1, ...replacement);
            else current.splice(i, 1, replacement);
            return;
          }
        }
      } else if (stripExpr(current) == nodeExpr) {
        // @ts-ignore
        ref[key] = replacement;
        return;
      }
    }
  }
}

export function addAfter(node: Node, additions: Node | Node[], ref: Node | Node[] | null): void {
  if (!node || !ref) return;
  const targetExpr = stripExpr(node);

  if (Array.isArray(ref)) {
    for (let i = 0; i < ref.length; i++) {
      if (stripExpr(ref[i]) == targetExpr) {
        if (Array.isArray(additions)) ref.splice(i + 1, 0, ...additions);
        else ref.splice(i + 1, 0, additions);
        return;
      }
    }
  } else if (typeof ref == "object") {
    for (const key of Object.keys(ref)) {
      // @ts-ignore
      const current = ref[key] as Node | Node[];
      if (Array.isArray(current)) {
        for (let i = 0; i < current.length; i++) {
          if (stripExpr(current[i]) == targetExpr) {
            if (Array.isArray(additions)) current.splice(i + 1, 0, ...additions);
            else current.splice(i + 1, 0, additions);
            return;
          }
        }
      }
    }
  }
}

export function replaceAfter(node: Node, replacement: Node | Node[], ref: Node | Node[] | null): void {
  if (!node || !ref) return;
  const nodeExpr = stripExpr(node);

  if (Array.isArray(ref)) {
    let found = false;
    for (let i = 0; i < ref.length; i++) {
      if (found || stripExpr(ref[i]) == nodeExpr) {
        ref.splice(i, ref.length - i, ...(Array.isArray(replacement) ? replacement : [replacement]));
        return;
      }
    }
  } else if (typeof ref == "object") {
    for (const key of Object.keys(ref)) {
      // @ts-ignore
      const current = ref[key] as Node | Node[];
      if (Array.isArray(current)) {
        let found = false;
        for (let i = 0; i < current.length; i++) {
          if (found || stripExpr(current[i]) == nodeExpr) {
            current.splice(i, current.length - i, ...(Array.isArray(replacement) ? replacement : [replacement]));
            return;
          }
        }
      } else if (stripExpr(current) == nodeExpr) {
        // @ts-ignore
        ref[key] = replacement;
        return;
      }
    }
  }
}

export function stripExpr(node: Node): Node {
  if (!node) return node;
  // @ts-ignore
  if (node.kind == NodeKind.Expression) return node["expression"];
  return node;
}

// Locate `callNode` in `ref`. Returns whether the position is a statement
// slot (array element wrapping the call in an ExpressionStatement) or an
// expression slot (anywhere else).
export type CallPosition = { kind: "statementArray"; container: Node[]; index: number } | { kind: "objectArray"; container: Node[]; index: number } | { kind: "expressionSlot"; container: Record<string, unknown>; key: string } | { kind: "notFound" };

export function locateCall(callNode: Node, ref: Node | Node[] | null): CallPosition {
  if (!callNode || !ref) return { kind: "notFound" };
  const callExpr = stripExpr(callNode);

  if (Array.isArray(ref)) {
    for (let i = 0; i < ref.length; i++) {
      // Only a true statement position has the call wrapped in an
      // ExpressionStatement (so stripExpr unwraps to our call). If
      // `ref[i] === callExpr` the call is sitting directly in the array
      // (e.g. a CallExpression's `args` list) — that's an expression slot
      // dressed up as an array, not a statement slot.
      if (ref[i] !== callExpr && stripExpr(ref[i]) == callExpr) return { kind: "statementArray", container: ref, index: i };
      if (ref[i] === callExpr) return { kind: "objectArray", container: ref, index: i };
    }
    return { kind: "notFound" };
  }

  if (typeof ref != "object") return { kind: "notFound" };

  for (const key of Object.keys(ref)) {
    // @ts-ignore
    const current = ref[key] as Node | Node[];
    if (Array.isArray(current)) {
      for (let i = 0; i < current.length; i++) {
        if (current[i] !== callExpr && stripExpr(current[i]) == callExpr) return { kind: "statementArray", container: current, index: i };
        if (current[i] === callExpr) return { kind: "objectArray", container: current, index: i };
      }
    } else if (current && stripExpr(current) == callExpr) {
      return { kind: "expressionSlot", container: ref as unknown as Record<string, unknown>, key };
    }
  }
  return { kind: "notFound" };
}

// Replace a CallExpression with a new Expression, preserving correct AST
// shape based on context. When the call lives at statement position (inside
// an ExpressionStatement that's a member of a Block / Source / etc.), the
// replacement must itself be wrapped in an ExpressionStatement — bare
// expressions in statement arrays trip AS's compileStatement assertion.
// When the call lives at expression position (return value, initializer,
// argument, …), the replacement slots in directly.
export function replaceCallExpression(callNode: Node, replacement: Expression, ref: Node | Node[] | null): void {
  const pos = locateCall(callNode, ref);
  if (pos.kind == "notFound") return;
  if (pos.kind == "statementArray") {
    pos.container.splice(pos.index, 1, Node.createExpressionStatement(replacement));
  } else if (pos.kind == "objectArray") {
    // Expression slot inside an array (e.g. CallExpression.args) — splice in
    // the bare expression, not an ExpressionStatement wrapper.
    pos.container.splice(pos.index, 1, replacement as unknown as Node);
  } else {
    pos.container[pos.key] = replacement;
  }
}

// Replace a CallExpression with an if/else statement that picks between
// renamed and original calls based on `isDefined`. Only safe when the call
// is at statement position — AS folds `isDefined` constant inside an
// IfStatement and emits only the chosen branch, where TernaryExpression in
// builtin-call context has been observed to trip the compiler in some
// generic / namespace-method shapes.
export function replaceCallWithIsDefinedIf(callNode: Node, isDefinedArg: Expression, renamedCall: Expression, originalCall: Expression, ref: Node | Node[] | null): boolean {
  const pos = locateCall(callNode, ref);
  if (pos.kind == "notFound") return false;
  // Only the top-level "statementArray" case is a true statement position.
  // The "objectArray" case includes things like a CallExpression's args list
  // — placing an IfStatement there is invalid (if is a Statement, not an
  // Expression). For those we must use the ternary expression form.
  if (pos.kind != "statementArray") return false;
  const range = callNode.range;
  const isDefinedCheck = Node.createCallExpression(Node.createIdentifierExpression("isDefined", range), null, [isDefinedArg], range);
  const ifStmt = Node.createIfStatement(isDefinedCheck, Node.createBlockStatement([Node.createExpressionStatement(renamedCall)], range), Node.createBlockStatement([Node.createExpressionStatement(originalCall)], range), range);
  pos.container.splice(pos.index, 1, ifStmt);
  return true;
}

export function blockify(node: Node): BlockStatement {
  let block = node.kind == NodeKind.Block ? node : Node.createBlockStatement([node], node.range);

  return block as BlockStatement;
}

export function cloneNode<T = Node | Node[] | null>(input: T, seen = new WeakMap(), path = ""): T {
  if (input == null || typeof input != "object") return input;

  if (Array.isArray(input)) {
    return input.map((item, index) => cloneNode(item, seen, `${path}[${index}]`)) as T;
  }

  if (seen.has(input)) return seen.get(input);

  const prototype = Object.getPrototypeOf(input);
  const clone = Array.isArray(input) ? [] : Object.create(prototype);
  seen.set(input, clone);

  for (const key of Reflect.ownKeys(input)) {
    // @ts-ignore
    const value = input[key];
    const newPath = path ? `${path}.${String(key)}` : String(key);

    if (newPath.endsWith(".source")) {
      clone[key] = value;
    } else if (value && typeof value == "object") {
      clone[key] = cloneNode(value, seen, newPath);
    } else {
      clone[key] = value;
    }
  }

  return clone;
}

export function removeExtension(filePath: string): string {
  const parsed = path.parse(filePath);
  return path.join(parsed.dir, parsed.name);
}

export function getBreaker(node: Node, parentFn: FunctionDeclaration | MethodDeclaration | null = null): ReturnStatement | BreakStatement | IfStatement {
  let breakStmt: ReturnStatement | BreakStatement | IfStatement = Node.createBreakStatement(null, node.range);

  if (parentFn) {
    // Constructors don't have a usable signature.returnType (it's a synthetic
    // class-instance node that toString() can't render), and AS rejects a
    // bare `return;` in a constructor body — the synthetic instance type
    // doesn't accept void.  Emit `return this;` so the partially-constructed
    // instance flows back to the `new` site; the caller's next checkpoint
    // sees `__ExceptionState.Failures > 0` and unwinds.
    if (parentFn.flags & CommonFlags.Constructor) {
      return Node.createReturnStatement(Node.createThisExpression(node.range), node.range);
    }
    if (!parentFn.signature.returnType) {
      return Node.createReturnStatement(null, node.range);
    }
    const returnType = toString(parentFn.signature.returnType);
    // Empty toString result means the signature node carries a synthetic
    // type with no printable name; emitting it would produce `isBoolean<>()`.
    if (returnType == "") {
      return Node.createReturnStatement(null, node.range);
    }
    if (returnType != "void" && returnType != "never") {
      breakStmt = Node.createIfStatement(Node.createCallExpression(Node.createIdentifierExpression("isBoolean", node.range), [parentFn.signature.returnType], [], node.range), Node.createReturnStatement(Node.createFalseExpression(node.range), node.range), Node.createIfStatement(Node.createBinaryExpression(Token.Bar_Bar, Node.createCallExpression(Node.createIdentifierExpression("isInteger", node.range), [parentFn.signature.returnType], [], node.range), Node.createCallExpression(Node.createIdentifierExpression("isFloat", node.range), [parentFn.signature.returnType], [], node.range), node.range), Node.createReturnStatement(Node.createIntegerLiteralExpression(i64_zero, node.range), node.range), Node.createIfStatement(Node.createBinaryExpression(Token.Bar_Bar, Node.createCallExpression(Node.createIdentifierExpression("isManaged", node.range), [parentFn.signature.returnType], [], node.range), Node.createCallExpression(Node.createIdentifierExpression("isReference", node.range), [parentFn.signature.returnType], [], node.range), node.range), Node.createReturnStatement(Node.createCallExpression(Node.createIdentifierExpression("changetype", node.range), [parentFn.signature.returnType], [Node.createIntegerLiteralExpression(i64_zero, node.range)], node.range), node.range), Node.createReturnStatement(null, node.range), node.range), node.range), node.range);
    } else {
      breakStmt = Node.createReturnStatement(null, node.range);
    }
  }

  return breakStmt;
}

export function isRefStatement(node: Node | null, ref: Node | Node[] | null): boolean {
  if (node) return isRefStatement(null, node) || isRefStatement(null, ref);
  if (!ref) return false;
  if (Array.isArray(ref)) {
    if (ref.some((r) => !isRefStatement(null, r))) return false;
    return true;
  }
  if (ref.kind == NodeKind.Source) return true;
  if (ref.kind == NodeKind.Class) return true;
  if (ref.kind == NodeKind.Block) return true;
  if (ref.kind == NodeKind.Break) return true;
  if (ref.kind == NodeKind.Continue) return true;
  if (ref.kind == NodeKind.Do) return true;
  if (ref.kind == NodeKind.Empty) return true;
  if (ref.kind == NodeKind.Export) return true;
  if (ref.kind == NodeKind.ExportDefault) return true;
  if (ref.kind == NodeKind.ExportImport) return true;
  if (ref.kind == NodeKind.Expression) return true;
  if (ref.kind == NodeKind.For) return true;
  if (ref.kind == NodeKind.ForOf) return true;
  if (ref.kind == NodeKind.If) return true;
  if (ref.kind == NodeKind.Import) return true;
  if (ref.kind == NodeKind.Return) return true;
  if (ref.kind == NodeKind.Switch) return true;
  if (ref.kind == NodeKind.Throw) return true;
  if (ref.kind == NodeKind.Try) return true;
  if (ref.kind == NodeKind.Variable) return true;
  if (ref.kind == NodeKind.While) return true;
  if (ref.kind == NodeKind.Module) return true;
  if (ref.kind == NodeKind.ClassDeclaration) return true;
  if (ref.kind == NodeKind.EnumDeclaration) return true;
  if (ref.kind == NodeKind.FieldDeclaration) return true;
  if (ref.kind == NodeKind.FunctionDeclaration) return true;
  if (ref.kind == NodeKind.ImportDeclaration) return true;
  if (ref.kind == NodeKind.InterfaceDeclaration) return true;
  if (ref.kind == NodeKind.MethodDeclaration) return true;
  if (ref.kind == NodeKind.NamespaceDeclaration) return true;
  if (ref.kind == NodeKind.TypeDeclaration) return true;
  if (ref.kind == NodeKind.VariableDeclaration) return true;
  return false;
}

export function getName(name: Node | string, path: (NamespaceRef | ClassRef)[] | null = null): string {
  if (!name) return "";

  if (typeof name != "string") {
    if (name.kind == NodeKind.Identifier) {
      name = (name as IdentifierExpression).text;
    } else if (name.kind == NodeKind.PropertyAccess) {
      const expr = name as PropertyAccessExpression;
      name = getName(expr.expression) + "." + expr.property.text;
    } else {
      return "";
    }
  }

  return path?.length ? path.map((v) => v?.name).join(".") + (name ? "." + name : "") : name;
}
