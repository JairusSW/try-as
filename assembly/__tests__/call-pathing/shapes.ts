// throw chains
export function deep(): void {
  throw new Error("deep");
}
export function mid(): void {
  deep();
}
export function top(): void {
  mid();
}

// abort chains
export function abortDeep(): void {
  abort("abort-deep");
}
export function abortMid(): void {
  abortDeep();
}

// swallowing: catches internally, does NOT propagate
export function swallow(): void {
  try {
    deep();
  } catch (e) {
    // swallowed
  }
}

// catches then rethrows
export function rethrows(): void {
  try {
    deep();
  } catch (e) {
    throw new Error("rethrown");
  }
}

// conditional throw
export function maybe(cond: bool): void {
  if (cond) deep();
}

// non-throwing
export function safe(): i32 {
  return 42;
}

// namespace, nested
export namespace A {
  export function fails(): void {
    throw new Error("A.fails");
  }
  export namespace B {
    export function fails(): void {
      throw new Error("A.B.fails");
    }
  }
}

// class with instance + static + chained methods
export class Service {
  run(): void {
    this.helper();
  }
  helper(): void {
    deep();
  }
  static make(): Service {
    return new Service();
  }
  static boom(): void {
    throw new Error("Service.boom");
  }
}

// generics
export function genericFail<T>(): void {
  throw new Error("generic");
}
export function genericPair<K, V>(): void {
  throw new Error("generic-pair");
}

export class Box<T> {
  open(): void {
    throw new Error("Box.open");
  }
}
