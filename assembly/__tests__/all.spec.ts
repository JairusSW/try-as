import { describe, expect } from "./lib";
import { deepImportedFunction, importedFunction } from "./imports";
import { Exception, ExceptionType } from "../index";

class MyError extends Error {
  constructor(message: string) {
    super(message);
  }
}

class PlainThing {
  constructor(
    public label: string,
    public count: i32,
  ) {}

  toString(): string {
    return this.label + ":" + this.count.toString();
  }
}

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

describe("Should handle thrown Error with metadata", () => {
  try {
    throw new Error("boom");
  } catch (e) {
    const err = e as Exception;
    expect(err.type.toString()).toBe(ExceptionType.Throw.toString());
    expect(err.message!).toBe("boom");
    expect(err.toString()).toBe("Error: boom");
  }
});

describe("Should catch thrown string expression", () => {
  try {
    const msg = "boom-string";
    throw msg;
  } catch (e) {
    const err = e as Exception;
    expect(err.type.toString()).toBe(ExceptionType.Throw.toString());
    expect(err.message!).toBe("boom-string");
    expect(err.toString()).toBe("Error: boom-string");
  }
});

describe("Should preserve primitive payload when throwing expression", () => {
  try {
    throw 21 + 21;
  } catch (e) {
    const err = e as Exception;
    expect(err.type.toString()).toBe(ExceptionType.Throw.toString());
    expect(err.is<i32>().toString()).toBe("true");
    expect(err.as<i32>().toString()).toBe("42");
    expect(err.toString()).toBe("Error: 42");
  }
});

describe("Should preserve thrown object type info", () => {
  try {
    throw new MyError("typed");
  } catch (e) {
    const err = e as Exception;
    expect(err.is<MyError>().toString()).toBe("true");
    const typed = err.as<MyError>();
    expect((typed != null).toString()).toBe("true");
    if (typed) {
      expect(typed.message).toBe("typed");
    }
  }
});

describe("Should preserve thrown non-Error managed object type info", () => {
  try {
    throw new PlainThing("plain", 7);
  } catch (e) {
    const err = e as Exception;
    expect(err.type.toString()).toBe(ExceptionType.Throw.toString());
    expect(err.is<PlainThing>().toString()).toBe("true");
    const typed = err.as<PlainThing>();
    expect((typed != null).toString()).toBe("true");
    if (typed) {
      expect(typed.label).toBe("plain");
      expect(typed.count.toString()).toBe("7");
    }
    expect(err.message!).toBe("plain:7");
    expect(err.toString()).toBe("Error: plain:7");
  }
});

describe("Should preserve thrown identifier type info", () => {
  const typedErr = new MyError("typed-identifier");
  try {
    throw typedErr;
  } catch (e) {
    const err = e as Exception;
    expect(err.type.toString()).toBe(ExceptionType.Throw.toString());
    expect(err.is<MyError>().toString()).toBe("true");
    const typed = err.as<MyError>();
    expect((typed != null).toString()).toBe("true");
    if (typed) {
      expect(typed.message).toBe("typed-identifier");
    }
  }
});

describe("Should preserve bool payload when throwing expression", () => {
  try {
    throw true;
  } catch (e) {
    const err = e as Exception;
    expect(err.type.toString()).toBe(ExceptionType.Throw.toString());
    expect(err.is<bool>().toString()).toBe("true");
    expect(err.as<bool>().toString()).toBe("true");
    expect(err.toString()).toBe("Error: true");
  }
});

describe("Should preserve f64 payload when throwing expression", () => {
  try {
    throw 1.5;
  } catch (e) {
    const err = e as Exception;
    expect(err.type.toString()).toBe(ExceptionType.Throw.toString());
    expect(err.is<f64>().toString()).toBe("true");
    expect(err.as<f64>().toString()).toBe("1.5");
    expect(err.toString()).toBe("Error: 1.5");
  }
});

