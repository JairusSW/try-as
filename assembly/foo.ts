export namespace JSON {
  export function parse<T>(s: string): T {
    inline.always(bar());
    throw new Error("not implemented");
  }
}

function bar(): void {
  abort("Aborted from bar");
}
