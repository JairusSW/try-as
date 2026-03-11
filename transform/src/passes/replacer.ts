import { AssertionExpression, AssertionKind, ClassDeclaration, CommonFlags, FunctionDeclaration, IdentifierExpression, MethodDeclaration, NewExpression, Node, NodeKind, ParameterNode, ParenthesizedExpression, PropertyAccessExpression, Source, ThrowStatement, VariableDeclaration } from "assemblyscript/dist/assemblyscript.js";

import { Visitor } from "../lib/visitor.js";
import { replaceRef } from "../utils.js";
import { toString } from "../lib/util.js";
import { CallExpression } from "types:assemblyscript/src/ast";
import { Globals } from "../globals/globals.js";
import { MethodRef } from "../types/methodref.js";

const rawValue = process.env["DEBUG"];
const DEBUG = rawValue == "true" ? 1 : rawValue == "false" || rawValue == "" ? 0 : isNaN(Number(rawValue)) ? 0 : Number(rawValue);

export class ThrowReplacer extends Visitor {
  public source!: Source;

  private methodIndex: Map<string, MethodRef[]> = new Map();
  private classExtends: Map<string, string | null> = new Map();
  private scopeStack: Map<string, string>[] = [];
  private currentClass: string | null = null;

  private indexMethodRefs(): void {
    this.methodIndex.clear();
    for (const method of Globals.methods) {
      if (!method.hasException) continue;
      const key = this.methodKey(method.name, method.node.signature.parameters.length);
      const indexed = this.methodIndex.get(key);
      if (indexed) indexed.push(method);
      else this.methodIndex.set(key, [method]);
    }
  }

  private methodKey(name: string, arity: number): string {
    return name + "/" + arity.toString();
  }

  private isExceptionType(typeName: string | null): boolean {
    if (!typeName) return false;
    let normalized = this.normalizeTypeName(typeName);
    const seen = new Set<string>();

    while (normalized.length && !seen.has(normalized)) {
      if (normalized == "Exception" || normalized.endsWith(".Exception")) return true;
      seen.add(normalized);
      const fallback = normalized.split(".").pop() || "";
      const parent = this.classExtends.get(normalized) || this.classExtends.get(fallback) || null;
      if (!parent) return false;
      normalized = parent;
    }

    return false;
  }

  private normalizeTypeName(name: string): string {
    let out = name.trim();
    const nonnullPrefix = "nonnull<";
    if (out.startsWith(nonnullPrefix) && out.endsWith(">")) {
      out = out.slice(nonnullPrefix.length, -1);
    }
    const nullableIndex = out.indexOf("|");
    if (nullableIndex >= 0) {
      out = out.slice(0, nullableIndex).trim();
    }
    const genericIndex = out.indexOf("<");
    if (genericIndex >= 0) {
      out = out.slice(0, genericIndex);
    }
    return out;
  }

  private pushScope(): void {
    this.scopeStack.push(new Map());
  }

  private popScope(): void {
    this.scopeStack.pop();
  }

  private rememberType(name: string, typeName: string | null): void {
    if (!typeName || !this.scopeStack.length) return;
    const scope = this.scopeStack[this.scopeStack.length - 1];
    scope.set(name, this.normalizeTypeName(typeName));
  }

  private resolveScopedType(name: string): string | null {
    for (let i = this.scopeStack.length - 1; i >= 0; i--) {
      const found = this.scopeStack[i].get(name);
      if (found) return found;
    }
    return null;
  }

  private registerParameters(parameters: ParameterNode[] | null): void {
    if (!parameters?.length) return;
    for (const parameter of parameters) {
      if (parameter.name.kind != NodeKind.Identifier) continue;
      const name = parameter.name.text;
      this.rememberType(name, parameter.type ? toString(parameter.type) : null);
    }
  }

  private isStaticMethod(method: MethodRef): boolean {
    return Boolean(method.node.flags & CommonFlags.Static);
  }

