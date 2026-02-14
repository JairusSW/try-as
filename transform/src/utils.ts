import { BlockStatement, BreakStatement, ExpressionStatement, FunctionDeclaration, IdentifierExpression, IfStatement, MethodDeclaration, Node, NodeKind, PropertyAccessExpression, ReturnStatement, Statement, Token } from "assemblyscript/dist/assemblyscript.js";
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
    if (!parentFn.signature.returnType) {
      return Node.createReturnStatement(null, node.range);
    }
    const returnType = toString(parentFn.signature.returnType);
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
