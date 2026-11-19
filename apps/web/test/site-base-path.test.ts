import { describe, expect, it } from "@effect/vitest";

import {
  normalizeBasePath,
  siteAssetHeaders,
  siteAssetRedirects,
  siteBasePath,
  siteNoindexValue,
  sitePath,
  siteRobotsMeta,
  stripBasePath,
} from "../src/site-base-path.js";
import {
  publishHostname,
  publishRoutePattern,
  publishWorkerName,
} from "../src/website.js";

describe("normalizeBasePath", () => {
  it("reads an empty value as the origin root", () => {
    expect(normalizeBasePath()).toBe("");
    expect(normalizeBasePath("")).toBe("");
    expect(normalizeBasePath("/")).toBe("");
  });

  it("keeps one leading slash and drops trailing ones", () => {
    expect(normalizeBasePath("ratstack")).toBe("/ratstack");
    expect(normalizeBasePath("/ratstack/")).toBe("/ratstack");
    expect(normalizeBasePath("  /ratstack//  ")).toBe("/ratstack");
  });
});

describe("stripBasePath", () => {
  it("is the identity when the base path is empty", () => {
    for (const pathname of ["/", "/help", "/ratstack/help"]) {
      expect(stripBasePath(pathname, "")).toBe(pathname);
    }
  });

  it("maps the published root onto the site root", () => {
    expect(stripBasePath("/ratstack", "/ratstack")).toBe("/");
    expect(stripBasePath("/ratstack/", "/ratstack")).toBe("/");
  });

  it("strips one prefix and no more", () => {
    expect(stripBasePath("/ratstack/help", "/ratstack")).toBe("/help");
    expect(stripBasePath("/ratstack/help/", "/ratstack")).toBe("/help/");
    expect(stripBasePath("/ratstack/a/b", "/ratstack")).toBe("/a/b");
  });

  it("refuses everything outside the base path", () => {
    expect(stripBasePath("/", "/ratstack")).toBeUndefined();
    expect(stripBasePath("/help", "/ratstack")).toBeUndefined();
    expect(stripBasePath("/ratstacker", "/ratstack")).toBeUndefined();
    expect(stripBasePath("/ratstacker/help", "/ratstack")).toBeUndefined();
  });
});

describe("sitePath", () => {
  it("adds the base path to a root relative address", () => {
    expect(sitePath("/help")).toBe("/ratstack/help");
    expect(sitePath("/fonts/ibm-plex-sans-latin.woff2")).toBe(
      "/ratstack/fonts/ibm-plex-sans-latin.woff2"
    );
  });

  it("adds it once", () => {
    expect(sitePath("/ratstack/help")).toBe("/ratstack/help");
    expect(sitePath("/ratstack")).toBe("/ratstack");
  });

  it("leaves every address that is not root relative alone", () => {
    for (const path of [
      "https://hypertask.ai/pricing/",
      "//cdn.usefathom.com/script.js",
      "#all",
      "?category=Agents#all",
      "back",
    ]) {
      expect(sitePath(path)).toBe(path);
    }
  });

  it("is the identity when the base path is empty", () => {
    expect(sitePath("/help", "")).toBe("/help");
  });
});

describe("the published base path", () => {
  it("is mounted under /ratstack", () => {
    expect(siteBasePath).toBe("/ratstack");
  });

  it("is the only value the Cloudflare route reads", () => {
    expect(publishRoutePattern).toBe(`${publishHostname}${siteBasePath}*`);
    expect(publishRoutePattern).toBe("help.hypertask.ai/ratstack*");
  });

  it("comes from a Worker named for the preview", () => {
    expect(publishWorkerName).toContain("ratstack");
    expect(publishWorkerName).not.toBe("ai-chatbot");
  });
});

describe("the noindex answers", () => {
  it("sits under the base path while the preview is up", () => {
    expect(siteNoindexValue()).toBe("noindex");
    expect(siteRobotsMeta()).toBe('<meta name="robots" content="noindex">');
    expect(siteAssetHeaders()).toBe("/ratstack/*\n  X-Robots-Tag: noindex\n");
  });

  it("disappears when the base path becomes empty", () => {
    expect(siteNoindexValue("")).toBeUndefined();
    expect(siteRobotsMeta("")).toBe("");
    expect(siteAssetHeaders("")).toBeUndefined();
  });
});

describe("the root redirect rules for the asset layer", () => {
  it("sends the preview root to the published help page", () => {
    expect(siteAssetRedirects("/ratstack")).toBe(
      "/ratstack /ratstack/help 302\n/ratstack/ /ratstack/help 302\n"
    );
  });

  it("sends the origin root to the help page once the base path is gone", () => {
    expect(siteAssetRedirects("")).toBe("/ /help 302\n");
  });
});
