export abstract class BaseRef {
  public hasException: boolean = false;
  public visited: boolean = false;
  generate(): void {}
  update(ref: this): this {
    return this;
  }
}
