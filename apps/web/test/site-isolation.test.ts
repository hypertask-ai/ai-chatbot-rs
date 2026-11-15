import { describe, expect, it } from "@effect/vitest";

import {
  separateTestStoreBindingNames,
  workerBindingNames,
} from "../src/server/site-bindings.js";
import {
  assertTestAddressIsolated,
  liveBindingNamesOnTestAddress,
} from "../src/server/site-isolation.js";

const testBasePath = "/ratstack";

describe("the test address cannot reach live data or the real AI", () => {
  it("declares no live binding while the site can mount under the test address", () => {
    expect(
      liveBindingNamesOnTestAddress(
        testBasePath,
        workerBindingNames,
        separateTestStoreBindingNames
      )
    ).toStrictEqual([]);
  });

  it("reaches every binding when the site mounts at the origin root", () => {
    expect(liveBindingNamesOnTestAddress("", ["DB", "AI"], [])).toStrictEqual(
      []
    );
  });

  it("refuses a live binding under the test address", () => {
    expect(() => {
      assertTestAddressIsolated(testBasePath, ["DB"], []);
    }).toThrow("separate test store");
    expect(
      liveBindingNamesOnTestAddress(testBasePath, ["DB", "AI"], [])
    ).toStrictEqual(["DB", "AI"]);
  });

  it("allows a binding named as the separate test store", () => {
    expect(
      liveBindingNamesOnTestAddress(testBasePath, ["DB"], ["DB"])
    ).toStrictEqual([]);
  });
});
