import { formatHelpArticleContent } from "./help-article-html.js";
import type { HelpArticleValue } from "./help-article-store.js";
import { helpPlansHtml } from "./help-plans.js";

export const helpArticlePane = (article: HelpArticleValue) => ({
  category: article.category ?? "",
  excerpt: article.excerpt ?? "",
  html: formatHelpArticleContent(article.content),
  plansHtml: helpPlansHtml(article.slug),
  slug: article.slug,
  title: article.title,
});
