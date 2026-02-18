import { describe, expect } from "./lib";

let factoryCalls = 0;

class ThrowingBox {
  fail(): void {
    abort("box-fail");
  }
}

function createThrowingBox(): ThrowingBox {
  factoryCalls++;
  return new ThrowingBox();
}

describe("Should evaluate method receiver only once", () => {
  try {
    createThrowingBox().fail();
  } catch (e) {
    expect(e.toString()).toBe("abort: box-fail");
  }

  expect(factoryCalls.toString()).toBe("1");
});

class StaticThrower {
  static crash(): void {
    abort("static-crash");
  }

  crash(): string {
    return "instance-ok";
  }
}

class Noise {
  crash(): string {
    return "noise";
  }
}

class Boom {
  crash(): void {
    abort("boom");
  }
}

describe("Should keep static and instance methods separate", () => {
  expect(new StaticThrower().crash()).toBe("instance-ok");

  try {
    StaticThrower.crash();
  } catch (e) {
    expect(e.toString()).toBe("abort: static-crash");
  }
});

describe("Should use receiver type when selecting rewritten methods", () => {
  const noise = new Noise();
  expect(noise.crash()).toBe("noise");

  try {
    new Boom().crash();
  } catch (e) {
    expect(e.toString()).toBe("abort: boom");
  }
});
