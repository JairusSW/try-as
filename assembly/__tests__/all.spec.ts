import { deepImportedFunction, importedFunction } from "./imports";
import { describe, expect } from "./lib";

describe("Should handle immediate abort call", (): void => {
  try {
    abort("This should abort");
  } catch (e) {
    expect(e.toString()).toBe("abort: This should abort");
  }
});

describe("Should execute finally block", () => {
  let finallyExecuted = false;

  try {
    abort("This should abort");
  } catch (e) {
    expect(e.toString()).toBe("abort: This should abort");
  } finally {
    finallyExecuted = true;
  }

  expect(finallyExecuted.toString()).toBe("true");
});

describe("Should catch abort inside catch block", () => {
  try {
    try {
      abort("This should abort");
    } catch (e) {
      abort("Abort from catch block");
    }
  } catch (e) {
    expect(e.toString()).toBe("abort: Abort from catch block");
  }
});

describe("Should handle multiple abort calls", () => {
  try {
    abort("First abort");
  } catch (e) {
    expect(e.toString()).toBe("abort: First abort");
  }

  try {
    abort("Second abort");
  } catch (e) {
    expect(e.toString()).toBe("abort: Second abort");
  }
});

describe("Should handle abort in nested try/catch blocks", () => {
  try {
    try {
      abort("Inner abort");
    } catch (e) {
      expect(e.toString()).toBe("abort: Inner abort");
      abort("Outer abort");
    }
  } catch (e) {
    expect(e.toString()).toBe("abort: Outer abort");
  }
});

describe("Should handle abort in finally block", () => {
  try {
    try {
      abort("Abort in try block");
    } catch (e) {
      expect(e.toString()).toBe("abort: Abort in try block");
    } finally {
      abort("Abort in finally block");
    }
  } catch (e) {
    expect(e.toString()).toBe("abort: Abort in finally block");
  }
});

describe("Should handle no errors and execute finally block with abort", () => {
  try {
    try {
      // No error thrown here
    } finally {
      abort("Abort in finally");
    }
  } catch (e) {
    expect(e.toString()).toBe("abort: Abort in finally");
  }
});

describe("Should handle abort without a message", () => {
  try {
    abort();
  } catch (e) {
    expect(e.toString()).toBe("abort");
  }
});

describe("Should catch abort in nested try block", () => {
  try {
    try {
      abort("Abort inside nested try");
    } catch (e) {
      expect(e.toString()).toBe("abort: Abort inside nested try");
    }
  } catch (e) {
    expect("Final Catch").toBe("abort: This should not execute");
  }
});

describe("Should handle abort from a called function", () => {
  try {
    abortingFunction();
  } catch (e) {
    expect(e.toString()).toBe("abort: Aborted from abortingFunction");
  }
});

describe("Should handle abort from a nested function call", () => {
  try {
    nestedAbortingFunction();
  } catch (e) {
    expect(e.toString()).toBe("abort: Aborted from nestedAbortingFunction");
  }
});

describe("Should handle abort from an imported function", () => {
  try {
    importedFunction();
  } catch (e) {
    expect(e.toString()).toBe("abort: Aborted from importedFunction");
  }
});

describe("Should handle abort from a deeply nested imported function", () => {
  try {
    deepImportedFunction();
  } catch (e) {
    expect(e.toString()).toBe("abort: Aborted from deepImportedFunction");
  }
});

describe("Should abort in finally after successful imported function", () => {
  try {
    try {
      // Simulate successful call to imported function
      expect(true.toString()).toBe("true");
    } finally {
      abort("Abort after imported function");
    }
  } catch (e) {
    expect(e.toString()).toBe("abort: Abort after imported function");
  }
});

function abortingFunction(): void {
  abort("Aborted from abortingFunction");
}

function nestedAbortingFunction(): void {
  try {
    abortingFunction();
  } catch (e) {
    abort("Aborted from nestedAbortingFunction");
  }
}