  private matchesClass(method: MethodRef, className: string): boolean {
    const normalized = this.normalizeTypeName(className);
    if (!normalized.length) return false;
    if (method.parent.name == normalized) return true;
    if (method.parent.qualifiedName == normalized) return true;
    if (method.parent.qualifiedName.endsWith("." + normalized)) return true;
    return false;
  }

  private inferClassName(node: Node): string | null {
    if (node.kind == NodeKind.This) {
      return this.currentClass;
    }
    if (node.kind == NodeKind.New) {
      const target = node as NewExpression;
      return this.normalizeTypeName(toString(target.typeName));
    }
    if (node.kind == NodeKind.Identifier) {
      const name = (node as IdentifierExpression).text;
      return this.resolveScopedType(name);
    }
    return null;
  }

  private inferTypeNameFromExpression(node: Node | null): string | null {
    if (!node) return null;

    if (node.kind == NodeKind.New) {
      return this.normalizeTypeName(toString((node as NewExpression).typeName));
    }

    if (node.kind == NodeKind.Assertion) {
      const assertion = node as AssertionExpression;
      if ((assertion.assertionKind == AssertionKind.As || assertion.assertionKind == AssertionKind.Prefix) && assertion.toType) {
        return this.normalizeTypeName(toString(assertion.toType));
      }
      return this.inferTypeNameFromExpression(assertion.expression);
    }

    if (node.kind == NodeKind.Parenthesized) {
      return this.inferTypeNameFromExpression((node as ParenthesizedExpression).expression);
    }

    return null;
  }

  private inferStaticIntent(node: Node): boolean | null {
    if (node.kind == NodeKind.This || node.kind == NodeKind.New) return false;

    if (node.kind == NodeKind.Identifier) {
      const name = (node as IdentifierExpression).text;
      if (this.resolveScopedType(name)) return false;

      for (const method of Globals.methods) {
        if (method.parent.name == name || method.parent.qualifiedName == name || method.parent.qualifiedName.endsWith("." + name)) {
          return true;
        }
      }
      return null;
    }

    if (node.kind == NodeKind.PropertyAccess) {
      const target = toString(node);
      for (const method of Globals.methods) {
        if (method.parent.qualifiedName == target || method.parent.qualifiedName.endsWith("." + target)) {
          return true;
        }
      }
    }

    return null;
  }

  private resolveMethodRef(node: CallExpression): MethodRef | null {
    if (node.expression.kind != NodeKind.PropertyAccess) return null;

    const expression = node.expression as PropertyAccessExpression;
    const name = expression.property.text;
    const candidates = this.methodIndex.get(this.methodKey(name, node.args.length));
    if (!candidates?.length) return null;

    const classHint = this.inferClassName(expression.expression);
    const staticHint = this.inferStaticIntent(expression.expression);

    let filtered = candidates;

    if (classHint) {
      filtered = filtered.filter((method) => this.matchesClass(method, classHint));
    }

    if (staticHint != null) {
      filtered = filtered.filter((method) => this.isStaticMethod(method) == staticHint);
    }

    if (!filtered.length && classHint) {
      const fallback = this.normalizeTypeName(classHint).split(".").pop() || "";
      if (fallback.length) {
        filtered = candidates.filter((method) => method.parent.name == fallback);
      }
      if (staticHint != null) {
        filtered = filtered.filter((method) => this.isStaticMethod(method) == staticHint);
      }
    }

    if (filtered.length == 1) return filtered[0];
    if (!classHint && staticHint == null && candidates.length == 1) return candidates[0];
    return null;
  }

  visitClassDeclaration(node: ClassDeclaration, isDefault: boolean = false, ref: Node | Node[] | null = null): void {
    const previousClass = this.currentClass;
    this.classExtends.set(node.name.text, node.extendsType ? this.normalizeTypeName(toString(node.extendsType)) : null);
    this.currentClass = node.name.text;
    super.visitClassDeclaration(node, isDefault, ref);
    this.currentClass = previousClass;
  }

