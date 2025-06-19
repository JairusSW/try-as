class _Globals {
    baseCWD = process.cwd();
    sources = new Map();
    callStack = new Set();
    refStack = new Set();
    foundException = false;
    lastTry = null;
}
export const Globals = new _Globals();
//# sourceMappingURL=globals.js.map