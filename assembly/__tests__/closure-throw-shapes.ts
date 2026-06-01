// Cross-module throw shapes for closure-throw.spec.ts. The rejection always
// happens deep in *called* code (one or more hops away from the closure that
// `expect(...).toThrow()` runs), never as a literal throw in the closure —
// which is exactly the shape real libraries reject with.

export function deep(): void {
  throw new Error("boom");
}
export function mid(): void {
  deep();
}
export function abortDeep(): void {
  abort("boom");
}
export function abortMid(): void {
  abortDeep();
}

export namespace NS {
  export function fails(): void {
    throw new Error("ns boom");
  }
}

export class Parser {
  parse(): void {
    throw new Error("parse boom");
  }
}

export function genericFail<T>(): void {
  throw new Error("generic boom");
}
