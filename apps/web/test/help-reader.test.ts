import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";
import {
  Command,
  Subscription,
  click,
  expect as sceneExpect,
  given,
  scene,
  selector,
} from "foldkit/scene";

import { chatArticleSlugOf } from "../src/client/help/chat-link.js";
import { LoadHelpArticle } from "../src/client/help/command.js";
import type {
  HelpArticlePageValue,
  HelpPageValue,
} from "../src/client/help/index.js";
import {
  Message,
  ReaderPhase,
  initialModel,
} from "../src/client/help/index.js";
import type { ReaderPhaseValue } from "../src/client/help/index.js";
import { helpArticleSlugOf } from "../src/client/help/reader-link.js";
import { readerHidesLibrary, readerStep } from "../src/client/help/reader.js";
import { update } from "../src/client/help/update.js";
import { view } from "../src/features/help/index.js";

const origin = "https://help.hypertask.ai";

const link = (href: string | null, target: string | null = null) => ({
  href,
  target,
});

const article: HelpArticlePageValue = {
  category: "cat-1",
  excerpt: "Connect Claude, Codex or Cursor over MCP.",
  html: "<p>Open the board, then connect the agent.</p><h2>Steps</h2><p>Done.</p>",
  plansHtml: "",
  slug: "docs-connect-an-agent",
  title: "Connect an Agent",
};

const otherArticle: HelpArticlePageValue = {
  ...article,
  slug: "docs-features-board-settings",
  title: "Board Settings",
};

const home: HelpPageValue = {
  articles: [
    {
      category: "Agents",
      excerpt: "Connect Claude, Codex or Cursor over MCP.",
      slug: "docs-connect-an-agent",
      title: "Connect an Agent",
    },
    {
      category: "Boards & tickets",
      excerpt: "Sections, labels, views and filters.",
      slug: "docs-features-board-settings",
      title: "Board Settings",
    },
  ],
  page: "home",
};

const closed = ReaderPhase.Closed();

const loading = (slug: string, wide: boolean): ReaderPhaseValue =>
  ReaderPhase.Loading({ slug, wide });

const opened = (wide: boolean): ReaderPhaseValue =>
  ReaderPhase.Open({ article, wide });

interface StepRow {
  readonly commands: number;
  readonly event: Parameters<typeof readerStep>[1];
  readonly expected: ReaderPhaseValue;
  readonly name: string;
  readonly phase: ReaderPhaseValue;
}

const stepRows: readonly StepRow[] = [
  {
    commands: 1,
    event: Message.ReaderOpened({ slug: article.slug, wide: true }),
    expected: loading(article.slug, true),
    name: "a click on a card starts the read",
    phase: closed,
  },
  {
    commands: 1,
    event: Message.ReaderOpened({ slug: article.slug, wide: false }),
    expected: loading(article.slug, false),
    name: "a click on a narrow screen starts the same read",
    phase: closed,
  },
  {
    commands: 0,
    event: Message.ReaderLoaded({ article, slug: article.slug }),
    expected: opened(true),
    name: "the answer fills the pane",
    phase: loading(article.slug, true),
  },
  {
    commands: 0,
    event: Message.ReaderFailed({ slug: article.slug }),
    expected: ReaderPhase.Failed({ wide: true }),
    name: "a failed read shows the error line",
    phase: loading(article.slug, true),
  },
  {
    commands: 0,
    event: Message.ReaderLoaded({
      article: otherArticle,
      slug: otherArticle.slug,
    }),
    expected: loading(article.slug, true),
    name: "an answer for another article is dropped",
    phase: loading(article.slug, true),
  },
  {
    commands: 0,
    event: Message.ReaderLoaded({ article, slug: article.slug }),
    expected: closed,
    name: "an answer that lands after the pane closed is dropped",
    phase: closed,
  },
  {
    commands: 1,
    event: Message.ReaderOpened({ slug: article.slug, wide: true }),
    expected: loading(article.slug, true),
    name: "the next click reads the article again after an error",
    phase: ReaderPhase.Failed({ wide: true }),
  },
  {
    commands: 1,
    event: Message.ReaderOpened({ slug: article.slug, wide: true }),
    expected: loading(article.slug, true),
    name: "clicking the open article reads it again",
    phase: opened(true),
  },
  {
    commands: 0,
    event: Message.ReaderClosed(),
    expected: closed,
    name: "the back button closes the pane",
    phase: opened(true),
  },
  {
    commands: 0,
    event: Message.ReaderClosed(),
    expected: closed,
    name: "Escape closes the pane while the article is still loading",
    phase: loading(article.slug, true),
  },
  {
    commands: 0,
    event: Message.ReaderClosed(),
    expected: closed,
    name: "Escape does nothing while the pane is closed",
    phase: closed,
  },
  {
    commands: 0,
    event: Message.ReaderViewportChanged({ wide: false }),
    expected: opened(false),
    name: "a narrow viewport brings the library back behind the pane",
    phase: opened(true),
  },
  {
    commands: 0,
    event: Message.ReaderViewportChanged({ wide: true }),
    expected: opened(true),
    name: "a wide viewport hides the library behind the pane",
    phase: opened(false),
  },
  {
    commands: 0,
    event: Message.ReaderViewportChanged({ wide: true }),
    expected: closed,
    name: "a resize while the pane is closed changes nothing",
    phase: closed,
  },
];

