import { Node } from "assemblyscript/dist/assemblyscript.js";
import { toString } from "./lib/util.js";
import path from "path";
export function replaceRef(node, replacement, ref) {
    if (!node || !ref)
        return;
    const nodeExpr = stripExpr(node);
    if (Array.isArray(ref)) {
        for (let i = 0; i < ref.length; i++) {
            if (stripExpr(ref[i]) === nodeExpr) {
                if (Array.isArray(replacement))
                    ref.splice(i, 1, ...replacement);
                else
                    ref.splice(i, 1, replacement);
                return;
            }
        }
    }
    else if (typeof ref === "object") {
        for (const key of Object.keys(ref)) {
            const current = ref[key];
            if (Array.isArray(current)) {
                for (let i = 0; i < current.length; i++) {
                    if (stripExpr(current[i]) === nodeExpr) {
                        if (Array.isArray(replacement))
                            current.splice(i, 1, ...replacement);
                        else
                            current.splice(i, 1, replacement);
                        return;
                    }
                }
            }
            else if (stripExpr(current) === nodeExpr) {
                ref[key] = replacement;
                return;
            }
        }
    }
}
export function addAfter(node, additions, ref) {
    if (!node || !ref)
        return;
    const targetExpr = stripExpr(node);
    if (Array.isArray(ref)) {
        for (let i = 0; i < ref.length; i++) {
            if (stripExpr(ref[i]) === targetExpr) {
                if (Array.isArray(additions))
                    ref.splice(i + 1, 0, ...additions);
                else
                    ref.splice(i + 1, 0, additions);
                return;
            }
        }
    }
    else if (typeof ref === "object") {
        for (const key of Object.keys(ref)) {
            const current = ref[key];
            if (Array.isArray(current)) {
                for (let i = 0; i < current.length; i++) {
                    if (stripExpr(current[i]) === targetExpr) {
                        if (Array.isArray(additions))
                            current.splice(i + 1, 0, ...additions);
                        else
                            current.splice(i + 1, 0, additions);
                        return;
                    }
                }
            }
        }
    }
}
export function replaceAfter(node, replacement, ref, Reference) {
    if (!node || !ref)
        return;
    const nodeExpr = stripExpr(node);
    if (Array.isArray(ref)) {
        let found = false;
        for (let i = 0; i < ref.length; i++) {
            if (found || stripExpr(ref[i]) === nodeExpr) {
                ref.splice(i, ref.length - i, ...(Array.isArray(replacement) ? replacement : [replacement]));
                return;
            }
        }
    }
    else if (typeof ref === "object") {
        for (const key of Object.keys(ref)) {
            const current = ref[key];
            if (Array.isArray(current)) {
                let found = false;
                for (let i = 0; i < current.length; i++) {
                    if (found || stripExpr(current[i]) === nodeExpr) {
                        current.splice(i, current.length - i, ...(Array.isArray(replacement) ? replacement : [replacement]));
                        return;
                    }
                }
            }
            else if (stripExpr(current) === nodeExpr) {
                ref[key] = replacement;
                return;
            }
        }
    }
}
export function stripExpr(node) {
    if (!node)
        return node;
    if (node.kind == 38)
        return node["expression"];
    return node;
}
export function blockify(node) {
    if (!node)
        return null;
    let block = node.kind == 30 ? node : Node.createBlockStatement([node], node.range);
    return block;
}
export function getFnName(expr, path = null) {
    const _path = path && path.length ? path.join(".") + "." : "";
    if (typeof expr == "string") {
        return _path + expr;
    }
    else if (expr.kind === 6) {
        return _path + expr.text;
    }
    else if (expr.kind === 21) {
        const prop = expr;
        const left = getFnName(prop.expression, path);
        const right = prop.property.text;
        return left ? left + "." + right : right;
    }
    return null;
}
export function cloneNode(input, seen = new WeakMap(), path = "") {
    if (input === null || typeof input !== "object")
        return input;
    if (Array.isArray(input)) {
        return input.map((item, index) => cloneNode(item, seen, `${path}[${index}]`));
    }
    if (seen.has(input))
        return seen.get(input);
    const prototype = Object.getPrototypeOf(input);
    const clone = Array.isArray(input) ? [] : Object.create(prototype);
    seen.set(input, clone);
    for (const key of Reflect.ownKeys(input)) {
        const value = input[key];
        const newPath = path ? `${path}.${String(key)}` : String(key);
        if (newPath.endsWith(".source")) {
            clone[key] = value;
        }
        else if (value && typeof value === "object") {
            clone[key] = cloneNode(value, seen, newPath);
        }
        else {
            clone[key] = value;
        }
    }
    return clone;
}
export function removeExtension(filePath) {
    const parsed = path.parse(filePath);
    return path.join(parsed.dir, parsed.name);
}
export function getBreaker(node, parent = null) {
    let breakStmt = Node.createBreakStatement(null, node.range);
    if (parent) {
        const returnType = toString(parent.signature.returnType);
        if (returnType != "void" && returnType != "never") {
            breakStmt = Node.createIfStatement(Node.createCallExpression(Node.createIdentifierExpression("isBoolean", node.range), [parent.signature.returnType], [], node.range), Node.createReturnStatement(Node.createFalseExpression(node.range), node.range), Node.createIfStatement(Node.createBinaryExpression(98, Node.createCallExpression(Node.createIdentifierExpression("isInteger", node.range), [parent.signature.returnType], [], node.range), Node.createCallExpression(Node.createIdentifierExpression("isFloat", node.range), [parent.signature.returnType], [], node.range), node.range), Node.createReturnStatement(Node.createIntegerLiteralExpression(i64_zero, node.range), node.range), Node.createIfStatement(Node.createBinaryExpression(98, Node.createCallExpression(Node.createIdentifierExpression("isManaged", node.range), [parent.signature.returnType], [], node.range), Node.createCallExpression(Node.createIdentifierExpression("isReference", node.range), [parent.signature.returnType], [], node.range), node.range), Node.createReturnStatement(Node.createCallExpression(Node.createIdentifierExpression("changetype", node.range), [parent.signature.returnType], [Node.createIntegerLiteralExpression(i64_zero, node.range)], node.range), node.range), Node.createReturnStatement(null, node.range), node.range), node.range), node.range);
        }
        else {
            breakStmt = Node.createReturnStatement(null, node.range);
        }
    }
    return breakStmt;
}
export function isRefStatement(node, ref) {
    if (node)
        return isRefStatement(null, node) || isRefStatement(null, ref);
    if (!ref)
        return false;
    if (Array.isArray(ref)) {
        if (ref.some(r => !isRefStatement(null, r)))
            return false;
        return true;
    }
    if (ref.kind == 0)
        return true;
    if (ref.kind == 10)
        return true;
    if (ref.kind == 30)
        return true;
    if (ref.kind == 31)
        return true;
    if (ref.kind == 32)
        return true;
    if (ref.kind == 33)
        return true;
    if (ref.kind == 34)
        return true;
    if (ref.kind == 35)
        return true;
    if (ref.kind == 36)
        return true;
    if (ref.kind == 37)
        return true;
    if (ref.kind == 38)
        return true;
    if (ref.kind == 39)
        return true;
    if (ref.kind == 40)
        return true;
    if (ref.kind == 41)
        return true;
    if (ref.kind == 42)
        return true;
    if (ref.kind == 43)
        return true;
    if (ref.kind == 44)
        return true;
    if (ref.kind == 45)
        return true;
    if (ref.kind == 46)
        return true;
    if (ref.kind == 47)
        return true;
    if (ref.kind == 49)
        return true;
    if (ref.kind == 50)
        return true;
    if (ref.kind == 51)
        return true;
    if (ref.kind == 52)
        return true;
    if (ref.kind == 54)
        return true;
    if (ref.kind == 55)
        return true;
    if (ref.kind == 56)
        return true;
    if (ref.kind == 57)
        return true;
    if (ref.kind == 58)
        return true;
    if (ref.kind == 59)
        return true;
    if (ref.kind == 60)
        return true;
    if (ref.kind == 61)
        return true;
    return false;
}
//# sourceMappingURL=utils.js.map