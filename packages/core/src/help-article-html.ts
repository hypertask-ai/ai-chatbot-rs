const BLOCK_TAG =
  /^<(?:!doctype|html|body|div|p|h[1-6]|ul|ol|article|section|table|iframe)\b/iu;

const DOCS_ORIGIN = "https://docs.hypertask.ai";

const GUIDE_PATH = "index.mdx";

const KEY_SENTINEL = "\u0000";

// oxlint-disable-next-line no-control-regex -- The key sentinel has to stop the plain-text run, and that sentinel is written as the control character the old formatter used.
const NEXT_TOKEN = /[`*<\u0000[]|https?:\/\//u;

const MARKDOWN_LINK = /^\[(?<label>[^\]\n]+)\]\((?<href>[^)\s]+)\)/u;

const BARE_URL = /^https?:\/\/[^\s<]+/u;

const TABLE_SCROLL_OPEN =
  '<div class="table-scroll" style="overflow-x:auto;-webkit-overflow-scrolling:touch">';

interface InlineToken {
  readonly html: string;
  readonly next: number;
}

interface HtmlBlock {
  readonly html: string;
  readonly next: number;
}

type RenderInline = (text: string, depth: number) => string;

const characterAt = (value: string, index: number): string =>
  value.at(index) ?? "";

const lineAt = (lines: readonly string[], index: number): string =>
  lines.at(index) ?? "";

const escapeHtml = (text: string): string =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const escapeAttr = (text: string): string => escapeHtml(text);

const HTML_SPACE = " \t\n\r\f";

const isTagNameStart = (character: string): boolean =>
  (character >= "A" && character <= "Z") ||
  (character >= "a" && character <= "z");

const isTagNameCharacter = (character: string): boolean =>
  isTagNameStart(character) ||
  (character >= "0" && character <= "9") ||
  character === "-" ||
  character === ":";

const startsMarkup = (character: string): boolean =>
  isTagNameStart(character) ||
  character === "/" ||
  character === "!" ||
  character === "?";

const attributeValueEnd = (value: string, start: number): number => {
  let index = start;

  while (
    index < value.length &&
    HTML_SPACE.includes(characterAt(value, index))
  ) {
    index += 1;
  }

  const quote = characterAt(value, index);

  if (quote === '"' || quote === "'") {
    const close = value.indexOf(quote, index + 1);

    return close === -1 ? -1 : close + 1;
  }

  while (index < value.length) {
    const character = characterAt(value, index);

    if (character === ">" || HTML_SPACE.includes(character)) {
      return index;
    }

    index += 1;
  }

  return -1;
};

const tagEnd = (value: string, start: number): number => {
  let index = start;

  while (
    index < value.length &&
    isTagNameCharacter(characterAt(value, index))
  ) {
    index += 1;
  }

  while (index < value.length) {
    const character = characterAt(value, index);

    if (character === ">") {
      return index + 1;
    }

    if (character === "=") {
      index = attributeValueEnd(value, index + 1);

      if (index === -1) {
        return -1;
      }

      continue;
    }

    index += 1;
  }

  return -1;
};

const commentEnd = (value: string, start: number): number => {
  const close = value.indexOf("-->", start + 4);

  return close === -1 ? value.length : close + 3;
};

const declarationEnd = (value: string, start: number): number => {
  const close = value.indexOf(">", start + 2);

  return close === -1 ? value.length : close + 1;
};

const markupEnd = (value: string, start: number): number => {
  const next = characterAt(value, start + 1);

  if (next === "!") {
    return value.startsWith("<!--", start)
      ? commentEnd(value, start)
      : declarationEnd(value, start);
  }

  if (next === "?") {
    return declarationEnd(value, start);
  }

  if (next === "/") {
    return isTagNameStart(characterAt(value, start + 2))
      ? tagEnd(value, start + 2)
      : declarationEnd(value, start);
  }

  return isTagNameStart(next) ? tagEnd(value, start + 1) : -1;
};

const withoutTags = (value: string): string => {
  const parts: string[] = [];
  let index = 0;

  while (index < value.length) {
    const character = characterAt(value, index);

    if (character === "<") {
      const end = markupEnd(value, index);

      if (end > index) {
        index = end;
        continue;
      }
    }

    parts.push(character);
    index += 1;
  }

  return parts.join("");
};

const withoutTagOpenings = (value: string): string => {
  const parts: string[] = [];
  let next = "";

  for (let index = value.length - 1; index >= 0; index -= 1) {
    const character = characterAt(value, index);

    if (character === "<" && startsMarkup(next)) {
      continue;
    }

    parts.push(character);
    next = character;
  }

  return parts.toReversed().join("");
};

const plainTextOf = (value: string): string =>
  withoutTagOpenings(withoutTags(value));

const normalizeDocPath = (path: string): string =>
  path.replaceAll("\\", "/").replace(/^\.\//u, "");

const normalizeRelative = (path: string): string => {
  const parts: string[] = [];

  for (const part of path.split("/")) {
    if (part === "" || part === ".") {
      continue;
    }

    if (part === "..") {
      parts.pop();
      continue;
    }

    parts.push(part);
  }

  return parts.join("/");
};

const resolveDocsHref = (href: string, fromPath: string): string => {
  const raw = href.trim();

  if (raw === "" || raw.startsWith("#") || raw.startsWith("//")) {
    return raw;
  }

  if (/^[a-z][a-z0-9+.-]*:/iu.test(raw)) {
    return raw;
  }

  const hashAt = raw.indexOf("#");
  const hash = hashAt === -1 ? "" : raw.slice(hashAt);
  const head = hashAt === -1 ? raw : raw.slice(0, hashAt);

  const resolved = head.startsWith("/")
    ? head
    : `/${normalizeRelative(
        `${normalizeDocPath(fromPath).replace(/[^/]*$/u, "")}${head}`
      )}`;

  const path = resolved.length > 1 ? resolved.replace(/\/+$/u, "") : resolved;

  if (path === "/" || path === "") {
    return `${DOCS_ORIGIN}/${hash}`;
  }

  return `${DOCS_ORIGIN}${path}/${hash}`;
};

const safeArticleHref = (url: string): string | null => {
  const href = url.trim();
  const lower = href.toLowerCase().replaceAll(/\s/gu, "");

  if (lower === "" || /^(?:data|javascript|vbscript):/u.test(lower)) {
    return null;
  }

  if (
    lower.startsWith("https://") ||
    lower.startsWith("http://") ||
    lower.startsWith("mailto:")
  ) {
    return href;
  }

  if (lower.startsWith("/help/")) {
    return href;
  }

  if (href.startsWith("/") && !href.startsWith("//")) {
    return resolveDocsHref(href, GUIDE_PATH);
  }

  return null;
};

const attributeValue = (tag: string, name: string): string => {
  const quoted = new RegExp(
    `\\b${name}\\s*=\\s*(?:"(?<doubleQuoted>[^"]*)"|'(?<singleQuoted>[^']*)')`,
    "iu"
  ).exec(tag);

  return (
    quoted?.groups?.doubleQuoted ??
    quoted?.groups?.singleQuoted ??
    ""
  ).trim();
};

