import { describe, expect, it } from "@effect/vitest";

import {
  isTrustedParentOrigin,
  trustedParentOrigin,
} from "../src/widget/parent-origin.js";

const widgetOrigin = "https://help.hypertask.ai";

describe("the widget parent origin owner", () => {
  it("accepts the origins the frame ancestors list allows plus its own origin", () => {
    expect(isTrustedParentOrigin("https://hypertask.ai", widgetOrigin)).toBe(
      true
    );
    expect(
      isTrustedParentOrigin("https://www.hypertask.ai", widgetOrigin)
    ).toBe(true);
    expect(
      isTrustedParentOrigin("https://docs.hypertask.ai", widgetOrigin)
    ).toBe(true);
    expect(isTrustedParentOrigin(widgetOrigin, widgetOrigin)).toBe(true);
  });

  it("refuses every other origin", () => {
    expect(isTrustedParentOrigin("https://evil.example", widgetOrigin)).toBe(
      false
    );
    expect(
      isTrustedParentOrigin(
        "https://docs.hypertask.ai.evil.example",
        widgetOrigin
      )
    ).toBe(false);
    expect(
      isTrustedParentOrigin("http://docs.hypertask.ai", widgetOrigin)
    ).toBe(false);
    expect(
      isTrustedParentOrigin("https://docs.hypertask.ai:8443", widgetOrigin)
    ).toBe(false);
    expect(isTrustedParentOrigin("null", widgetOrigin)).toBe(false);
    expect(isTrustedParentOrigin("", widgetOrigin)).toBe(false);
    expect(
      isTrustedParentOrigin(
        "https://help.hypertask.ai.evil.example",
        widgetOrigin
      )
    ).toBe(false);
  });

  it("resolves the first trusted candidate and refuses a list of strangers", () => {
    expect(
      trustedParentOrigin(
        ["https://evil.example", "https://docs.hypertask.ai"],
        widgetOrigin
      )
    ).toBe("https://docs.hypertask.ai");
    expect(trustedParentOrigin([widgetOrigin], widgetOrigin)).toBe(
      widgetOrigin
    );
    expect(
      trustedParentOrigin(["https://evil.example"], widgetOrigin)
    ).toBeUndefined();
    expect(
      trustedParentOrigin(["null", "", null, undefined], widgetOrigin)
    ).toBeUndefined();
  });
});