describe("the in page reader, one row of the old script at a time", () => {
  for (const row of stepRows) {
    it(`moves on ${row.name}`, () => {
      const step = readerStep(row.phase, row.event);

      expect(step.phase).toEqual(row.expected);
      expect(step.reads ?? []).toHaveLength(row.commands);
    });
  }

  it("keeps the same phase object when Escape changes nothing", () => {
    expect(readerStep(closed, Message.ReaderClosed()).phase).toBe(closed);
  });

  it("asks for the article it was opened with", () => {
    expect(
      readerStep(
        closed,
        Message.ReaderOpened({ slug: article.slug, wide: true })
      ).reads
    ).toEqual([article.slug]);
  });

  it("hides the library only while the pane is open on a wide screen", () => {
    expect(readerHidesLibrary(closed)).toBe(false);
    expect(readerHidesLibrary(loading(article.slug, true))).toBe(true);
    expect(readerHidesLibrary(loading(article.slug, false))).toBe(false);
    expect(readerHidesLibrary(opened(true))).toBe(true);
    expect(readerHidesLibrary(ReaderPhase.Failed({ wide: false }))).toBe(false);
  });
});

describe("what the old page counted as an article link", () => {
  const rows: readonly (readonly [
    string,
    string | null,
    string | null,
    string | null,
  ])[] = [
    ["a card on the page", "/help/pricing-plans", null, "pricing-plans"],
    [
      "a link with a trailing slash",
      "/help/pricing-plans/",
      null,
      "pricing-plans",
    ],
    [
      "a full same origin address",
      `${origin}/help/pricing-plans`,
      null,
      "pricing-plans",
    ],
    [
      "a link with a query",
      "/help/pricing-plans?from=search",
      null,
      "pricing-plans",
    ],
    ["a link with a hash", "/help/pricing-plans#plans", null, "pricing-plans"],
    ["a percent encoded slug", "/help/pricing%2Dplans", null, "pricing-plans"],
    [
      "a search result row",
      "/help/voice-dictation-meets-ai-speak-your-way-to-perfect-comments",
      null,
      "voice-dictation-meets-ai-speak-your-way-to-perfect-comments",
    ],
    ["a link in another tab", "/help/pricing-plans", "_blank", null],
    [
      "a link on another origin",
      "https://hypertask.ai/help/pricing-plans",
      null,
      null,
    ],
    ["the help center itself", "/help", null, null],
    ["two segments", "/help/pricing-plans/extra", null, null],
    ["another path", "/docs/pricing-plans", null, null],
    ["no href", null, null, null],
    ["an empty href", "", null, null],
    ["a broken escape", "/help/%E0%A4%A", null, null],
    ["a mail address", "mailto:help@hypertask.ai", null, null],
  ];

  for (const [name, href, target, slug] of rows) {
    it(`reads ${name}`, () => {
      expect(
        Option.getOrNull(helpArticleSlugOf(link(href, target), origin))
      ).toBe(slug);
    });
  }
});

