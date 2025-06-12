class Indent {
    value = "";
    add() {
        return this.value += " |";
    }
    rm() {
        return this.value = this.value.slice(-2);
    }
    toString() {
        return this.value;
    }
}
export const indent = new Indent();
//# sourceMappingURL=indent.js.map