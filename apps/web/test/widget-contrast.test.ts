import { describe, expect, it } from "@effect/vitest";

import { widgetTheme } from "../src/widget/theme.js";

import css from "../src/features/widget/widget.css?raw";

const rule = (selector: string): string => {
  const escaped = selector.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "u").exec(css);

  expect(match, `missing ${selector}`).not.toBeNull();

  return match?.at(1) ?? "";
};

describe("settled chat bubbles", () => {
  it("stay at full opacity and keep their text colour", () => {
    const message = rule("[data-widget-document] .message");
    const user = rule("[data-widget-document] .message.user");

    const answer = rule(
      "[data-widget-document] .message.bot,\n[data-widget-document] .message.admin"
    );

    expect(message).toMatch(/opacity:\s*1/u);
    expect(message).toMatch(/color:\s*#f4f4f7/u);
    expect(user).toMatch(/color:\s*#f4f4f7/u);
    expect(user).not.toMatch(/opacity/u);
    expect(answer).toMatch(/color:\s*#a1a1aa/u);
    expect(answer).not.toMatch(/opacity/u);
    expect(widgetTheme.htInk).toBe("#f4f4f7");
  });

  it("animate only position, never opacity", () => {
    const keyframes = /@keyframes messageIn \{(?<frames>[\s\S]*?)\n\}/u.exec(
      css
    );

    expect(keyframes).not.toBeNull();
    expect(keyframes?.groups?.frames ?? "").toMatch(/translateY/u);
    expect(keyframes?.groups?.frames ?? "").not.toMatch(/opacity/u);
    expect(css).not.toMatch(/\.message\.streaming\s*\{[^}]*opacity/u);
  });

  it("drop the entrance animation when the visitor asks for reduced motion", () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\[data-widget-document\] \.message \{\s*animation: none;\s*\}\s*\}/u
    );
  });
});
