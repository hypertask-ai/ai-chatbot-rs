const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const attr = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const hrefEntities = new Map([
  ["&amp;", "&"],
  ["&quot;", '"'],
  ["&#39;", "'"],
]);

const hrefEntity = /&(?:amp|quot|#39);/gu;

export const decodeHrefEntities = (value: string): string =>
  value.replaceAll(hrefEntity, (entity) => hrefEntities.get(entity) ?? entity);

const safeHref = (url: string): string | null => {
  const href = decodeHrefEntities(url);

  const lower = href.toLowerCase().replaceAll(/\s/gu, "");

  const allowed =
    lower.startsWith("https://") ||
    lower.startsWith("http://") ||
    lower.startsWith("mailto:") ||
    lower.startsWith("/help/");

  return allowed ? attr(href) : null;
};

const helpSlugFromUrl = (href: string): string | null => {
  const decoded = decodeHrefEntities(href);

  const match =
    /^(?:https?:\/\/help\.hypertask\.ai)?\/help\/(?<slug>[^/?#]+)\/?$/iu.exec(
      decoded
    );

  const slug = match?.groups?.slug;

  if (slug === undefined) {
    return null;
  }

  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
};

const anchorHtml = (url: string, text: string): string | null => {
  const href = safeHref(url);

  if (href === null) {
    return null;
  }

  const slug = helpSlugFromUrl(href);

  if (slug !== null) {
    return `<a href="${href}" data-help-slug="${attr(slug)}">${text}</a>`;
  }

  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
};

const tailEntities = /(?<entity>&gt;|&quot;|&#39;)$/u;

const bareUrl = /https?:\/\/[^\s<]+/gu;

const linkifyBareUrls = (value: string): string => {
  const parts = value.split(
    /(?<kept><a\b[^>]*>[\s\S]*?<\/a>|<code>[\s\S]*?<\/code>)/u
  );

  return parts
    .map((part) => {
      if (part.startsWith("<a ") || part.startsWith("<code>")) {
        return part;
      }

      return part.replaceAll(bareUrl, (raw) => {
        let url = raw;
        let trail = "";

        while (url.length > 0) {
          const entity = tailEntities.exec(url)?.groups?.entity;

          if (entity !== undefined) {
            trail = entity + trail;
            url = url.slice(0, -entity.length);
            continue;
          }

          const last = url.at(-1) ?? "";

          if (last === ")") {
            const opens = (url.match(/\(/gu) ?? []).length;
            const closes = (url.match(/\)/gu) ?? []).length;

            if (opens >= closes) {
              break;
            }
          } else if (!".,;:!?`".includes(last)) {
            break;
          }

          trail = last + trail;
          url = url.slice(0, -1);
        }

        const host = url.replace(/^https?:\/\//iu, "").split(/[/?#]/u)[0] ?? "";

        if (host === "") {
          return raw;
        }

        if (!host.includes(".") && host.toLowerCase() !== "localhost") {
          return raw;
        }

        const html = anchorHtml(url, url);

        return html === null ? raw : html + trail;
      });
    })
    .join("");
};

const inlineCode = /`(?<code>[^`\n]+)`/gu;

const inlineBold = /\*\*(?<bold>[^*]+)\*\*/gu;

const inlineLink = /\[(?<text>[^\]\n]+)\]\((?<url>[^)\s]+)\)?/gu;

const renderInline = (value: string): string => {
  const withCode = value.replaceAll(inlineCode, "<code>$<code></code>");
  const withBold = withCode.replaceAll(inlineBold, "<strong>$<bold></strong>");

  const withMarkdown = withBold.replaceAll(
    inlineLink,
    (match, text: string, url: string) => anchorHtml(url, text) ?? match
  );

  return linkifyBareUrls(withMarkdown);
};

const bulletBreak = /[ \t]+[-*]\s+(?=\*\*|[A-Z0-9])/gu;

const numberedBreak = /[ \t]+(?<digit>[1-9])\.\s+(?=[A-Z])/gu;

const normalizeAnswerLists = (value: string): string =>
  value
    .replaceAll(bulletBreak, "\n- ")
    .replaceAll(numberedBreak, "\n$<digit>. ");

const bulletLine = /^\s*[-*]\s+(?<item>.*)$/u;

const numberedLine = /^\s*\d+\.\s+(?<item>.*)$/u;

const renderFlow = (value: string): string => {
  const source = normalizeAnswerLists(value);
  const lines = escapeHtml(source).split("\n");
  const flow: string[] = [];
  let para: string[] = [];
  let list: "ol" | "ul" | null = null;

  const flushPara = (): void => {
    if (para.length === 0) {
      return;
    }

    flow.push(`<p>${para.join("<br>")}</p>`);
    para = [];
  };

  const closeList = (): void => {
    if (list === null) {
      return;
    }

    flow.push(list === "ul" ? "</ul>" : "</ol>");
    list = null;
  };

  for (const line of lines) {
    const bullet = bulletLine.exec(line)?.groups?.item;
    const numbered = numberedLine.exec(line)?.groups?.item;

    if (bullet !== undefined || numbered !== undefined) {
      flushPara();

      const kind = bullet === undefined ? "ol" : "ul";

      if (list !== null && list !== kind) {
        closeList();
      }

      if (list === null) {
        flow.push(kind === "ul" ? "<ul>" : "<ol>");
        list = kind;
      }

      const item = bullet ?? numbered ?? "";

      flow.push(`<li>${renderInline(item)}</li>`);
      continue;
    }

    if (line.trim() === "") {
      flushPara();
      closeList();
      continue;
    }

    closeList();
    para.push(renderInline(line));
  }

  flushPara();
  closeList();

  return flow.join("");
};

const openFence = /^\s*`{3,}(?<info>[^`]*)$/u;

const closeFence = /^\s*`{3,}\s*$/u;

const fenceLanguage = (token: string): string => {
  const language = token.trim().split(/\s+/u)[0] ?? "";

  return /^[A-Za-z0-9_+#.-]+$/u.test(language) ? language : "";
};

const renderFencedCode = (block: Readonly<{ lang: string; text: string }>) => {
  const body = escapeHtml(block.text);

  return block.lang === ""
    ? `<pre><code>${body}</code></pre>`
    : `<pre><code class="language-${attr(block.lang)}">${body}</code></pre>`;
};

type FenceBlock =
  | Readonly<{ lang: string; text: string; type: "code" }>
  | Readonly<{ text: string; type: "text" }>;

const splitFencedBlocks = (value: string): readonly FenceBlock[] => {
  const lines = value.split("\n");
  const blocks: FenceBlock[] = [];
  let text: string[] = [];
  let code: string[] | null = null;
  let lang = "";

  const flushText = (): void => {
    if (text.length === 0) {
      return;
    }

    blocks.push({ text: text.join("\n"), type: "text" });
    text = [];
  };

  for (const line of lines) {
    if (code !== null) {
      if (closeFence.test(line)) {
        blocks.push({ lang, text: code.join("\n"), type: "code" });
        code = null;
        lang = "";
      } else {
        code.push(line);
      }

      continue;
    }

    const open = openFence.exec(line)?.groups?.info;

    if (open !== undefined) {
      flushText();
      code = [];
      lang = fenceLanguage(open);
      continue;
    }

    text.push(line);
  }

  if (code === null) {
    flushText();
  } else {
    blocks.push({ lang, text: code.join("\n"), type: "code" });
  }

  return blocks;
};

export const renderChatMarkdown = (text: string): string =>
  splitFencedBlocks(text.replaceAll("\r\n", "\n"))
    .map((block) =>
      block.type === "code" ? renderFencedCode(block) : renderFlow(block.text)
    )
    .join("");
