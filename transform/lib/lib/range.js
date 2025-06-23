import { Visitor } from "./visitor.js";
export class RangeTransform extends Visitor {
    newNode;
    constructor(newNode) {
        super();
        this.newNode = newNode;
    }
    _visit(node, ref) {
        node.range = this.newNode.range;
        super._visit(node, ref);
    }
}
//# sourceMappingURL=range.js.map