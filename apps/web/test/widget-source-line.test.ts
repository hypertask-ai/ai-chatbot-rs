import { describe, expect, it } from "@effect/vitest";

import {
  citedArticle,
  helpArticleUrl,
  sourceLineFor,
  sourceLinePrefix,
} from "../src/widget/source-line.js";

type SourceRow = Readonly<{
  expected: Readonly<{ slug: string; title: string }> | undefined;
  label: string;
  name: string;
  sources: readonly { slug: string; title?: string | null }[];
  text: string | null;
}>;

const rows: readonly SourceRow[] = [
  {
    expected: { slug: "connect-claude", title: "Connect Claude" },
    label: "the first cited source that has a slug",
    name: "cited source wins",
    sources: [
      { slug: "connect-claude", title: "Connect Claude" },
      { slug: "invite-team", title: "Invite your team" },
    ],
    text: "See [Invite your team](https://help.hypertask.ai/help/invite-team).",
  },
  {
    expected: { slug: "invite-team", title: "invite-team" },
    label: "a source without a title falls back to its slug",
    name: "source without a title",
    sources: [{ slug: "invite-team", title: "" }],
    text: null,
  },
  {
    expected: { slug: "first-slug", title: "First" },
    label: "a source with an empty slug is skipped",
    name: "empty slug is skipped",
    sources: [
      { slug: "", title: "Nothing" },
      { slug: "first-slug", title: "First" },
    ],
    text: null,
  },
  {
    expected: { slug: "boards-sections", title: "Boards & Sections" },
    label: "a markdown help link uses the link text as the title",
    name: "markdown help link",
    sources: [],
    text: "Read [Boards & Sections](/help/boards-sections) first.",
  },
  {
    expected: { slug: "boards-sections", title: "Boards & Sections" },
    label: "a markdown help link with a full address",
    name: "absolute markdown help link",
    sources: [],
    text: "Read [Boards & Sections](https://help.hypertask.ai/help/boards-sections).",
  },
  {
    expected: { slug: "boards-sections", title: "boards-sections" },
    label: "a bare help address uses the slug as the title",
    name: "bare help address",
    sources: [],
    text: "Visit /help/boards-sections for the steps.",
  },
  {
    expected: undefined,
    label: "an answer with no source and no help link has no line",
    name: "no citation",
    sources: [],
    text: "Just ask me again.",
  },
  {
    expected: undefined,
    label: "an empty answer has no line",
    name: "empty answer",
    sources: [],
    text: "",
  },
  {
    expected: undefined,
    label: "a missing answer has no line",
    name: "missing answer",
    sources: [],
    text: null,
  },
];

describe("the From: article line, read from the old widget", () => {
  it("keeps the old prefix and the old article address", () => {
    expect(sourceLinePrefix).toBe("From: ");
    expect(helpArticleUrl("boards-sections")).toBe(
      "https://help.hypertask.ai/help/boards-sections"
    );
    expect(helpArticleUrl("boards & sections")).toBe(
      "https://help.hypertask.ai/help/boards%20%26%20sections"
    );
  });

  for (const row of rows) {
    it(`picks ${row.label}`, () => {
      expect(citedArticle(row.text, row.sources)).toEqual(row.expected);
    });
  }

  it("builds the line with the From: prefix and the article address", () => {
    const line = sourceLineFor(
      "Read [Boards & Sections](/help/boards-sections).",
      []
    );

    expect(line).toEqual({
      href: "https://help.hypertask.ai/help/boards-sections",
      label: "From: Boards & Sections",
      slug: "boards-sections",
    });
  });

  it("builds no line when the old widget built none", () => {
    expect(sourceLineFor("Just ask me again.", [])).toBeUndefined();
    expect(sourceLineFor(null, [])).toBeUndefined();
  });
});
