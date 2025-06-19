import { Node } from "assemblyscript/dist/assemblyscript.js";
import { BaseRef } from "./baseref.js";
import { addAfter, blockify, cloneNode, getBreaker, getName } from "../utils.js";
import { indent } from "../globals/indent.js";
const rawValue = process.env["DEBUG"];
const DEBUG = rawValue == "true" ? 1 : rawValue == "false" || rawValue == "" ? 0 : isNaN(Number(rawValue)) ? 0 : Number(rawValue);
export class MethodRef extends BaseRef {
    node;
    ref;
    source;
    name;
    qualifiedName;
    path = [];
    parent;
    tries = [];
    exceptions = [];
    callers = [];
    cloneBody;
    state = "ready";
    constructor(node, ref, source, parent) {
        super();
        this.node = node;
        this.ref = ref;
        this.source = source;
        this.parent = parent;
        this.path = this.parent ? [...this.parent.path, this.parent] : [];
        this.name = node.name.text;
        this.qualifiedName = getName(node.name, this.path);
        this.cloneBody = cloneNode(node.body);
    }
    generate() {
        if (!this.hasException)
            return;
        if (this.node.name.text.startsWith("__try_"))
            return;
        if (DEBUG > 0)
            console.log(indent + "Generating method " + this.qualifiedName);
        indent.add();
        const returnStmt = getBreaker(this.node, this.node);
        const unrollCheck = Node.createIfStatement(Node.createBinaryExpression(73, Node.createPropertyAccessExpression(Node.createIdentifierExpression("__ExceptionState", this.node.range), Node.createIdentifierExpression("Failures", this.node.range), this.node.range), Node.createIntegerLiteralExpression(i64_zero, this.node.range), this.node.range), blockify(returnStmt), null, this.node.range);
        const replacementMethod = Node.createMethodDeclaration(Node.createIdentifierExpression(this.node.name.text, this.node.name.range), this.node.decorators, this.node.flags, this.node.typeParameters, this.node.signature, this.cloneBody, this.node.range);
        if (!this.tries.length)
            this.node.name = Node.createIdentifierExpression("__try_" + this.node.name.text, this.node.name.range);
        if (this.node.body.kind != 30) {
            this.node.body = blockify(this.node.body);
        }
        this.node.body.statements.unshift(unrollCheck);
        for (const exception of this.exceptions) {
            console.log(indent + "Generating exceptions");
            indent.add();
            exception.generate();
            indent.rm();
        }
        if (!this.tries.length) {
            for (const caller of this.callers) {
                console.log(indent + "Generating callers");
                indent.add();
                caller.generate();
                indent.rm();
            }
        }
        for (const tryRef of this.tries) {
            console.log(indent + "Generating tries");
            indent.add();
            tryRef.generate();
            indent.rm();
        }
        if (!this.tries.length)
            addAfter(this.node, replacementMethod, this.ref);
        indent.rm();
    }
    update(ref) {
        this.node = ref.node;
        this.ref = ref.ref;
        return this;
    }
}
//# sourceMappingURL=methodref.js.map