import { BlockStatement, BreakStatement, CallExpression, ExpressionStatement, FunctionDeclaration, IdentifierExpression, IfStatement, Node, NodeKind, PropertyAccessExpression, ReturnStatement, Statement, Token } from "assemblyscript/dist/assemblyscript.js";
import path from "path";
import { toString } from "./lib/util.js";
import { Try } from "./transform.js";

export function replaceRef(node: Node, replacement: Node | Node[], ref: Node | Node[] | null): void {
  if (!node || !ref) return;
  const nodeExpr = stripExpr(node);

  if (Array.isArray(ref)) {
    for (let i = 0; i < ref.length; i++) {
      if (stripExpr(ref[i]) === nodeExpr) {
        if (Array.isArray(replacement)) ref.splice(i, 1, ...replacement);
        else ref.splice(i, 1, replacement);
        return; // Exit early after replacement
      }
    }
  } else if (typeof ref === "object") {
    for (const key of Object.keys(ref)) {
      const current = ref[key] as Node | Node[];
      if (Array.isArray(current)) {
        for (let i = 0; i < current.length; i++) {
          if (stripExpr(current[i]) === nodeExpr) {
            if (Array.isArray(replacement)) current.splice(i, 1, ...replacement);
            else current.splice(i, 1, replacement);
            return;
          }
        }
      } else if (stripExpr(current) === nodeExpr) {
        ref[key] = replacement;
        return;
      }
    }
  }
}

export function replaceAfter(node: Node, replacement: Node | Node[], ref: Node | Node[] | null, Reference): void {
  if (!node || !ref) return;
  const nodeExpr = stripExpr(node);

  if (Array.isArray(ref)) {
    let found = false;
    for (let i = 0; i < ref.length; i++) {
      if (found || stripExpr(ref[i]) === nodeExpr) {
        ref.splice(i, ref.length - i, ...(Array.isArray(replacement) ? replacement : [replacement]));
        return;
      }
    }
  } else if (typeof ref === "object") {
    for (const key of Object.keys(ref)) {
      const current = ref[key] as Node | Node[];
      if (Array.isArray(current)) {
        let found = false;
        for (let i = 0; i < current.length; i++) {
          if (found || stripExpr(current[i]) === nodeExpr) {
            current.splice(i, current.length - i, ...(Array.isArray(replacement) ? replacement : [replacement]));
            return;
          }
        }
      } else if (stripExpr(current) === nodeExpr) {
        ref[key] = replacement;
        return;
      }
    }
  }
}

export function stripExpr(node: Node): Node {
  if (!node) return node;
  if (node.kind == NodeKind.Expression) return node["expression"];
  return node;
}

export function nodeEq(a: Node, b: Node): boolean {
  if (!a || !b) return false;
  if (!a["kind"] || !b["kind"]) return false;
  if (a === b) return true;
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) return false;

  const keys1 = Object.keys(a);
  const keys2 = Object.keys(b);

  if (keys1 !== keys2) return false;

  for (let key of keys1) {
    if (!keys2.includes(key)) return false;
    if (!nodeEq(a[key], b[key])) return false;
  }

  return true;
}

export function isPrimitive(type: string): boolean {
  const primitiveTypes = ["u8", "u16", "u32", "u64", "i8", "i16", "i32", "i64", "f32", "f64", "bool", "boolean"];
  return primitiveTypes.some((v) => type.startsWith(v));
}

export function blockify(node: Node): BlockStatement {
  if (!node) return null;
  let block = node.kind == NodeKind.Block ? node : Node.createBlockStatement([node], node.range);

  return block as BlockStatement;
}

export function getFnName(expr: Node | string, path: string[] | null = null): string | null {
  const _path = path && path.length ? path.join(".") + "." : "";
  if (typeof expr == "string") {
    return _path + expr;
  } else if (expr.kind === NodeKind.Identifier) {
    return _path + (expr as IdentifierExpression).text;
  } else if (expr.kind === NodeKind.PropertyAccess) {
    const prop = expr as PropertyAccessExpression;
    const left = getFnName(prop.expression, path);
    const right = prop.property.text;
    return left ? left + "." + right : right;
  }
  return null;
}

