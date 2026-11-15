import { describe, expect, it } from "@effect/vitest";

import { initialModel, Message, update } from "../src/client/home/index.js";
import { pageTitle } from "../src/features/home/copy.js";

describe("home shell", () => {
  it("names the page Hypertask Help", () => {
    expect(pageTitle).toBe("Hypertask Help");
  });

  it("stays ready", () => {
    expect(initialModel.ready).toBe(true);
    expect(update(initialModel, Message.Ready()).model.ready).toBe(true);
  });
});
