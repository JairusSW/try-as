import { Node } from "assemblyscript/dist/assemblyscript.js";
import { NodeKind } from "./types.js";
import { toString } from "./lib/util.js";
import path from "path";
export function replaceRef(node, replacement, ref) {
    if (!node || !ref)
        return;
    const nodeExpr = stripExpr(node);
    if (Array.isArray(ref)) {
        for (let i = 0; i < ref.length; i++) {
            if (stripExpr(ref[i]) == nodeExpr) {
                if (Array.isArray(replacement))
                    ref.splice(i, 1, ...replacement);
                else
                    ref.splice(i, 1, replacement);
                return;
            }
        }
    }
    else if (typeof ref == "object") {
        for (const key of Object.keys(ref)) {
            const current = ref[key];
            if (Array.isArray(current)) {
                for (let i = 0; i < current.length; i++) {
                    if (stripExpr(current[i]) == nodeExpr) {
                        if (Array.isArray(replacement))
                            current.splice(i, 1, ...replacement);
                        else
                            current.splice(i, 1, replacement);
                        return;
                    }
                }
            }
            else if (stripExpr(current) == nodeExpr) {
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
            if (stripExpr(ref[i]) == targetExpr) {
                if (Array.isArray(additions))
                    ref.splice(i + 1, 0, ...additions);
                else
                    ref.splice(i + 1, 0, additions);
                return;
            }
        }
    }
    else if (typeof ref == "object") {
        for (const key of Object.keys(ref)) {
            const current = ref[key];
            if (Array.isArray(current)) {
                for (let i = 0; i < current.length; i++) {
                    if (stripExpr(current[i]) == targetExpr) {
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
export function isUnrollCheck(node) {
    if (!node || node.kind != NodeKind.If)
        return false;
    const cond = node.condition;
    if (!cond || cond.kind != NodeKind.Binary)
        return false;
    const bin = cond;
    if (bin.operator != 73 || bin.left.kind != NodeKind.PropertyAccess)
        return false;
    const left = bin.left;
    return left.property.text == "Failures" && left.expression.kind == NodeKind.Identifier && left.expression.text == "__ExceptionState";
}
export function isStmtListMember(node) {
    if (!node)
        return false;
    switch (node.kind) {
        case NodeKind.Block:
        case NodeKind.Break:
        case NodeKind.Continue:
        case NodeKind.Do:
        case NodeKind.Empty:
        case NodeKind.Expression:
        case NodeKind.For:
        case NodeKind.ForOf:
        case NodeKind.If:
        case NodeKind.Return:
        case NodeKind.Switch:
        case NodeKind.Throw:
        case NodeKind.Try:
        case NodeKind.Variable:
        case NodeKind.Void:
        case NodeKind.While:
            return true;
        default:
            return false;
    }
}
export function addUnrollCheckAfter(stmt, unrollCheck, container) {
    const target = stripExpr(stmt);
    for (let i = 0; i < container.length; i++) {
        if (stripExpr(container[i]) != target)
            continue;
        if (isUnrollCheck(container[i + 1]))
            return;
        container.splice(i + 1, 0, unrollCheck);
        return;
    }
}
export function replaceAfter(node, replacement, ref) {
    if (!node || !ref)
        return;
    const nodeExpr = stripExpr(node);
    if (Array.isArray(ref)) {
        let found = false;
        for (let i = 0; i < ref.length; i++) {
            if (found || stripExpr(ref[i]) == nodeExpr) {
                ref.splice(i, ref.length - i, ...(Array.isArray(replacement) ? replacement : [replacement]));
                return;
            }
        }
    }
    else if (typeof ref == "object") {
        for (const key of Object.keys(ref)) {
            const current = ref[key];
            if (Array.isArray(current)) {
                let found = false;
                for (let i = 0; i < current.length; i++) {
                    if (found || stripExpr(current[i]) == nodeExpr) {
                        current.splice(i, current.length - i, ...(Array.isArray(replacement) ? replacement : [replacement]));
                        return;
                    }
                }
            }
            else if (stripExpr(current) == nodeExpr) {
                ref[key] = replacement;
                return;
            }
        }
    }
}
export function stripExpr(node) {
    if (!node)
        return node;
    if (node.kind == NodeKind.Expression)
        return node["expression"];
    return node;
}
export function locateCall(callNode, ref) {
    if (!callNode || !ref)
        return { kind: "notFound" };
    const callExpr = stripExpr(callNode);
    if (Array.isArray(ref)) {
        for (let i = 0; i < ref.length; i++) {
            if (ref[i] !== callExpr && stripExpr(ref[i]) == callExpr)
                return { kind: "statementArray", container: ref, index: i };
            if (ref[i] === callExpr)
                return { kind: "objectArray", container: ref, index: i };
        }
        return { kind: "notFound" };
    }
    if (typeof ref != "object")
        return { kind: "notFound" };
    for (const key of Object.keys(ref)) {
        const current = ref[key];
        if (Array.isArray(current)) {
            for (let i = 0; i < current.length; i++) {
                if (current[i] !== callExpr && stripExpr(current[i]) == callExpr)
                    return { kind: "statementArray", container: current, index: i };
                if (current[i] === callExpr)
                    return { kind: "objectArray", container: current, index: i };
            }
        }
        else if (current && stripExpr(current) == callExpr) {
            return { kind: "expressionSlot", container: ref, key };
        }
    }
    return { kind: "notFound" };
}
export function replaceCallExpression(callNode, replacement, ref) {
    const pos = locateCall(callNode, ref);
    if (pos.kind == "notFound")
        return;
    if (pos.kind == "statementArray") {
        pos.container.splice(pos.index, 1, Node.createExpressionStatement(replacement));
    }
    else if (pos.kind == "objectArray") {
        pos.container.splice(pos.index, 1, replacement);
    }
    else {
        pos.container[pos.key] = replacement;
    }
}
export function replaceCallWithIsDefinedIf(callNode, isDefinedArg, renamedCall, originalCall, ref) {
    const pos = locateCall(callNode, ref);
    if (pos.kind == "notFound")
        return false;
    if (pos.kind != "statementArray")
        return false;
    const range = callNode.range;
    const isDefinedCheck = Node.createCallExpression(Node.createIdentifierExpression("isDefined", range), null, [isDefinedArg], range);
    const ifStmt = Node.createIfStatement(isDefinedCheck, Node.createBlockStatement([Node.createExpressionStatement(renamedCall)], range), Node.createBlockStatement([Node.createExpressionStatement(originalCall)], range), range);
    pos.container.splice(pos.index, 1, ifStmt);
    return true;
}
export function blockify(node) {
    let block = node.kind == NodeKind.Block ? node : Node.createBlockStatement([node], node.range);
    return block;
}
export function cloneNode(input, seen = new WeakMap(), path = "") {
    if (input == null || typeof input != "object")
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
        else if (value && typeof value == "object") {
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
export function getBreakerValue(node, parentFn = null) {
    if (!parentFn || parentFn.flags & 524288)
        return null;
    if (!parentFn.signature || !parentFn.signature.returnType)
        return null;
    const rt = toString(parentFn.signature.returnType);
    if (rt == "" || rt == "void" || rt == "never")
        return null;
    const T = parentFn.signature.returnType;
    return Node.createTernaryExpression(Node.createCallExpression(Node.createIdentifierExpression("isBoolean", node.range), [T], [], node.range), Node.createFalseExpression(node.range), Node.createTernaryExpression(Node.createBinaryExpression(98, Node.createCallExpression(Node.createIdentifierExpression("isInteger", node.range), [T], [], node.range), Node.createCallExpression(Node.createIdentifierExpression("isFloat", node.range), [T], [], node.range), node.range), Node.createIntegerLiteralExpression(i64_zero, node.range), Node.createCallExpression(Node.createIdentifierExpression("changetype", node.range), [T], [Node.createIntegerLiteralExpression(i64_zero, node.range)], node.range), node.range), node.range);
}
export function getBreaker(node, parentFn = null) {
    let breakStmt = Node.createBreakStatement(null, node.range);
    if (parentFn) {
        if (parentFn.flags & 524288) {
            return Node.createReturnStatement(Node.createThisExpression(node.range), node.range);
        }
        if (!parentFn.signature.returnType) {
            return Node.createReturnStatement(null, node.range);
        }
        const returnType = toString(parentFn.signature.returnType);
        if (returnType == "") {
            return Node.createReturnStatement(null, node.range);
        }
        if (returnType != "void" && returnType != "never") {
            breakStmt = Node.createIfStatement(Node.createCallExpression(Node.createIdentifierExpression("isBoolean", node.range), [parentFn.signature.returnType], [], node.range), Node.createReturnStatement(Node.createFalseExpression(node.range), node.range), Node.createIfStatement(Node.createBinaryExpression(98, Node.createCallExpression(Node.createIdentifierExpression("isInteger", node.range), [parentFn.signature.returnType], [], node.range), Node.createCallExpression(Node.createIdentifierExpression("isFloat", node.range), [parentFn.signature.returnType], [], node.range), node.range), Node.createReturnStatement(Node.createIntegerLiteralExpression(i64_zero, node.range), node.range), Node.createIfStatement(Node.createBinaryExpression(98, Node.createCallExpression(Node.createIdentifierExpression("isManaged", node.range), [parentFn.signature.returnType], [], node.range), Node.createCallExpression(Node.createIdentifierExpression("isReference", node.range), [parentFn.signature.returnType], [], node.range), node.range), Node.createReturnStatement(Node.createCallExpression(Node.createIdentifierExpression("changetype", node.range), [parentFn.signature.returnType], [Node.createIntegerLiteralExpression(i64_zero, node.range)], node.range), node.range), Node.createReturnStatement(null, node.range), node.range), node.range), node.range);
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
        if (ref.some((r) => !isRefStatement(null, r)))
            return false;
        return true;
    }
    if (ref.kind == NodeKind.Source)
        return true;
    if (ref.kind == NodeKind.Class)
        return true;
    if (ref.kind == NodeKind.Block)
        return true;
    if (ref.kind == NodeKind.Break)
        return true;
    if (ref.kind == NodeKind.Continue)
        return true;
    if (ref.kind == NodeKind.Do)
        return true;
    if (ref.kind == NodeKind.Empty)
        return true;
    if (ref.kind == NodeKind.Export)
        return true;
    if (ref.kind == NodeKind.ExportDefault)
        return true;
    if (ref.kind == NodeKind.ExportImport)
        return true;
    if (ref.kind == NodeKind.Expression)
        return true;
    if (ref.kind == NodeKind.For)
        return true;
    if (ref.kind == NodeKind.ForOf)
        return true;
    if (ref.kind == NodeKind.If)
        return true;
    if (ref.kind == NodeKind.Import)
        return true;
    if (ref.kind == NodeKind.Return)
        return true;
    if (ref.kind == NodeKind.Switch)
        return true;
    if (ref.kind == NodeKind.Throw)
        return true;
    if (ref.kind == NodeKind.Try)
        return true;
    if (ref.kind == NodeKind.Variable)
        return true;
    if (ref.kind == NodeKind.While)
        return true;
    if (ref.kind == NodeKind.Module)
        return true;
    if (ref.kind == NodeKind.ClassDeclaration)
        return true;
    if (ref.kind == NodeKind.EnumDeclaration)
        return true;
    if (ref.kind == NodeKind.FieldDeclaration)
        return true;
    if (ref.kind == NodeKind.FunctionDeclaration)
        return true;
    if (ref.kind == NodeKind.ImportDeclaration)
        return true;
    if (ref.kind == NodeKind.InterfaceDeclaration)
        return true;
    if (ref.kind == NodeKind.MethodDeclaration)
        return true;
    if (ref.kind == NodeKind.NamespaceDeclaration)
        return true;
    if (ref.kind == NodeKind.TypeDeclaration)
        return true;
    if (ref.kind == NodeKind.VariableDeclaration)
        return true;
    return false;
}
export function getName(name, path = null) {
    if (!name)
        return "";
    if (typeof name != "string") {
        if (name.kind == NodeKind.Identifier) {
            name = name.text;
        }
        else if (name.kind == NodeKind.PropertyAccess) {
            const expr = name;
            name = getName(expr.expression) + "." + expr.property.text;
        }
        else {
            return "";
        }
    }
    return path?.length ? path.map((v) => v?.name).join(".") + (name ? "." + name : "") : name;
}
