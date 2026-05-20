class _Globals {
    baseCWD = process.cwd();
    sources = new Map();
    callStack = new Set();
    refStack = new Set();
    foundException = false;
    lastTry = null;
    methods = [];
    lastFn = null;
    parentFn = null;
    inCatchBody = false;
    inInlineBuiltinArg = false;
}
export const Globals = new _Globals();
