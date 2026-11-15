import { describe, expect, it } from "@effect/vitest";

import { profileContextBlock, visitorProfileFromRow } from "../src/index.js";

describe("visitorProfileFromRow", () => {
  it("reads a conversations row into the profile the prompt takes", () => {
    const profile = visitorProfileFromRow({
      has_hypertask_account: "paid",
      visitor_email: "ada@example.test",
      visitor_name: "Ada",
    });

    expect(profile).toEqual({
      account: "paid",
      email: "ada@example.test",
      name: "Ada",
    });
  });

  it("reads an empty field and an unknown account as absent", () => {
    const profile = visitorProfileFromRow({
      has_hypertask_account: "unknown",
      visitor_email: "",
      visitor_name: null,
    });

    expect(profile).toEqual({
      account: "unknown",
      email: undefined,
      name: undefined,
    });
    expect(profileContextBlock(profile)).toBeNull();
  });

  it("keeps the visitor line the old help site wrote for a full row", () => {
    const profile = visitorProfileFromRow({
      has_hypertask_account: "free",
      visitor_email: "ada@example.test",
      visitor_name: "Ada",
    });

    expect(profileContextBlock(profile)).toBe(
      "Visitor: Ada <ada@example.test> (free account)"
    );
  });
});
