import { describe, expect } from "./lib";
import { Exception, ExceptionType } from "../index";

class CountingException extends Exception {
  static rethrowCalls: i32 = 0;
  static tryRethrowCalls: i32 = 0;

  constructor() {
    super(ExceptionType.Throw);
  }

  static reset(): void {
    CountingException.rethrowCalls = 0;
    CountingException.tryRethrowCalls = 0;
  }

  rethrow(): void {
    CountingException.rethrowCalls++;
  }

  __try_rethrow(): void {
    CountingException.tryRethrowCalls++;
  }
}

function throwTypedException(err: Exception): void {
  throw err;
}

function throwTypedSubclass(err: CountingException): void {
  throw err;
}

function throwAssertedException(): void {
  const err = new CountingException() as Exception;
  throw err;
}

describe("Should keep direct Exception.rethrow() on the runtime path", () => {
  CountingException.reset();

  const err: Exception = new CountingException();
  err.rethrow();

  expect(CountingException.rethrowCalls.toString()).toBe("1");
  expect(CountingException.tryRethrowCalls.toString()).toBe("0");
});

describe("Should alias Exception-typed local identifier throws to rethrow()", () => {
  CountingException.reset();

  const err: Exception = new CountingException();
  throw err;

  expect(CountingException.rethrowCalls.toString()).toBe("1");
  expect(CountingException.tryRethrowCalls.toString()).toBe("0");
});

describe("Should alias subclass-typed local identifier throws to rethrow()", () => {
  CountingException.reset();

  const err: CountingException = new CountingException();
  throw err;

  expect(CountingException.rethrowCalls.toString()).toBe("1");
  expect(CountingException.tryRethrowCalls.toString()).toBe("0");
});

describe("Should alias inferred Exception subclass throws to rethrow()", () => {
  CountingException.reset();

  const err = new CountingException();
  throw err;

  expect(CountingException.rethrowCalls.toString()).toBe("1");
  expect(CountingException.tryRethrowCalls.toString()).toBe("0");
});

describe("Should alias asserted Exception throws to rethrow()", () => {
  CountingException.reset();

  throwAssertedException();

  expect(CountingException.rethrowCalls.toString()).toBe("1");
  expect(CountingException.tryRethrowCalls.toString()).toBe("0");
});

describe("Should alias Exception-typed parameter throws to rethrow()", () => {
  CountingException.reset();

  throwTypedException(new CountingException());

  expect(CountingException.rethrowCalls.toString()).toBe("1");
  expect(CountingException.tryRethrowCalls.toString()).toBe("0");
});

describe("Should alias Exception subclass parameter throws to rethrow()", () => {
  CountingException.reset();

  throwTypedSubclass(new CountingException());

  expect(CountingException.rethrowCalls.toString()).toBe("1");
  expect(CountingException.tryRethrowCalls.toString()).toBe("0");
});
