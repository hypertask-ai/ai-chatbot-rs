import { expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import {
  renderDocument as renderFoldkitDocument,
  renderToString,
} from "foldkit/experimental/server";
import { inertHtml } from "foldkit/html";

import { initialModel } from "../src/client/home/index.js";
import { viewAt } from "../src/features/home/index.js";
import { siteDocumentRenderer } from "../src/server/site-document.js";
import {
  addSiteBasePath,
  isWithinSiteBasePath,
  normalizeSiteBasePath,
  removeSiteBasePath,
} from "../src/site-base-path.js";
import {
  siteBuilder,
  siteRobotsTag,
  withSiteNoindex,
} from "../src/site-base.js";

const testBasePath = "/ratstack";

const internalAddresses = (html: string): readonly string[] =>
  [...html.matchAll(/\s(?:href|src)="(?<value>[^"]*)"/gu)].flatMap((match) => {
    const value = match.groups?.value ?? "";

    return value.startsWith("/") ? [value] : [];
  });

const escapesTestAddress = (html: string): boolean =>
  internalAddresses(html).some(
    (address) => !isWithinSiteBasePath(testBasePath, address)
  );

it.prop(
  "a route survives the site base path on the way in and on the way out",
  {
    basePath: Schema.Literals(["", testBasePath]),
    route: Schema.Literals([
      "/",
      "/help",
      "/health",
      "/en/foo",
      "/api/chat/message",
    ]),
  },
  ({ basePath, route }) => {
    const atSiteBase = addSiteBasePath(basePath, route);

    expect(atSiteBase).toStrictEqual(addSiteBasePath(basePath, atSiteBase));
    expect(removeSiteBasePath(basePath, atSiteBase)).toStrictEqual(route);
    expect(isWithinSiteBasePath(basePath, atSiteBase)).toBe(true);
  }
);

it("leaves external addresses and in-page references alone", () => {
  for (const path of [
    "#chat",
    "?q=search",
    "//cdn.hypertask.ai/app.js",
    "https://app.hypertask.ai",
    "mailto:help@hypertask.ai",
  ]) {
    expect(addSiteBasePath(testBasePath, path)).toStrictEqual(path);
  }
});

it("normalizes the setting to one root-relative path", () => {
  expect(normalizeSiteBasePath()).toStrictEqual("");
  expect(normalizeSiteBasePath(" / ")).toStrictEqual("");
  expect(normalizeSiteBasePath("/ratstack/")).toStrictEqual(testBasePath);
  expect(normalizeSiteBasePath("/help/ratstack")).toStrictEqual(
    "/help/ratstack"
  );
  expect(() => normalizeSiteBasePath("ratstack")).toThrow();
  expect(() =>
    normalizeSiteBasePath("https://help.hypertask.ai/ratstack")
  ).toThrow();
});

it("keeps one path outside the test address outside it", () => {
  expect(isWithinSiteBasePath(testBasePath, "/ratstackish")).toBe(false);
  expect(isWithinSiteBasePath(testBasePath, "/health")).toBe(false);
  expect(isWithinSiteBasePath(testBasePath, testBasePath)).toBe(true);
  expect(isWithinSiteBasePath("", "/health")).toBe(true);
});

it("keeps the builder untouched when the site mounts at the origin root", () => {
  expect(siteBuilder("", inertHtml).Href("/help")).toStrictEqual(
    inertHtml.Href("/help")
  );
});

it("prefixes every internal address the builder writes", () => {
  const atSiteBase = siteBuilder(testBasePath, inertHtml);

  expect(atSiteBase.Href("/help").value).toStrictEqual("/ratstack/help");
  expect(atSiteBase.Src("/images/help.png").value).toStrictEqual(
    "/ratstack/images/help.png"
  );
  expect(atSiteBase.Action("/ratstack/api/chat/message").value).toStrictEqual(
    "/ratstack/api/chat/message"
  );
  expect(atSiteBase.Attribute("href", "/help")).toStrictEqual(
    inertHtml.Attribute("href", "/ratstack/help")
  );
  expect(atSiteBase.Href("https://app.hypertask.ai")).toStrictEqual(
    inertHtml.Href("https://app.hypertask.ai")
  );
});

it("prefixes every source in one srcset and keeps its descriptors", () => {
  expect(
    siteBuilder(testBasePath, inertHtml).Attribute(
      "srcset",
      "/images/a.png 1x, /images/b.png 2x"
    )
  ).toStrictEqual(
    inertHtml.Attribute(
      "srcset",
      "/ratstack/images/a.png 1x, /ratstack/images/b.png 2x"
    )
  );
});

it("marks an answer under the test address noindex and leaves the origin root alone", () => {
  const response = new Response("{}", {
    headers: { "content-type": "application/json" },
  });

  const marked = withSiteNoindex(testBasePath, response);

  expect(marked.headers.get("x-robots-tag")).toStrictEqual(siteRobotsTag);
  expect(marked.headers.get("content-type")).toStrictEqual("application/json");
  expect(withSiteNoindex("", response).headers.get("x-robots-tag")).toBeNull();
});

const application = {
  html: "<main>Hypertask Help</main>",
  title: "Hypertask Help",
};

const assets = {
  entryScript: "/assets/entry.js",
  modulePreloads: [],
  stylesheets: ["/assets/entry.css"],
};

it("adds the robots meta to the document under the test address", () => {
  const html = siteDocumentRenderer(testBasePath)(application, assets);

  expect(html).toContain(siteRobotsTag);
  expect(html).toContain('name="robots"');
});

it("returns Foldkit's own renderer when the site mounts at the origin root", () => {
  expect(siteDocumentRenderer("")(application, assets)).toStrictEqual(
    renderFoldkitDocument(application, assets)
  );
});

const assetsAt = (basePath: string) => ({
  entryScript: addSiteBasePath(basePath, "/assets/entry.js"),
  modulePreloads: [],
  stylesheets: [addSiteBasePath(basePath, "/assets/entry.css")],
});

const homePage = (basePath: string) =>
  Effect.gen(function* renderedHomePage() {
    const rendered = yield* renderToString(
      { init: () => ({ model: initialModel }), view: viewAt(basePath) },
      { isHydratable: false }
    );

    return siteDocumentRenderer(basePath)(rendered, assetsAt(basePath));
  });

it.effect(
  "crawls the rendered home page under the test address and finds no address outside it",
  () =>
    Effect.gen(function* prefixedHomePage() {
      const html = yield* homePage(testBasePath);

      expect(html).toContain('name="robots"');
      expect(escapesTestAddress(html)).toBe(false);
      expect(html).not.toContain('href="/help"');
      expect(html).not.toContain('src="/images');
    })
);

it.effect(
  "renders the home page with no test address at all when the setting is empty",
  () =>
    Effect.gen(function* unprefixedHomePage() {
      const html = yield* homePage("");

      expect(html).not.toContain(testBasePath);
      expect(html).not.toContain('name="robots"');
    })
);
