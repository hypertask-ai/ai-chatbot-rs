import { siteBasePath, sitePath } from "../site-base-path.js";

export const widgetEmbedOrigins = [
  "https://hypertask.ai",
  "https://www.hypertask.ai",
  "https://docs.hypertask.ai",
] as const;

export const widgetFrameAncestors = `frame-ancestors 'self' ${widgetEmbedOrigins.join(" ")}`;

export const widgetChatHeaders = {
  "cache-control": "no-store",
  "content-security-policy": widgetFrameAncestors,
};

export const widgetScriptHeaders = {
  "cache-control": "public, max-age=3600",
  "content-type": "application/javascript",
};

export const widgetChatPath = "/widget/chat";

export const widgetScriptPath = "/widget/widget.js";

export const widgetScriptAssetPath = `${siteBasePath}${widgetScriptPath}`;

export const widgetScriptBuildFileName = widgetScriptPath.replace(/^\//u, "");

export const isWidgetChatPath = (pathname: string): boolean =>
  pathname === sitePath(widgetChatPath);

export const widgetScriptAssetHeaders = `${widgetScriptAssetPath}\n  Content-Type: ${widgetScriptHeaders["content-type"]}\n  Cache-Control: ${widgetScriptHeaders["cache-control"]}\n`;
