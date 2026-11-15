export const appOrigin = "https://hypertask.ai";

export const docsUrl = "https://docs.hypertask.ai/";

export const loginUrl = "https://app.hypertask.ai/login";

export const helpCenterUrl = "/help";

export const helpCenterTitle = "Help Center - Hypertask";

export const heroTitle = "How can we help?";

export const heroSubtitle =
  "Ask Hyper AI. It answers from our help articles and hands off to a person.";

export const chatLabel = "Hyper AI \u00B7 answers from our docs";

export const heroMessageLabel = "Your question";

export const heroMessagePlaceholder = "Describe your question or problem\u2026";

export const attachLabel = "\u2398 Attach images";

export const sendLabel = "Send message";

export const menuLabel = "Menu";

export const menuGlyph = "\u2630";

export const clearSearchGlyph = "\u00D7";

export const headerLinks = [{ href: docsUrl, label: "Docs" }] as const;

export const openAppLabel = "Open app";

export const suggestions = [
  {
    desktop: "Connect Claude to my board",
    message: "Connect Claude to my board",
    mobile: "Connect Claude",
  },
  { desktop: "Change my plan", message: "Change my plan", mobile: null },
  { desktop: "Invite a teammate", message: "Invite a teammate", mobile: null },
] as const;

export const topicsHeading = "Or browse topics";

export const allArticlesLabel = "All articles \u2192";

export const topics = [
  ["Getting Started", "Sign up, first board, invite your team."],
  ["Agents", "Connect Claude, Codex or Cursor over MCP."],
  ["Boards & tickets", "Sections, labels, views and filters."],
  ["Collaboration & billing", "Seats, plans, invoices and BYOK."],
  ["AI & Productivity", "Hyper AI, triage and summaries."],
  ["Features & How-To", "Step-by-step guides for common jobs."],
  ["Keyboard Shortcuts", "Every shortcut in one place."],
  ["Settings & Preferences", "Profile, notifications and themes."],
] as const;

export const browserTitle = "All articles";

export const searchPlaceholder = "Search for articles...";

export const searchLabel = "Search articles";

export const clearSearchLabel = "Clear search";

export const footerLinks = [
  { href: appOrigin, label: "Home" },
  { href: `${appOrigin}/pricing/`, label: "Pricing" },
  { href: `${appOrigin}/blog/`, label: "Blog" },
  { href: docsUrl, label: "Docs" },
  { href: helpCenterUrl, label: "Help" },
  { href: `${appOrigin}/changelog/`, label: "Changelog" },
  { href: `${appOrigin}/privacy/`, label: "Privacy" },
  { href: `${appOrigin}/terms/`, label: "Terms" },
  { href: `${appOrigin}/contact/`, label: "Contact" },
] as const;

export const copyright = "\u00A9 2026 Hypertask Lab Ltd.";

export const readerBackLabel = "Back to articles";

export const articleHeaderNav = [
  { href: `${appOrigin}/pricing/`, label: "Pricing" },
  { href: `${appOrigin}/blog/`, label: "Blog" },
  { href: docsUrl, label: "Docs" },
  { href: helpCenterUrl, label: "Help" },
] as const;

export const loginLabel = "Login";

export const startFreeLabel = "Start Free";

export const backToHelpCenterLabel = "Back to Help Center";

export const articleSearchLabel = "Search";

export const feedbackQuestion = "Was this article helpful?";

export const feedbackYesLabel = "Yes";

export const feedbackNoLabel = "No";

export const feedbackThanksLabel = "Thanks for the feedback!";

export const relatedTitle = "Related Articles";

export const articleTitleSuffix = "Help Center - Hypertask";
