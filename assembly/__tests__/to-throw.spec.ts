import { describe, expect as expectValue } from "./lib";
import { Exception, ExceptionType } from "../index";
import { importedFunction } from "./imports";

interface ThrowSubject {
  run(): void;
}

function expect(subject: ThrowSubject): ThrowExpectation {
  return new ThrowExpectation(subject);
}

class ThrowExpectation {
  constructor(private readonly subject: ThrowSubject) {}

  toThrow(expected: string | null = null): void {
    let threw = false;

    try {
      this.subject.run();
    } catch (e) {
      threw = true;
      const received = (e as Exception).toString();

      if (expected != null && received != expected) {
        console.log("  (expected throw) -> " + expected);
        console.log("  (received throw) -> " + received);
        process.exit(1);
      }

      if (expected != null) {
        console.log('  throws "' + received + '"');
      } else {
        console.log('  threw "' + received + '"');
      }
    }

    if (!threw) {
      console.log("  (expected throw) -> any exception");
      console.log("  (received throw) -> no exception");
      process.exit(1);
    }
  }
}

enum ThrowCaseKind {
  AbortInline,
  AbortInlineExact,
  AbortHelper,
  AbortImported,
  Unreachable,
  Primitive,
  Managed,
  TypedError,
  RethrowCaptured,
  Stdlib,
}

class ThrowMatcherError extends Error {
  constructor(message: string) {
    super(message);
  }
}

class ThrowMatcherValue {
  constructor(
    public label: string,
    public count: i32,
  ) {}

  toString(): string {
    return this.label + ":" + this.count.toString();
  }
}

function abortNow(): void {
  abort("from helper");
}

function throwPrimitive(): void {
  throw 123;
}

function throwManaged(): void {
  throw new ThrowMatcherValue("managed", 9);
}

function throwTypedError(): void {
  throw new ThrowMatcherError("typed boom");
}

class ThrowCase implements ThrowSubject {
  constructor(private readonly kind: ThrowCaseKind) {}

  run(): void {
    switch (this.kind) {
      case ThrowCaseKind.AbortInline:
        abort("inline abort");
        return;
      case ThrowCaseKind.AbortInlineExact:
        abort("inline abort exact");
        return;
      case ThrowCaseKind.AbortHelper:
        abortNow();
        return;
      case ThrowCaseKind.AbortImported:
        importedFunction();
        return;
      case ThrowCaseKind.Unreachable:
        unreachable();
        return;
      case ThrowCaseKind.Primitive:
        throwPrimitive();
        return;
      case ThrowCaseKind.Managed:
        throwManaged();
        return;
      case ThrowCaseKind.TypedError:
        throwTypedError();
        return;
      case ThrowCaseKind.RethrowCaptured:
        try {
          throw new ThrowMatcherError("rethrow me");
        } catch (e) {
          throw (e as Exception).clone();
        }
        return;
      case ThrowCaseKind.Stdlib: {
        const values = new Array<i32>();
        values.pop();
        return;
      }
    }
  }
}

function catchTypedError(): string {
  try {
    throwTypedError();
    return "missed";
  } catch (e) {
    const err = e as Exception;
    expectValue(err.type.toString()).toBe(ExceptionType.Throw.toString());
    expectValue(err.is<ThrowMatcherError>().toString()).toBe("true");
    return err.toString();
  }

  return "missed";
}

describe("Should support toThrow for aborts without an expected message", () => {
  expect(new ThrowCase(ThrowCaseKind.AbortInline)).toThrow();
});

describe("Should support toThrow for aborts with an exact message", () => {
  expect(new ThrowCase(ThrowCaseKind.AbortInlineExact)).toThrow("abort: inline abort exact");
});

describe("Should support toThrow for named helper functions", () => {
  expect(new ThrowCase(ThrowCaseKind.AbortHelper)).toThrow("abort: from helper");
});

describe("Should support toThrow for imported helper functions", () => {
  expect(new ThrowCase(ThrowCaseKind.AbortImported)).toThrow("abort: Aborted from importedFunction");
});

describe("Should support toThrow for unreachable traps", () => {
  expect(new ThrowCase(ThrowCaseKind.Unreachable)).toThrow("unreachable");
});

describe("Should support toThrow for primitive throw expressions", () => {
  expect(new ThrowCase(ThrowCaseKind.Primitive)).toThrow("Error: 123");
});

describe("Should support toThrow for managed object throw expressions", () => {
  expect(new ThrowCase(ThrowCaseKind.Managed)).toThrow("Error: managed:9");
});

describe("Should support toThrow for typed Error instances", () => {
  expect(new ThrowCase(ThrowCaseKind.TypedError)).toThrow("Error: Error: typed boom");
});

describe("Should support toThrow for rethrown captured Exceptions", () => {
  expect(new ThrowCase(ThrowCaseKind.RethrowCaptured)).toThrow("Error: Error: rethrow me");
});

describe("Should support toThrow for stdlib throws", () => {
  expect(new ThrowCase(ThrowCaseKind.Stdlib)).toThrow("Error: RangeError: Array is empty");
});

describe("Should still expose typed throw metadata after toThrow-style flows", () => {
  expectValue(catchTypedError()).toBe("Error: Error: typed boom");
});
