// import { AbortState as __AbortState } from "./types/abort";
// import { ErrorState as __ErrorState } from "./types/error";
// import { ExceptionState as __ExceptionState } from "./types/exception";

export function foo(): void {
  // try {
  //   FOO.foo();
  // } catch (e) {
  //   console.log(e.toString());
  // }
  console.log("Executing foo");
  abort("Aborted from foo");
}

export namespace FOO {
  export function foo(): void {
    console.log("Executing FOO.foo");
    abort("Aborted from FOO.foo");
  }
}

export * from "./json";
// export namespace JSON {
//   export function parse<T>(s: string): T {
//     throw new Error("not implemented")
//   }
// }
