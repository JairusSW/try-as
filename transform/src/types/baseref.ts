export abstract class BaseRef {
  generate(): void {}
  update(ref: this): this {
    return this;
  }
}