  visitFunctionDeclaration(node: FunctionDeclaration, isDefault: boolean = false, ref: Node | Node[] | null = null): void {
    this.pushScope();
    this.registerParameters(node.signature.parameters);
    super.visitFunctionDeclaration(node, isDefault, ref);
    this.popScope();
  }

  visitMethodDeclaration(node: MethodDeclaration, ref: Node | Node[] | null = null): void {
    this.pushScope();
    this.registerParameters(node.signature.parameters);
    super.visitMethodDeclaration(node, ref);
    this.popScope();
  }

  visitVariableDeclaration(node: VariableDeclaration, ref: Node | Node[] | null = null): void {
    let typeName: string | null = null;
    if (node.type) {
      typeName = toString(node.type);
    } else if (node.initializer) {
      typeName = this.inferTypeNameFromExpression(node.initializer);
    }

    if (node.name.kind == NodeKind.Identifier) {
      this.rememberType(node.name.text, typeName);
    }

    super.visitVariableDeclaration(node, ref);
  }

  visitCallExpression(node: CallExpression, ref: Node | Node[] | null = null): void {
    const methRef = this.resolveMethodRef(node);
    if ((!methRef && node.expression.kind != NodeKind.PropertyAccess) || node.expression.kind != NodeKind.PropertyAccess) {
      return super.visitCallExpression(node, ref);
    }

    const target = node.expression as PropertyAccessExpression;
    if (target.property.text == "rethrow") {
      return super.visitCallExpression(node, ref);
    }

    if (!methRef) {
      return super.visitCallExpression(node, ref);
    }

    super.visitCallExpression(node, ref);

    if (methRef.tries.length) return;
    if (target.property.text.startsWith("__try_")) return;

    target.property.text = "__try_" + target.property.text;

    if (DEBUG > 1) {
      console.log("Rewrote method call to " + target.property.text + " in " + node.range.source.internalPath);
    }
  }

  visitThrowStatement(node: ThrowStatement, ref: Node | Node[] | null = null): void {
    if (node.value.kind != NodeKind.Identifier) return super.visitThrowStatement(node, ref);
    super.visitThrowStatement(node, ref);

    const thrown = node.value as IdentifierExpression;
    if (this.isExceptionType(this.resolveScopedType(thrown.text))) {
      const rethrow = Node.createPropertyAccessExpression(node.value, Node.createIdentifierExpression("rethrow", node.range), node.range);
      const rethrowCall = Node.createExpressionStatement(Node.createCallExpression(rethrow, null, [], node.range));
      replaceRef(node, rethrowCall, ref);
      return;
    }

    const tryRethrow = Node.createPropertyAccessExpression(node.value, Node.createIdentifierExpression("__try_rethrow", node.range), node.range);
    const rethrow = Node.createPropertyAccessExpression(node.value, Node.createIdentifierExpression("rethrow", node.range), node.range);
    const newThrow = Node.createIfStatement(Node.createCallExpression(Node.createIdentifierExpression("isDefined", node.range), null, [tryRethrow], node.range), Node.createExpressionStatement(Node.createCallExpression(tryRethrow, null, [], node.range)), Node.createIfStatement(Node.createCallExpression(Node.createIdentifierExpression("isDefined", node.range), null, [rethrow], node.range), Node.createExpressionStatement(Node.createCallExpression(rethrow, null, [], node.range)), Node.createThrowStatement(node.value, node.range), node.range), node.range);

    replaceRef(node, [newThrow], ref);
  }

  static replace(sources: Source[]): void {
    const replacer = new ThrowReplacer();
    replacer.indexMethodRefs();
    for (const source of sources) {
      replacer.source = source;
      replacer.visit(source);
    }
  }
}
