export var __ExceptionType;
(function (__ExceptionType) {
    __ExceptionType[__ExceptionType["Throw"] = 0] = "Throw";
    __ExceptionType[__ExceptionType["Abort"] = 1] = "Abort";
    __ExceptionType[__ExceptionType["Unreachable"] = 2] = "Unreachable";
})(__ExceptionType || (__ExceptionType = {}));
export class __Exception {
    type;
    node;
    base;
    children;
    constructor(type, node, base, children = []) {
        this.type = type;
        this.node = node;
        this.base = base;
        this.children = children;
    }
}
//# sourceMappingURL=types.js.map