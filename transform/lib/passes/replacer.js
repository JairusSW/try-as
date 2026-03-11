import { Node } from "assemblyscript/dist/assemblyscript.js";
import { Visitor } from "../lib/visitor.js";
import { replaceRef } from "../utils.js";
import { toString } from "../lib/util.js";
import { Globals } from "../globals/globals.js";
const rawValue = process.env["DEBUG"];
const DEBUG = rawValue == "true" ? 1 : rawValue == "false" || rawValue == "" ? 0 : isNaN(Number(rawValue)) ? 0 : Number(rawValue);
export class ThrowReplacer extends Visitor {
    source;
    methodIndex = new Map();
    classExtends = new Map();
    scopeStack = [];
    currentClass = null;
    indexMethodRefs() {
        this.methodIndex.clear();
        for (const method of Globals.methods) {
            if (!method.hasException)
                continue;
            const key = this.methodKey(method.name, method.node.signature.parameters.length);
            const indexed = this.methodIndex.get(key);
            if (indexed)
                indexed.push(method);
            else
                this.methodIndex.set(key, [method]);
        }
    }
    methodKey(name, arity) {
        return name + "/" + arity.toString();
    }
    isExceptionType(typeName) {
        if (!typeName)
            return false;
        let normalized = this.normalizeTypeName(typeName);
        const seen = new Set();
        while (normalized.length && !seen.has(normalized)) {
            if (normalized == "Exception" || normalized.endsWith(".Exception"))
                return true;
            seen.add(normalized);
            const fallback = normalized.split(".").pop() || "";
            const parent = this.classExtends.get(normalized) || this.classExtends.get(fallback) || null;
            if (!parent)
                return false;
            normalized = parent;
        }
        return false;
    }
    normalizeTypeName(name) {
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
    pushScope() {
        this.scopeStack.push(new Map());
    }
    popScope() {
        this.scopeStack.pop();
    }
    rememberType(name, typeName) {
        if (!typeName || !this.scopeStack.length)
            return;
        const scope = this.scopeStack[this.scopeStack.length - 1];
        scope.set(name, this.normalizeTypeName(typeName));
    }
    resolveScopedType(name) {
        for (let i = this.scopeStack.length - 1; i >= 0; i--) {
            const found = this.scopeStack[i].get(name);
            if (found)
                return found;
        }
        return null;
    }
    registerParameters(parameters) {
        if (!parameters?.length)
            return;
        for (const parameter of parameters) {
            if (parameter.name.kind != 6)
                continue;
            const name = parameter.name.text;
            this.rememberType(name, parameter.type ? toString(parameter.type) : null);
        }
    }
    isStaticMethod(method) {
        return Boolean(method.node.flags & 32);
    }
    matchesClass(method, className) {
        const normalized = this.normalizeTypeName(className);
        if (!normalized.length)
            return false;
        if (method.parent.name == normalized)
            return true;
        if (method.parent.qualifiedName == normalized)
            return true;
        if (method.parent.qualifiedName.endsWith("." + normalized))
            return true;
        return false;
    }
    inferClassName(node) {
        if (node.kind == 24) {
            return this.currentClass;
        }
        if (node.kind == 17) {
            const target = node;
            return this.normalizeTypeName(toString(target.typeName));
        }
        if (node.kind == 6) {
            const name = node.text;
            return this.resolveScopedType(name);
        }
        return null;
    }
    inferTypeNameFromExpression(node) {
        if (!node)
            return null;
        if (node.kind == 17) {
            return this.normalizeTypeName(toString(node.typeName));
        }
        if (node.kind == 7) {
            const assertion = node;
            if ((assertion.assertionKind == 1 || assertion.assertionKind == 0) && assertion.toType) {
                return this.normalizeTypeName(toString(assertion.toType));
            }
            return this.inferTypeNameFromExpression(assertion.expression);
        }
        if (node.kind == 20) {
            return this.inferTypeNameFromExpression(node.expression);
        }
        return null;
    }
    inferStaticIntent(node) {
        if (node.kind == 24 || node.kind == 17)
            return false;
        if (node.kind == 6) {
            const name = node.text;
            if (this.resolveScopedType(name))
                return false;
            for (const method of Globals.methods) {
                if (method.parent.name == name || method.parent.qualifiedName == name || method.parent.qualifiedName.endsWith("." + name)) {
                    return true;
                }
            }
            return null;
        }
        if (node.kind == 21) {
            const target = toString(node);
            for (const method of Globals.methods) {
                if (method.parent.qualifiedName == target || method.parent.qualifiedName.endsWith("." + target)) {
                    return true;
                }
            }
        }
        return null;
    }
    resolveMethodRef(node) {
        if (node.expression.kind != 21)
            return null;
        const expression = node.expression;
        const name = expression.property.text;
        const candidates = this.methodIndex.get(this.methodKey(name, node.args.length));
        if (!candidates?.length)
            return null;
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
        if (filtered.length == 1)
            return filtered[0];
        if (!classHint && staticHint == null && candidates.length == 1)
            return candidates[0];
        return null;
    }
    visitClassDeclaration(node, isDefault = false, ref = null) {
        const previousClass = this.currentClass;
        this.classExtends.set(node.name.text, node.extendsType ? this.normalizeTypeName(toString(node.extendsType)) : null);
        this.currentClass = node.name.text;
        super.visitClassDeclaration(node, isDefault, ref);
        this.currentClass = previousClass;
    }
    visitFunctionDeclaration(node, isDefault = false, ref = null) {
        this.pushScope();
        this.registerParameters(node.signature.parameters);
        super.visitFunctionDeclaration(node, isDefault, ref);
        this.popScope();
    }
    visitMethodDeclaration(node, ref = null) {
        this.pushScope();
        this.registerParameters(node.signature.parameters);
        super.visitMethodDeclaration(node, ref);
        this.popScope();
    }
    visitVariableDeclaration(node, ref = null) {
        let typeName = null;
        if (node.type) {
            typeName = toString(node.type);
        }
        else if (node.initializer) {
            typeName = this.inferTypeNameFromExpression(node.initializer);
        }
        if (node.name.kind == 6) {
            this.rememberType(node.name.text, typeName);
        }
        super.visitVariableDeclaration(node, ref);
    }
    visitCallExpression(node, ref = null) {
        const methRef = this.resolveMethodRef(node);
        if ((!methRef && node.expression.kind != 21) || node.expression.kind != 21) {
            return super.visitCallExpression(node, ref);
        }
        const target = node.expression;
        if (target.property.text == "rethrow") {
            return super.visitCallExpression(node, ref);
        }
        if (!methRef) {
            return super.visitCallExpression(node, ref);
        }
        super.visitCallExpression(node, ref);
        if (methRef.tries.length)
            return;
        if (target.property.text.startsWith("__try_"))
            return;
        target.property.text = "__try_" + target.property.text;
        if (DEBUG > 1) {
            console.log("Rewrote method call to " + target.property.text + " in " + node.range.source.internalPath);
        }
    }
    visitThrowStatement(node, ref = null) {
        if (node.value.kind != 6)
            return super.visitThrowStatement(node, ref);
        super.visitThrowStatement(node, ref);
        const thrown = node.value;
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
    static replace(sources) {
        const replacer = new ThrowReplacer();
        replacer.indexMethodRefs();
        for (const source of sources) {
            replacer.source = source;
            replacer.visit(source);
        }
    }
}
//# sourceMappingURL=replacer.js.map