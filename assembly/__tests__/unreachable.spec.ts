// import { __UnreachableState } from "../types/unreachable";
import { describe, expect } from "./lib";

describe("Should handle immediate unreachable call", () => {
  try {
    unreachable();
  } catch (e) {
    expect(e.toString()).toBe("unreachable");
  }
});

describe("Should execute finally block", () => {
  let finallyExecuted = false;

  try {
    unreachable();
  } catch (e) {
    expect(e.toString()).toBe("unreachable");
  } finally {
    finallyExecuted = true;
  }

  expect(finallyExecuted.toString()).toBe("true");
});

describe("Should catch unreachable inside catch block", () => {
  try {
    try {
      abort("should not catch this one");
    } catch (e) {
      unreachable();
    }
  } catch (e) {
    expect(e.toString()).toBe("unreachable");
  }
});

describe("Should handle multiple unreachable calls", () => {
  try {
    unreachable();
  } catch (e) {
    expect(e.toString()).toBe("unreachable");
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
      unreachable();
    } catch (e) {
      expect(e.toString()).toBe("unreachable");
      unreachable();
    }
  } catch (e) {
    expect(e.toString()).toBe("unreachable");
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
