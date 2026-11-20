/** @type {[string, string][]} */
const ENTITIES = [
  ["&amp;", "&"],
  ["&quot;", '"'],
  ["&#39;", "'"],
  ["&lt;", "<"],
  ["&gt;", ">"],
  ["&nbsp;", " "],
];

const TITLE = /<title[^>]*>(?<title>[\s\S]*?)<\/title>/iu;

const META = /<meta\b(?<attributes>[^>]*)>/giu;

const LINK = /<link\b(?<attributes>[^>]*)>/giu;

const ATTRIBUTE = /(?<name>[a-z:-]+)\s*=\s*"(?<value>[^"]*)"/giu;

const ASSET = /(?:href|src)\s*=\s*"(?<asset>[^"]*\/assets\/[^"]+\.js)"/iu;

const NOINDEX = "noindex";

/**
 * @param {string} value
 * @returns {string}
 */
const decode = (value) => {
  let text = value;

  for (const [entity, character] of ENTITIES) {
    text = text.replaceAll(entity, character);
  }

  return text;
};

/**
 * @param {string} attributes
 * @returns {Map<string, string>}
 */
const attributeMap = (attributes) => {
  /** @type {Map<string, string>} */
  const found = new Map();

  for (const match of attributes.matchAll(ATTRIBUTE)) {
    const name = (match.groups?.name ?? "").toLowerCase();
    const value = match.groups?.value ?? "";

    if (name.length > 0) {
      found.set(name, decode(value));
    }
  }

  return found;
};

/**
 * @param {string} html
 * @param {string} key
 * @returns {string | null}
 */
const metaValue = (html, key) => {
  for (const match of html.matchAll(META)) {
    const attributes = attributeMap(match.groups?.attributes ?? "");

    const name = (
      attributes.get("name") ??
      attributes.get("property") ??
      ""
    ).toLowerCase();

    if (name === key) {
      return attributes.get("content") ?? "";
    }
  }

  return null;
};

/**
 * @param {string} html
 * @returns {string | null}
 */
const canonicalValue = (html) => {
  for (const match of html.matchAll(LINK)) {
    const attributes = attributeMap(match.groups?.attributes ?? "");

    const rel = (attributes.get("rel") ?? "").toLowerCase();

    if (rel.split(/\s+/u).includes("canonical")) {
      return attributes.get("href") ?? "";
    }
  }

  return null;
};

/**
 * @param {string} html
 * @returns {{ canonical: string | null, description: string | null, robots: string | null, title: string | null }}
 */
export const headTagsOf = (html) => {
  const title = TITLE.exec(html)?.groups?.title;

  return {
    canonical: canonicalValue(html),
    description: metaValue(html, "description"),
    robots: metaValue(html, "robots"),
    title: title === undefined ? null : decode(title),
  };
};

/**
 * @param {string} html
 * @returns {string | null}
 */
export const firstAssetOf = (html) => ASSET.exec(html)?.groups?.asset ?? null;

/**
 * @param {Headers} headers
 * @returns {boolean}
 */
export const hasNoindexHeader = (headers) =>
  (headers.get("x-robots-tag") ?? "").toLowerCase().includes(NOINDEX);

/**
 * @param {{ robots: string | null }} tags
 * @returns {boolean}
 */
export const headTagsNoindex = (tags) =>
  (tags.robots ?? "").toLowerCase().includes(NOINDEX);