const sanitizeIframe = (tag: string): string | null => {
  const src = attributeValue(tag, "src");

  if (
    !/^https:\/\/(?:www\.youtube(?:-nocookie)?\.com|player\.vimeo\.com)\/embed\/[A-Za-z0-9_-]+/iu.test(
      src
    )
  ) {
    return null;
  }

  const title = attributeValue(tag, "title");
  const titleAttr = title === "" ? "" : ` title="${escapeAttr(title)}"`;

  return `<iframe src="${escapeAttr(src)}"${titleAttr} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
};

const sanitizeImg = (tag: string): string | null => {
  const src = attributeValue(tag, "src");

  if (!/^https:\/\//iu.test(src)) {
    return null;
  }

  return `<img src="${escapeAttr(src)}" alt="${escapeAttr(attributeValue(tag, "alt"))}">`;
};

const safeMediaHtml = (value: string): string | null => {
  const trimmed = value.trim();

  if (trimmed === "" || trimmed !== value.trim()) {
    return null;
  }

  if (/^<iframe\b/iu.test(trimmed)) {
    return sanitizeIframe(trimmed);
  }

  if (/^<img\b/iu.test(trimmed)) {
    return sanitizeImg(trimmed);
  }

  return null;
};

const mediaAt = (
  source: string,
  index: number
): { readonly html: string; readonly length: number } | null => {
  const slice = source.slice(index);
  const iframe = /^<iframe\b[^>]*>\s*<\/iframe>/iu.exec(slice);

  if (iframe !== null) {
    const html = sanitizeIframe(iframe[0]);

    return html === null ? null : { html, length: iframe[0].length };
  }

  const img = /^<img\b[^>]*\/?>/iu.exec(slice);

  if (img !== null) {
    const html = sanitizeImg(img[0]);

    return html === null ? null : { html, length: img[0].length };
  }

  return null;
};

const isListLine = (line: string): boolean =>
  /^[ \t]*[-*][ \t]+\S/u.test(line) || /^[ \t]*\d+\.[ \t]+\S/u.test(line);

const isTableRow = (line: string): boolean => {
  const trimmed = line.trim();

  return trimmed.startsWith("|") && trimmed.lastIndexOf("|") > 0;
};

const isSeparator = (line: string): boolean =>
  /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?[ \t]*$/u.test(line.trim());

const isTableStart = (lines: readonly string[], index: number): boolean =>
  isTableRow(lineAt(lines, index)) && isSeparator(lineAt(lines, index + 1));

const inlineHtmlToMarkdown = (text: string): string =>
  text
    .replaceAll(/<br\s*\/?>/giu, "\n")
    .replaceAll(
      /<a\b[^>]*\bhref\s*=\s*"(?<href>[^"]*)"[^>]*>(?<label>[\s\S]*?)<\/a>/giu,
      (_match, href: string, label: string) =>
        `[${plainTextOf(label)}](${href})`
    )
    .replaceAll(
      /<a\b[^>]*\bhref\s*=\s*'(?<href>[^']*)'[^>]*>(?<label>[\s\S]*?)<\/a>/giu,
      (_match, href: string, label: string) =>
        `[${plainTextOf(label)}](${href})`
    )
    .replaceAll(/<\/?(?:strong|b)>/giu, "**")
    .replaceAll(/<\/?(?:em|i)>/giu, "*")
    .replaceAll(
      /<kbd>(?<inner>[\s\S]*?)<\/kbd>/giu,
      (_match, inner: string) =>
        `${KEY_SENTINEL}K${escapeHtml(plainTextOf(inner))}${KEY_SENTINEL}`
    )
    .replaceAll(
      /<code>(?<inner>[\s\S]*?)<\/code>/giu,
      (_match, inner: string) => `\`${inner}\``
    )
    .replaceAll(/<\/?(?:span|small|div|p|li|ul|ol|dl|dt|dd)\b[^>]*>/giu, "");

