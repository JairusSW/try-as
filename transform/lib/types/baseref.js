export class BaseRef {
    hasException = false;
    visited = false;
    generate() { }
    update(ref) {
        return this;
    }
}
