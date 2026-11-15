import { describe, expect, it } from "@effect/vitest";
import {
  Command,
  Subscription,
  click,
  expect as sceneExpect,
  given,
  keydown,
  role,
  scene,
  selector,
  type,
} from "foldkit/scene";
import { given as storyGiven, message, model, story } from "foldkit/story";

import {
  BlurSearchInput,
  FocusSearchInput,
  ShowAllArticles,
} from "../src/client/help/command.js";
import type { HelpPageValue } from "../src/client/help/index.js";
import { Message, initialModelAtAddress } from "../src/client/help/index.js";
import { update } from "../src/client/help/update.js";
import { styleClass } from "../src/features/help/class-names.js";
import { view } from "../src/features/help/index.js";
import { helpCenter } from "../src/features/help/styles.stylex.js";

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

const openList = initialModelAtAddress(home, { hash: "#all", search: "" });

const agentsOnly = initialModelAtAddress(home, {
  hash: "#all",
  search: "?category=Agents",
});

const box = selector("#searchInput");

const results = selector("#liveSearchResults");

const categories = selector("#categoriesContainer");

const articleList = selector("#all");

const searchingClass = styleClass(helpCenter.articlesRegionSearching);

const shownResultsClass = styleClass(helpCenter.liveResultsShown);

const hiddenResultsClass = styleClass(helpCenter.liveResultsHidden);

const settled = (value: string) =>
  Subscription.emit(Message.SearchSettled({ value }));

describe("help center search controls", () => {
  it("filters the results once the typed text settles", () => {
    scene(
      { update, view },
      given(openList),
      sceneExpect(box).toHaveValue(""),
      type(box, "connect"),
      sceneExpect(box).toHaveValue("connect"),
      sceneExpect(results).toHaveClass(hiddenResultsClass),
      settled("connect"),
      sceneExpect(results).toHaveClass(shownResultsClass),
      sceneExpect(selector("#liveSearchResults a")).toHaveAttr(
        "href",
        "/help/docs-connect-an-agent"
      ),
      sceneExpect(selector("#liveSearchResults a")).toContainText(
        "Connect an Agent"
      ),
      sceneExpect(results).toContainText("1 article found"),
      sceneExpect(categories).toHaveClass(searchingClass)
    );
  });

  it("shows the empty state when nothing matches", () => {
    scene(
      { update, view },
      given(openList),
      type(box, "zzzqx"),
      settled("zzzqx"),
      sceneExpect(results).toContainText("No results found"),
      sceneExpect(results).toContainText(
        "Try a different search term or browse the categories below."
      ),
      sceneExpect(selector("#liveSearchResults a")).toBeAbsent()
    );
  });

  it("clears the box and the results from the clear button", () => {
    scene(
      { update, view },
      given(openList),
      type(box, "board"),
      settled("board"),
      sceneExpect(results).toHaveClass(shownResultsClass),
      click(selector("#searchClear")),
      sceneExpect(box).toHaveValue(""),
      sceneExpect(results).toHaveClass(hiddenResultsClass),
      sceneExpect(categories).not.toHaveClass(searchingClass),
      Command.expectExact(FocusSearchInput()),
      Command.resolve(FocusSearchInput(), Message.SearchInputFocused()),
      Command.expectNone()
    );
  });

  it("clears the box with Escape while it holds text", () => {
    scene(
      { update, view },
      given(openList),
      type(box, "board"),
      settled("board"),
      keydown(box, "Escape"),
      sceneExpect(box).toHaveValue(""),
      sceneExpect(results).toHaveClass(hiddenResultsClass),
      Command.resolve(FocusSearchInput(), Message.SearchInputFocused()),
      Command.expectNone()
    );
  });

  it("drops focus with Escape on an empty box, and leaves other keys alone", () => {
    scene(
      { update, view },
      given(openList),
      keydown(box, "Enter"),
      Command.expectNone(),
      sceneExpect(box).toHaveValue(""),
      keydown(box, "ArrowDown"),
      Command.expectNone(),
      keydown(box, "Escape"),
      Command.expectExact(BlurSearchInput()),
      Command.resolve(BlurSearchInput(), Message.SearchInputBlurred()),
      Command.expectNone()
    );
  });

  it("opens the whole article list from All articles", () => {
    scene(
      { update, view },
      given(openList),
      type(box, "board"),
      settled("board"),
      click(role("link", { name: "All articles \u2192" })),
      sceneExpect(box).toHaveValue(""),
      sceneExpect(results).toHaveClass(hiddenResultsClass),
      sceneExpect(selector("#browserTitle")).toHaveText("All articles"),
      Command.expectExact(ShowAllArticles()),
      Command.resolve(ShowAllArticles(), Message.AddressReplaced()),
      Command.expectNone()
    );
  });

  it("opens the article list when the address gains #all", () => {
    scene(
      { update, view },
      given(initialModelAtAddress(home, { hash: "", search: "" })),
      sceneExpect(articleList).not.toBeVisible(),
      Subscription.emit(Message.AddressChanged({ hash: "#all" })),
      sceneExpect(articleList).toBeVisible()
    );
  });

  it("keeps the topic filter of the address", () => {
    scene(
      { update, view },
      given(agentsOnly),
      sceneExpect(articleList).toBeVisible(),
      sceneExpect(selector("#browserTitle")).toHaveText("Agents"),
      sceneExpect(articleList).toContainText("Connect an Agent"),
      sceneExpect(articleList).not.toContainText("Board Settings")
    );
  });

  it("follows a topic card to its own filtered list", () => {
    scene(
      { update, view },
      given(openList),
      sceneExpect(role("link", { name: /^Agents/u })).toHaveAttr(
        "href",
        "?category=Agents#all"
      ),
      sceneExpect(role("link", { name: /^Boards & tickets/u })).toHaveAttr(
        "href",
        "?category=Boards%20%26%20tickets#all"
      )
    );
  });
});

