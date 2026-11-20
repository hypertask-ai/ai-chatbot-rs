// @effect-diagnostics nodeBuiltinImport:off -- This test walks the built site on disk to prove every address it emits stays inside the base path.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "@effect/vitest";

import { siteBasePath, siteRobotsMeta } from "../src/site-base-path.js";
import {
  widgetScriptAssetPath,
  widgetScriptBuildFileName,
} from "../src/widget/embed.js";

const basePathOwner = "apps/web/src/site-base-path.ts";

const clientDirectory = fileURLToPath(
  new URL("../dist/client", import.meta.url)
);

const assetExtension =
  /\.(?:avif|css|gif|html|ico|jpe?g|json|js|mjs|otf|png|svg|ttf|webp|woff2?)$/u;

const walk = (directory: string, prefix = ""): readonly string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;

    return entry.isDirectory()
      ? walk(path.join(directory, entry.name), relative)
      : [relative];
  });

const cssUrls = (text: string): readonly string[] =>
  [...text.matchAll(/url\(\s*['"]?(?<url>[^'")]*)['"]?\s*\)/gu)].map(
    (match) => match.groups?.url ?? ""
  );

const attributeUrls = (text: string): readonly string[] => {
  const attributes =
    /\b(?:action|data-src|formaction|href|poster|src)="(?<url>[^"]*)"/gu;

  const srcset = /\bsrcset="(?<url>[^"]*)"/gu;

  return [
    ...[...text.matchAll(attributes)].map((match) => match.groups?.url ?? ""),
    ...[...text.matchAll(srcset)].flatMap((match) =>
      (match.groups?.url ?? "")
        .split(",")
        .map((candidate) => candidate.trim().split(/\s+/u)[0] ?? "")
    ),
    ...cssUrls(text),
  ];
};

const scriptUrls = (text: string): readonly string[] => {
  const specifiers = /(?:\bfrom|\bimport)\s*\(?\s*["'](?<url>[^"']+)["']/gu;

  const quoted = /["'`](?<url>[^"'`\s]*)["'`]/gu;

  return [
    ...[...text.matchAll(specifiers)].map((match) => match.groups?.url ?? ""),
    ...[...text.matchAll(quoted)].flatMap((match) => {
      const value = match.groups?.url ?? "";

      return assetExtension.test(value) ? [value] : [];
    }),
  ];
};

const jsonUrls = (text: string): readonly string[] =>
  [...text.matchAll(/"(?<url>[^"\\]*)"/gu)].flatMap((match) => {
    const value = match.groups?.url ?? "";

    return value.startsWith("/") ? [value] : [];
  });

const urlsIn = (file: string, text: string): readonly string[] => {
  if (file.endsWith(".html")) {
    return attributeUrls(text);
  }

  if (file.endsWith(".css")) {
    return cssUrls(text);
  }

  if (file.endsWith(".json")) {
    return jsonUrls(text);
  }

  if (file.endsWith(".js") || file.endsWith(".mjs")) {
    return scriptUrls(text);
  }

  return [];
};

const escapesBasePath = (file: string, url: string): boolean => {
  if (
    siteBasePath === "" ||
    !url.startsWith("/") ||
    url.startsWith("//") ||
    url === siteBasePath ||
    url.startsWith(`${siteBasePath}/`)
  ) {
    return false;
  }

  return url !== "/" || !(file.endsWith(".js") || file.endsWith(".mjs"));
};

const describeEscape = (file: string, url: string): string =>
  `${file} emits "${url}", which leaves the base path "${siteBasePath}". ${basePathOwner} owns that value.`;

describe("the built site under the base path", () => {
  it("keeps every address it emits inside the base path", () => {
    const built = statSync(clientDirectory, { throwIfNoEntry: false });

    if (built === undefined) {
      throw new Error(
        `The build output is missing at ${clientDirectory}. Run \`pnpm --filter @rat-stack/web build\` before the tests.`
      );
    }

    const offences = walk(clientDirectory).flatMap((file) =>
      urlsIn(file, readFileSync(path.join(clientDirectory, file), "utf-8"))
        .filter((url) => escapesBasePath(file, url))
        .map((url) => describeEscape(file, url))
    );

    expect(offences).toStrictEqual([]);
  });

  it("tells search engines to skip every page it emits", () => {
    const robotsMeta = siteRobotsMeta();

    const pages = walk(clientDirectory).filter((file) =>
      file.endsWith(".html")
    );

    const missing = pages.filter(
      (file) =>
        !readFileSync(path.join(clientDirectory, file), "utf-8").includes(
          robotsMeta
        )
    );

    expect(missing).toStrictEqual([]);
  });

  it("writes the widget loader where the asset manifest adds the base path", () => {
    expect(widgetScriptBuildFileName).toBe("widget/widget.js");
    expect(widgetScriptAssetPath).toBe(`${siteBasePath}/widget/widget.js`);
    expect(widgetScriptBuildFileName.startsWith(siteBasePath)).toBe(false);

    const loader = statSync(
      path.join(clientDirectory, widgetScriptBuildFileName),
      { throwIfNoEntry: false }
    );

    expect(loader?.isFile()).toBe(true);
  });
});