describe("what the chat hands over", () => {
  const rows: readonly (readonly [string, unknown, string, string | null])[] = [
    [
      "a chat link for an article",
      { slug: "pricing-plans", type: "help-open-article" },
      origin,
      "pricing-plans",
    ],
    [
      "a chat link from another origin",
      { slug: "pricing-plans", type: "help-open-article" },
      "https://hypertask.ai",
      null,
    ],
    [
      "a message of another type",
      { slug: "pricing-plans", type: "chat-widget-close" },
      origin,
      null,
    ],
    ["a message with no slug", { type: "help-open-article" }, origin, null],
    [
      "a message with an empty slug",
      { slug: "", type: "help-open-article" },
      origin,
      null,
    ],
    [
      "a message with a number slug",
      { slug: 7, type: "help-open-article" },
      origin,
      null,
    ],
    ["a plain string", "pricing-plans", origin, null],
    ["no data", null, origin, null],
  ];

  for (const [name, data, messageOrigin, slug] of rows) {
    it(`reads ${name}`, () => {
      expect(
        Option.getOrNull(
          chatArticleSlugOf({ data, origin: messageOrigin }, origin)
        )
      ).toBe(slug);
    });
  }
});

const reader = (phase: ReaderPhaseValue) => ({
  ...initialModel(home),
  reader: phase,
});

describe("the reader on the page", () => {
  it("keeps the pane out of sight until an article is opened", () => {
    scene(
      { update, view },
      given(initialModel(home)),
      sceneExpect(selector("#reader")).not.toBeVisible(),
      sceneExpect(selector("#libraryView")).toBeVisible(),
      sceneExpect(selector("#all .article-card")).toHaveAttr(
        "href",
        "/help/docs-connect-an-agent"
      )
    );
  });

  it("shows the loading line beside the list on a wide screen", () => {
    scene(
      { update, view },
      given(reader(loading(article.slug, true))),
      sceneExpect(selector("#reader")).toBeVisible(),
      sceneExpect(selector("#libraryView")).not.toBeVisible(),
      sceneExpect(selector("#readerBody")).toContainText("Loading article")
    );
  });

  it("keeps the list behind the pane on a narrow screen", () => {
    scene(
      { update, view },
      given(reader(loading(article.slug, false))),
      sceneExpect(selector("#reader")).toBeVisible(),
      sceneExpect(selector("#libraryView")).toBeVisible()
    );
  });

  it("fills the pane with the article once the read answers", () => {
    scene(
      { update, view },
      given(initialModel(home)),
      Subscription.emit(
        Message.ReaderOpened({ slug: article.slug, wide: true })
      ),
      Command.resolve(
        LoadHelpArticle,
        Message.ReaderLoaded({ article, slug: article.slug })
      ),
      sceneExpect(selector("#readerBody")).toContainText("Connect an Agent"),
      sceneExpect(selector("#readerBody")).toContainText("Agents"),
      sceneExpect(selector("#readerBody")).toContainText(
        "Connect Claude, Codex or Cursor over MCP."
      ),
      sceneExpect(selector("#readerBody")).toContainText("Open the board"),
      sceneExpect(selector("#readerBody")).toContainText("Steps")
    );
  });

  it("shows the error line and stays open when the read fails", () => {
    scene(
      { update, view },
      given(initialModel(home)),
      Subscription.emit(
        Message.ReaderOpened({ slug: article.slug, wide: true })
      ),
      Command.resolve(
        LoadHelpArticle,
        Message.ReaderFailed({ slug: article.slug })
      ),
      sceneExpect(selector("#reader")).toBeVisible(),
      sceneExpect(selector("#readerBody")).toContainText(
        "That article could not be opened."
      )
    );
  });

  it("goes back to the list on the back button", () => {
    scene(
      { update, view },
      given(reader(opened(true))),
      sceneExpect(selector("#libraryView")).not.toBeVisible(),
      click(selector("#readerBack")),
      sceneExpect(selector("#reader")).not.toBeVisible(),
      sceneExpect(selector("#libraryView")).toBeVisible()
    );
  });

  it("goes back to the list on Escape", () => {
    scene(
      { update, view },
      given(reader(opened(true))),
      Subscription.emit(Message.ReaderClosed()),
      sceneExpect(selector("#reader")).not.toBeVisible(),
      sceneExpect(selector("#libraryView")).toBeVisible()
    );
  });

  it("follows the viewport while the article is open", () => {
    scene(
      { update, view },
      given(reader(opened(true))),
      Subscription.emit(Message.ReaderViewportChanged({ wide: false })),
      sceneExpect(selector("#libraryView")).toBeVisible(),
      Subscription.emit(Message.ReaderViewportChanged({ wide: true })),
      sceneExpect(selector("#libraryView")).not.toBeVisible()
    );
  });
});
