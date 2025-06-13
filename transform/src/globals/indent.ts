class Indent {
  private value = "";
  add(): string {
    return (this.value += " |");
  }
  rm(): string {
    return (this.value = this.value.slice(-2));
  }
  toString(): string {
    return this.value;
  }
}

export const indent = new Indent();