describe("help center search model", () => {
  it("keeps the previous results until the settled value arrives", () => {
    story(
      update,
      storyGiven(openList),
      message(Message.SearchEdited({ value: "board" })),
      model((next) => {
        expect(next.search.input).toBe("board");
        expect(next.search.query).toBe("");
      }),
      message(Message.SearchSettled({ value: "board" })),
      model((next) => {
        expect(next.search.query).toBe("board");
      })
    );
  });

  it("takes the search out of the address on the first render", () => {
    expect(
      initialModelAtAddress(home, {
        hash: "#all",
        search: "?q=Board%20Settings",
      }).search
    ).toEqual({ input: "Board Settings", query: "Board Settings" });

    expect(
      initialModelAtAddress(home, { hash: "#all", search: "?category=Agents" })
        .search
    ).toEqual({ input: "", query: "" });

    expect(
      initialModelAtAddress(home, {
        hash: "#all",
        search: "?category=Agents&q=board",
      }).search
    ).toEqual({ input: "board", query: "board" });

    expect(
      initialModelAtAddress(home, { hash: "", search: "?q=" }).browser.open
    ).toBe(false);
  });

  it("searches a topic that has no article, as the old page did", () => {
    const missing = initialModelAtAddress(home, {
      hash: "#all",
      search: "?category=Nothing%20Here",
    });

    expect(missing.browser.open).toBe(true);
    expect(missing.search).toEqual({
      input: "Nothing Here",
      query: "Nothing Here",
    });
  });

  it("leaves the article page without a search or a list", () => {
    const article = initialModelAtAddress(
      {
        article: {
          category: "Agents",
          excerpt: "Connect an agent.",
          html: "<p>Body</p>",
          plansHtml: "",
          slug: "docs-connect-an-agent",
          title: "Connect an Agent",
        },
        page: "article",
        related: [],
      },
      { hash: "#all", search: "?q=board" }
    );

    expect(article.browser.open).toBe(false);
    expect(article.search).toEqual({ input: "", query: "" });
  });

  it("opens the article list on #all and leaves other hashes alone", () => {
    story(
      update,
      storyGiven(initialModelAtAddress(home, { hash: "", search: "" })),
      message(Message.AddressChanged({ hash: "#all" })),
      model((next) => {
        expect(next.browser.open).toBe(true);
      }),
      message(Message.AddressChanged({ hash: "#top" })),
      model((next) => {
        expect(next.browser.open).toBe(true);
      })
    );
  });
});
