export namespace JSON {
  export function parse<T>(s: string): T {
    if (isDefined(s.__DESERIALIZE)) {
      console.log("s.__DESERIALIZE is defined...");
      const out = __new(offsetof<nonnull<T>>(), idof<nonnull<T>>());
      // @ts-ignore: Defined by transform
      if (isDefined(type.__INITIALIZE)) changetype<nonnull<T>>(out).__INITIALIZE();
      deserializeStruct<T>(changetype<usize>(s), changetype<usize>(s) + 10, out);
    }
    throw new Error("not implemented");
  }
}

function deserializeStruct<T>(srcStart: usize, srcEnd: usize, dst: usize): T {
  abort("Expected '{' at start of object at position " + (srcEnd - srcStart).toString());
}