const keyAt = (source: string, index: number): InlineToken | null => {
  if (!source.startsWith(`${KEY_SENTINEL}K`, index)) {
    return null;
  }

  const end = source.indexOf(KEY_SENTINEL, index + 2);

  return end > index
    ? { html: `<kbd>${source.slice(index + 2, end)}</kbd>`, next: end + 1 }
    : null;
};

const codeAt = (source: string, index: number): InlineToken | null => {
  if (characterAt(source, index) !== "`") {
    return null;
  }

  const end = source.indexOf("`", index + 1);

  return end > index
    ? {
        html: `<code>${escapeHtml(source.slice(index + 1, end))}</code>`,
        next: end + 1,
      }
    : null;
};

const strongAt = (
  source: string,
  index: number,
  depth: number,
  render: RenderInline
): InlineToken | null => {
  if (!source.startsWith("**", index)) {
    return null;
  }

  const end = source.indexOf("**", index + 2);

  return end > index
    ? {
        html: `<strong>${render(source.slice(index + 2, end), depth + 1)}</strong>`,
        next: end + 2,
      }
    : null;
};

const linkAt = (
  source: string,
  index: number,
  depth: number,
  render: RenderInline
): InlineToken | null => {
  const link = MARKDOWN_LINK.exec(source.slice(index));

  if (link === null) {
    return null;
  }

  const href = safeArticleHref(link.groups?.href ?? "");
  const label = render(link.groups?.label ?? "", depth + 1);

  const html =
    href === null
      ? escapeHtml(link[0])
      : `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;

  return { html, next: index + link[0].length };
};

const emphasisAt = (source: string, index: number): InlineToken | null => {
  if (
    characterAt(source, index) !== "*" ||
    characterAt(source, index + 1) === "*"
  ) {
    return null;
  }

  const end = source.indexOf("*", index + 1);
  const inner = source.slice(index + 1, end);

  return end > index + 1 &&
    characterAt(source, end + 1) !== "*" &&
    !inner.includes("\n")
    ? { html: `<em>${escapeHtml(inner)}</em>`, next: end + 1 }
    : null;
};

const bareLinkAt = (source: string, index: number): InlineToken | null => {
  const bare = BARE_URL.exec(source.slice(index));

  if (bare === null) {
    return null;
  }

  let [url] = bare;
  let trail = "";

  while (url !== "" && ".,;:!?".includes(url.at(-1) ?? "")) {
    trail = `${url.at(-1) ?? ""}${trail}`;
    url = url.slice(0, -1);
  }

  const href = safeArticleHref(url);

  const html =
    href === null
      ? escapeHtml(bare[0])
      : `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>${escapeHtml(trail)}`;

  return { html, next: index + bare[0].length };
};

const mediaTokenAt = (source: string, index: number): InlineToken | null => {
  const media = mediaAt(source, index);

  return media === null
    ? null
    : { html: media.html, next: index + media.length };
};

const renderInline = (text: string, depth = 0): string => {
  const source = inlineHtmlToMarkdown(text);

  if (depth > 4) {
    return escapeHtml(source);
  }

  const parts: string[] = [];
  let index = 0;

  while (index < source.length) {
    const token =
      keyAt(source, index) ??
      codeAt(source, index) ??
      strongAt(source, index, depth, renderInline) ??
      linkAt(source, index, depth, renderInline) ??
      emphasisAt(source, index) ??
      bareLinkAt(source, index) ??
      mediaTokenAt(source, index);

    if (token !== null) {
      parts.push(token.html);
      index = token.next;
      continue;
    }

    if (characterAt(source, index) === "<") {
      parts.push("&lt;");
      index += 1;
      continue;
    }

    const next = source.slice(index + 1).search(NEXT_TOKEN);
    const end = next === -1 ? source.length : index + 1 + next;

    parts.push(escapeHtml(source.slice(index, end)));
    index = end;
  }

  return parts.join("");
};

const splitRow = (line: string): string[] => {
  const text = line.trim();
  const cells: string[] = [];
  let current = "";

  for (let cursor = 0; cursor < text.length; cursor += 1) {
    const character = characterAt(text, cursor);

    if (character === "\\" && characterAt(text, cursor + 1) === "|") {
      current += "|";
      cursor += 1;
      continue;
    }

    if (character === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  if (current.trim() !== "" || !text.endsWith("|")) {
    cells.push(current.trim());
  }

  if (text.startsWith("|")) {
    cells.shift();
  }

  return cells;
};

const renderTable = (
  lines: readonly string[],
  index: number,
  render: RenderInline
): HtmlBlock => {
  const header = splitRow(lineAt(lines, index));
  const rows: string[][] = [];
  let next = index + 2;

  while (
    next < lines.length &&
    isTableRow(lineAt(lines, next)) &&
    !isSeparator(lineAt(lines, next))
  ) {
    rows.push(splitRow(lineAt(lines, next)));
    next += 1;
  }

  const head = `<thead><tr>${header.map((cell) => `<th>${render(cell, 0)}</th>`).join("")}</tr></thead>`;

  const body = rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${render(cell, 0)}</td>`).join("")}</tr>`
    )
    .join("");

  return { html: `<table>${head}<tbody>${body}</tbody></table>`, next };
};

const renderList = (
  lines: readonly string[],
  index: number,
  render: RenderInline
): HtmlBlock => {
  const ordered = /^[ \t]*\d+\.[ \t]+/u.test(lineAt(lines, index));
  const items: string[] = [];
  let next = index;

  while (next < lines.length && isListLine(lineAt(lines, next))) {
    const line = lineAt(lines, next);

    const same = ordered
      ? /^[ \t]*\d+\.[ \t]+/u.test(line)
      : /^[ \t]*[-*][ \t]+/u.test(line);

    if (!same) {
      break;
    }

    items.push(line.replace(/^[ \t]*(?:[-*]\s+|\d+\.\s+)/u, ""));
    next += 1;
  }

  const tag = ordered ? "ol" : "ul";
  const body = items.map((item) => `<li>${render(item, 0)}</li>`).join("");

  return { html: `<${tag}>${body}</${tag}>`, next };
};

const isBlockStart = (lines: readonly string[], index: number): boolean => {
  const line = lineAt(lines, index);

  if (line.trim() === "") {
    return false;
  }

  if (line.trim().startsWith("```")) {
    return true;
  }

  if (/^#{1,6}[ \t]+\S/u.test(line)) {
    return true;
  }

  if (/^>[ \t]?/u.test(line)) {
    return true;
  }

  if (isListLine(line)) {
    return true;
  }

  if (/^(?<mark>[-*_])\k<mark>{2,}[ \t]*$/u.test(line.trim())) {
    return true;
  }

  return isTableStart(lines, index);
};

