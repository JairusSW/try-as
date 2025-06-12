import { Node } from "assemblyscript/dist/assemblyscript.js";
import { blockify, getBreaker, getFnName } from "../utils.js";
import { indent } from "../globals/indent.js";
export class CallRef {
    node;
    ref;
    calling;
    name;
    parentFn = null;
    constructor(node, ref, calling) {
        this.node = node;
        this.ref = ref;
        this.calling = calling;
        this.name = getFnName(node.expression);
    }
    generate() {
        const breaker = getBreaker(this.node, this.parentFn?.node);
        const newName = this.node.expression.kind == 21
            ? Node.createPropertyAccessExpression(this.node.expression.expression, Node.createIdentifierExpression("__try_" + this.node.expression.property.text, this.node.range), this.node.range)
            :
                Node.createIdentifierExpression("__try_" + this.node.expression.text, this.node.range);
        const unrollCheck = Node.createIfStatement(Node.createBinaryExpression(73, Node.createPropertyAccessExpression(Node.createIdentifierExpression("__ExceptionState", this.node.range), Node.createIdentifierExpression("Failures", this.node.range), this.node.range), Node.createIntegerLiteralExpression(i64_zero, this.node.range), this.node.range), blockify(breaker), null, this.node.range);
        const overrideCall = Node.createExpressionStatement(Node.createCallExpression(newName, this.node.typeArguments, this.node.args, this.node.range));
        console.log(indent + "Replaced call: " + getFnName(newName));
    }
}
//# sourceMappingURL=callref.js.map