export abstract class BaseRef {
  public hasException: boolean = false;
  generate(): void {}
  update(ref: this): this {
    return this;
  }
}
