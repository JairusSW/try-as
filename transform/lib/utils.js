import { Node, } from "assemblyscript/dist/assemblyscript.js";
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
export function replaceAfter(node, replacement, ref) {
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
export function nodeEq(a, b) {
    if (!a || !b)
        return false;
    if (!a["kind"] || !b["kind"])
        return false;
    if (a === b)
        return true;
    if (typeof a !== "object" ||
        a === null ||
        typeof b !== "object" ||
        b === null)
        return false;
    const keys1 = Object.keys(a);
    const keys2 = Object.keys(b);
    if (keys1 !== keys2)
        return false;
    for (let key of keys1) {
        if (!keys2.includes(key))
            return false;
        if (!nodeEq(a[key], b[key]))
            return false;
    }
    return true;
}
export function isPrimitive(type) {
    const primitiveTypes = [
        "u8",
        "u16",
        "u32",
        "u64",
        "i8",
        "i16",
        "i32",
        "i64",
        "f32",
        "f64",
        "bool",
        "boolean",
    ];
    return primitiveTypes.some((v) => type.startsWith(v));
}
export function blockify(node) {
    let block = node.kind == 30
        ? node
        : Node.createBlockStatement([node], node.range);
    return block;
}
export function getFnName(expr, path = null) {
    const _path = path ? path.join(".") + "." : "";
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
export function hasBaseException(statements) {
    return statements.some((v) => {
        if (!v)
            return false;
        if (v.kind == 38)
            v = v.expression;
        if (v.kind == 9 &&
            v.expression.kind == 6 &&
            (v.expression.text ==
                "abort" ||
                v.expression.text ==
                    "unreachable"))
            return true;
        if (v.kind == 45)
            return true;
        return false;
    });
}
export function hasOnlyCalls(statements) {
    return statements.every((v) => {
        if (!v)
            return true;
        if (v.kind === 38) {
            v = v.expression;
        }
        if (v.kind !== 9)
            return false;
        const callExpr = v;
        if (callExpr.expression.kind === 6 &&
            (callExpr.expression.text === "abort" ||
                callExpr.expression.text === "unreachable")) {
            return false;
        }
        return true;
    });
}
export function removeExtension(filePath) {
    const parsed = path.parse(filePath);
    return path.join(parsed.dir, parsed.name);
}
//# sourceMappingURL=utils.js.map