export function cloneNode<T = Node | Node[] | null>(input: T, seen = new WeakMap(), path = ""): T {
  if (input === null || typeof input !== "object") return input;

  if (Array.isArray(input)) {
    return input.map((item, index) => cloneNode(item, seen, `${path}[${index}]`)) as T;
  }

  if (seen.has(input)) return seen.get(input);

  const prototype = Object.getPrototypeOf(input);
  const clone = Array.isArray(input) ? [] : Object.create(prototype);
  seen.set(input, clone);

  for (const key of Reflect.ownKeys(input)) {
    const value = input[key];
    const newPath = path ? `${path}.${String(key)}` : String(key);

    if (newPath.endsWith(".source")) {
      clone[key] = value;
    } else if (value && typeof value === "object") {
      clone[key] = cloneNode(value, seen, newPath);
    } else {
      clone[key] = value;
    }
  }

  return clone;
}

export function hasBaseException(statements: Statement[]): boolean {
  return statements.some((v) => {
    if (!v) return false;
    if (v.kind == NodeKind.Expression) v = (v as ExpressionStatement).expression;
    if (v.kind == NodeKind.Call && (v as CallExpression).expression.kind == NodeKind.Identifier && (((v as CallExpression).expression as IdentifierExpression).text == "abort" || ((v as CallExpression).expression as IdentifierExpression).text == "unreachable")) return true;
    if (v.kind == NodeKind.Throw) return true;
    return false;
  });
}

export function hasException(statements: Statement[]): boolean {
  return statements.some((v) => {
    if (!v) return false;
    if (v.kind == NodeKind.Expression) v = (v as ExpressionStatement).expression;
    if (v.kind == NodeKind.Call) {
      if ((v as CallExpression).expression.kind == NodeKind.Identifier && (((v as CallExpression).expression as IdentifierExpression).text == "abort" || ((v as CallExpression).expression as IdentifierExpression).text == "unreachable")) return true;
      if (Try.SN.getFnByName(v.range.source, getFnName((v as CallExpression).expression))) return true;
    }
    if (v.kind == NodeKind.Throw) return true;
    return false;
  });
}

export function hasOnlyExceptions(statements: Statement[]): boolean {
  return statements.every((v) => {
    if (!v) return false;
    v = stripExpr(v);
    if (v.kind !== NodeKind.Call) return false;

    const callExpr = v as CallExpression;

    if (callExpr.expression.kind === NodeKind.Identifier && ((callExpr.expression as IdentifierExpression).text === "abort" || (callExpr.expression as IdentifierExpression).text === "unreachable")) {
      return true;
    }

    return false;
  });
}

export function removeExtension(filePath: string): string {
  const parsed = path.parse(filePath);
  return path.join(parsed.dir, parsed.name);
}

export function getBreaker(node: Node, parent: FunctionDeclaration | null = null): ReturnStatement | BreakStatement | IfStatement {
  let breakStmt: ReturnStatement | BreakStatement | IfStatement = Node.createBreakStatement(null, node.range);

  if (parent) {
    const returnType = toString(parent.signature.returnType);
    if (returnType != "void" && returnType != "never") {
      breakStmt = Node.createIfStatement(Node.createCallExpression(Node.createIdentifierExpression("isBoolean", node.range), [parent.signature.returnType], [], node.range), Node.createReturnStatement(Node.createFalseExpression(node.range), node.range), Node.createIfStatement(Node.createBinaryExpression(Token.Bar_Bar, Node.createCallExpression(Node.createIdentifierExpression("isInteger", node.range), [parent.signature.returnType], [], node.range), Node.createCallExpression(Node.createIdentifierExpression("isFloat", node.range), [parent.signature.returnType], [], node.range), node.range), Node.createReturnStatement(Node.createIntegerLiteralExpression(i64_zero, node.range), node.range), Node.createIfStatement(Node.createBinaryExpression(Token.Bar_Bar, Node.createCallExpression(Node.createIdentifierExpression("isManaged", node.range), [parent.signature.returnType], [], node.range), Node.createCallExpression(Node.createIdentifierExpression("isReference", node.range), [parent.signature.returnType], [], node.range), node.range), Node.createReturnStatement(Node.createCallExpression(Node.createIdentifierExpression("changetype", node.range), [parent.signature.returnType], [Node.createIntegerLiteralExpression(i64_zero, node.range)], node.range), node.range), Node.createReturnStatement(null, node.range), node.range), node.range), node.range);
    } else {
      breakStmt = Node.createReturnStatement(null, node.range);
    }
  }

  return breakStmt;
}
