import * as asc from "assemblyscript/dist/assemblyscript.js";

// NodeKind is declared as a `const enum` in the assemblyscript .d.ts, so any
// direct named import inlines its numeric values at compile time. When a
// consumer is compiled against an older assemblyscript .d.ts than the one
// loaded at runtime, those inlined numbers drift out of sync with the live
// NodeKind enum and visitor dispatch goes to the wrong branch.
//
// Re-export NodeKind by reading it back off the runtime module so the live
// numeric values are always used, regardless of which assemblyscript types the
// project was built against.
export const NodeKind = (asc as unknown as { NodeKind: Record<string, number> }).NodeKind;