describe("Should preserve throw identity when rethrowing caught Exception", () => {
  try {
    try {
      throw new MyError("rethrown-typed");
    } catch (e) {
      throw e;
    }
  } catch (e) {
    const err = e as Exception;
    expect(err.type.toString()).toBe(ExceptionType.Throw.toString());
    expect(err.is<MyError>().toString()).toBe("true");
    const typed = err.as<MyError>();
    expect((typed != null).toString()).toBe("true");
    if (typed) {
      expect(typed.message).toBe("rethrown-typed");
    }
  }
});

describe("Should preserve throw identity when calling Exception.rethrow()", () => {
  try {
    try {
      throw new MyError("rethrown-via-api");
    } catch (e) {
      const err = e as Exception;
      err.rethrow();
    }
  } catch (e) {
    const err = e as Exception;
    expect(err.type.toString()).toBe(ExceptionType.Throw.toString());
    expect(err.is<MyError>().toString()).toBe("true");
    const typed = err.as<MyError>();
    expect((typed != null).toString()).toBe("true");
    if (typed) {
      expect(typed.message).toBe("rethrown-via-api");
    }
  }
});

describe("Should preserve primitive payload when rethrowing caught Exception", () => {
  try {
    try {
      throw 99;
    } catch (e) {
      throw e;
    }
  } catch (e) {
    const err = e as Exception;
    expect(err.type.toString()).toBe(ExceptionType.Throw.toString());
    expect(err.is<i32>().toString()).toBe("true");
    expect(err.as<i32>().toString()).toBe("99");
    expect(err.toString()).toBe("Error: 99");
  }
});

describe("Should preserve primitive payload when calling Exception.rethrow()", () => {
  try {
    try {
      throw 123;
    } catch (e) {
      const err = e as Exception;
      err.rethrow();
    }
  } catch (e) {
    const err = e as Exception;
    expect(err.type.toString()).toBe(ExceptionType.Throw.toString());
    expect(err.is<i32>().toString()).toBe("true");
    expect(err.as<i32>().toString()).toBe("123");
    expect(err.toString()).toBe("Error: 123");
  }
});

describe("Should keep cloned exception stable across later throws", () => {
  let cloned: Exception | null = null;

  try {
    throw new MyError("first");
  } catch (e) {
    cloned = (e as Exception).clone();
  }

  try {
    throw new Error("second");
  } catch (_) {}

  expect((cloned != null).toString()).toBe("true");
  if (cloned) {
    expect(cloned.is<MyError>().toString()).toBe("true");
    const typed = cloned.as<MyError>();
    expect((typed != null).toString()).toBe("true");
    if (typed) {
      expect(typed.message).toBe("first");
    }
  }
});

describe("Should catch stdlib Map.get missing key", () => {
  const map = new Map<string, string>();

  try {
    map.get("missing");
  } catch (e) {
    const err = e as Exception;
    expect(err.type.toString()).toBe(ExceptionType.Throw.toString());
    expect(err.message!).toBe("Key does not exist");
    expect(err.toString()).toBe("Error: Key does not exist");
  }
});

describe("Should catch stdlib Array.pop on empty array", () => {
  const arr = new Array<i32>();

  try {
    arr.pop();
  } catch (e) {
    const err = e as Exception;
    expect(err.type.toString()).toBe(ExceptionType.Throw.toString());
    expect(err.message!).toBe("RangeError: Array is empty");
    expect(err.toString()).toBe("Error: RangeError: Array is empty");
  }
});

describe("Should catch stdlib String.at out of range", () => {
  try {
    "abc".at(10);
  } catch (e) {
    const err = e as Exception;
    expect(err.type.toString()).toBe(ExceptionType.Throw.toString());
    expect(err.message!).toBe("RangeError: Index out of range");
    expect(err.toString()).toBe("Error: RangeError: Index out of range");
  }
});

describe("Should catch stdlib decodeURIComponent malformed input", () => {
  try {
    decodeURIComponent("%");
  } catch (e) {
    const err = e as Exception;
    expect(err.type.toString()).toBe(ExceptionType.Throw.toString());
    expect(err.message!).toBe("URIError: URI malformed");
    expect(err.toString()).toBe("Error: URIError: URI malformed");
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
