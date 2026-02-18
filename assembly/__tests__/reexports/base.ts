export function sourceAbort(): void {
  abort("Aborted from sourceAbort");
}

export namespace SourceNS {
  export function nestedAbort(): void {
    abort("Aborted from SourceNS.nestedAbort");
  }
}
