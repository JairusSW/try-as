export function parse<T>(s: string): T {
  if (true) {
    console.log("s.__DESERIALIZE is defined...");
    deserializeStruct();
  }
  throw new Error("not implemented");
}

function deserializeStruct(): void {
  abort("Expected '{' at start of object");
}