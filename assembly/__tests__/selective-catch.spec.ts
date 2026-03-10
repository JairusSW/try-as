import { Exception } from "../index";
import { describe, expect } from "./lib";

describe("Should catch only throw when configured", () => {
  let innerCaught = false;
  let outerCaught = false;

  try {
    // @try-as: throw
    try {
      abort("skip-inner");
    } catch (e) {
      innerCaught = true;
      expect((e as Exception).toString()).toBe("abort: skip-inner");
    }
  } catch (e) {
    outerCaught = true;
    expect((e as Exception).toString()).toBe("abort: skip-inner");
  }

  expect(innerCaught.toString()).toBe("false");
  expect(outerCaught.toString()).toBe("true");
});

describe("Should catch only abort when configured", () => {
  let innerCaught = false;
  let outerCaught = false;

  try {
    // @try-as: abort
    try {
      abort("only-abort");
    } catch (e) {
      innerCaught = true;
      expect((e as Exception).toString()).toBe("abort: only-abort");
    }
  } catch (_) {
    outerCaught = true;
  }

  expect(innerCaught.toString()).toBe("true");
  expect(outerCaught.toString()).toBe("false");
});

describe("Should catch only unreachable when configured", () => {
  let innerCaught = false;
  let outerCaught = false;

  try {
    // @try-as: unreachable
    try {
      unreachable();
    } catch (e) {
      innerCaught = true;
      expect((e as Exception).toString()).toBe("unreachable");
    }
  } catch (_) {
    outerCaught = true;
  }

  expect(innerCaught.toString()).toBe("true");
  expect(outerCaught.toString()).toBe("false");
});

describe("Should let non-selected throw escape to outer catch", () => {
  let innerCaught = false;
  let outerCaught = false;

  try {
    // @try-as: abort,unreachable
    try {
      throw 77;
    } catch (e) {
      innerCaught = true;
      expect((e as Exception).toString()).toBe("Error: 77");
    }
  } catch (e) {
    outerCaught = true;
    const err = e as Exception;
    expect(err.as<i32>().toString()).toBe("77");
  }

  expect(innerCaught.toString()).toBe("false");
  expect(outerCaught.toString()).toBe("true");
});

describe("Should catch multiple selected kinds", () => {
  let innerCaught = false;
  let outerCaught = false;

  try {
    // @try-as: throw,abort
    try {
      throw new Error("selected-throw");
    } catch (e) {
      innerCaught = true;
      expect((e as Exception).message!).toBe("selected-throw");
    }
  } catch (_) {
    outerCaught = true;
  }

  expect(innerCaught.toString()).toBe("true");
  expect(outerCaught.toString()).toBe("false");
});