const fenceAt = (lines: readonly string[], index: number): HtmlBlock | null => {
  if (!lineAt(lines, index).trim().startsWith("```")) {
    return null;
  }

  const code: string[] = [];
  let next = index + 1;

  while (next < lines.length && !lineAt(lines, next).trim().startsWith("```")) {
    code.push(lineAt(lines, next));
    next += 1;
  }

  if (next < lines.length) {
    next += 1;
  }

  return {
    html: `<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`,
    next,
  };
};

const renderMarkdown = (source: string): string => {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lineAt(lines, index);

    const fence = fenceAt(lines, index);

    if (fence !== null) {
      blocks.push(fence.html);
      index = fence.next;
      continue;
    }

    if (line.trim() === "") {
      index += 1;
      continue;
    }

    const heading = /^(?<hashes>#{1,6})[ \t]+(?<text>.+?)\s*#*$/u.exec(line);

    if (heading !== null) {
      const level = (heading.groups?.hashes ?? "").length;
      const headingTag = `h${String(level)}`;

      blocks.push(
        `<${headingTag}>${renderInline(heading.groups?.text ?? "")}</${headingTag}>`
      );
      index += 1;
      continue;
    }

    if (/^>[ \t]?/u.test(line)) {
      const quote: string[] = [];

      while (index < lines.length && /^>[ \t]?/u.test(lineAt(lines, index))) {
        quote.push(lineAt(lines, index).replace(/^>[ \t]?/u, ""));
        index += 1;
      }

      blocks.push(
        `<blockquote><p>${renderInline(quote.join(" "))}</p></blockquote>`
      );
      continue;
    }

    if (isTableStart(lines, index)) {
      const table = renderTable(lines, index, renderInline);

      blocks.push(table.html);
      index = table.next;
      continue;
    }

    if (isListLine(line)) {
      const list = renderList(lines, index, renderInline);

      blocks.push(list.html);
      index = list.next;
      continue;
    }

    if (/^(?<mark>[-*_])\k<mark>{2,}[ \t]*$/u.test(line.trim())) {
      blocks.push("<hr>");
      index += 1;
      continue;
    }

    const media = safeMediaHtml(line.trim());

    if (media !== null) {
      blocks.push(media);
      index += 1;
      continue;
    }

    const paragraph: string[] = [];

    while (
      index < lines.length &&
      lineAt(lines, index).trim() !== "" &&
      !isBlockStart(lines, index)
    ) {
      paragraph.push(lineAt(lines, index).trim());
      index += 1;
    }

    blocks.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
  }

  return blocks.join("\n");
};

const wrapArticleTables = (html: string): string =>
  html.replaceAll(
    /<table\b[^>]*>[\s\S]*?<\/table>/giu,
    (table) => `${TABLE_SCROLL_OPEN}${table}</div>`
  );

export const isHtmlHelpArticle = (content: string): boolean => {
  const trimmed = content.trim();

  if (trimmed === "") {
    return false;
  }

  if (/^#{1,6}[ \t]+\S/mu.test(content)) {
    return false;
  }

  if (/^```/mu.test(content)) {
    return false;
  }

  if (
    /^\|.*\|[ \t]*$/mu.test(content) &&
    /^\|?\s*:?-{3,}:?\s*\|/mu.test(content)
  ) {
    return false;
  }

  if (/^>[ \t]?\S/mu.test(content)) {
    return false;
  }

  return BLOCK_TAG.test(trimmed);
};

export const formatHelpArticleContent = (content: string): string => {
  if (content === "") {
    return "";
  }

  const html = isHtmlHelpArticle(content) ? content : renderMarkdown(content);

  return wrapArticleTables(html);
};
