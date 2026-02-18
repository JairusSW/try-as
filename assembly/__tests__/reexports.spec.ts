import { describe, expect } from "./lib";
import { topAbort, TopNS } from "./reexports/top";
import { starAbort } from "./reexports/star-top";

describe("Should catch function through named re-export chain", () => {
  try {
    topAbort();
  } catch (e) {
    expect(e.toString()).toBe("abort: Aborted from sourceAbort");
  }
});

describe("Should catch namespace function through named re-export chain", () => {
  try {
    TopNS.nestedAbort();
  } catch (e) {
    expect(e.toString()).toBe("abort: Aborted from SourceNS.nestedAbort");
  }
});

describe("Should catch function through export-star chain", () => {
  try {
    starAbort();
  } catch (e) {
    expect(e.toString()).toBe("abort: Aborted from starAbort");
  }
});
