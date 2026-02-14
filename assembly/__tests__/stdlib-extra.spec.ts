import { Exception, ExceptionType } from "../index";
import { describe, expect } from "./lib";

function assertThrow(err: Exception, message: string): void {
  expect(err.type.toString()).toBe(ExceptionType.Throw.toString());
  expect(err.message!).toBe(message);
  expect(err.toString()).toBe("Error: " + message);
}

describe("Should catch Array.at positive out-of-range", () => {
  let threw = false;
  const arr = [1, 2, 3];
  try {
    arr.at(99);
  } catch (e) {
    threw = true;
    assertThrow(e as Exception, "RangeError: Index out of range");
  }
  expect(threw.toString()).toBe("true");
});

describe("Should catch Array.at negative out-of-range", () => {
  let threw = false;
  const arr = [1, 2, 3];
  try {
    arr.at(-99);
  } catch (e) {
    threw = true;
    assertThrow(e as Exception, "RangeError: Index out of range");
  }
  expect(threw.toString()).toBe("true");
});

describe("Should catch Int8Array.at out-of-range", () => {
  let threw = false;
  const arr = new Int8Array(1);
  try {
    arr.at(99);
  } catch (e) {
    threw = true;
    assertThrow(e as Exception, "RangeError: Index out of range");
  }
  expect(threw.toString()).toBe("true");
});

describe("Should catch Uint32Array.at negative out-of-range", () => {
  let threw = false;
  const arr = new Uint32Array(1);
  try {
    arr.at(-99);
  } catch (e) {
    threw = true;
    assertThrow(e as Exception, "RangeError: Index out of range");
  }
  expect(threw.toString()).toBe("true");
});

describe("Should catch DataView.getInt16 out-of-range", () => {
  let threw = false;
  const view = new DataView(new ArrayBuffer(1));
  try {
    view.getInt16(0);
  } catch (e) {
    threw = true;
    assertThrow(e as Exception, "RangeError: Index out of range");
  }
  expect(threw.toString()).toBe("true");
});

describe("Should catch DataView.setUint32 out-of-range", () => {
  let threw = false;
  const view = new DataView(new ArrayBuffer(2));
  try {
    view.setUint32(0, 1);
  } catch (e) {
    threw = true;
    assertThrow(e as Exception, "RangeError: Index out of range");
  }
  expect(threw.toString()).toBe("true");
});

describe("Should catch decodeURI malformed input", () => {
  let threw = false;
  try {
    decodeURI("%");
  } catch (e) {
    threw = true;
    assertThrow(e as Exception, "URIError: URI malformed");
  }
  expect(threw.toString()).toBe("true");
});

describe("Should catch Date.parse invalid input", () => {
  let threw = false;
  try {
    Date.parse("");
  } catch (e) {
    threw = true;
    assertThrow(e as Exception, "RangeError: Invalid Date");
  }
  expect(threw.toString()).toBe("true");
});

describe("Should catch i32.toString invalid radix", () => {
  let threw = false;
  try {
    const value: i32 = 42;
    value.toString(1);
  } catch (e) {
    threw = true;
    assertThrow(e as Exception, "RangeError: toString() radix argument must be between 2 and 36");
  }
  expect(threw.toString()).toBe("true");
});

describe("Should catch u64.toString invalid radix", () => {
  let threw = false;
  try {
    const value: u64 = 42;
    value.toString(37);
  } catch (e) {
    threw = true;
    assertThrow(e as Exception, "RangeError: toString() radix argument must be between 2 and 36");
  }
  expect(threw.toString()).toBe("true");
});
