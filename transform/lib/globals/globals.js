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
    inlineBuiltinWrapper = null;
    stmtStack = [];
    reset() {
        this.sources = new Map();
        this.callStack = new Set();
        this.refStack = new Set();
        this.foundException = false;
        this.lastTry = null;
        this.methods = [];
        this.lastFn = null;
        this.parentFn = null;
        this.inCatchBody = false;
        this.inInlineBuiltinArg = false;
        this.inlineBuiltinWrapper = null;
        this.stmtStack = [];
    }
}
export const Globals = new _Globals();
