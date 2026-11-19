export const starterSuggestions = [
  "Connect Claude to my board",
  "Invite my team",
  "Change my plan",
] as const;

export type ArticleBubble = Readonly<{
  bubble: string;
  prompt: string;
}>;

export const articleBubbles = new Map<string, ArticleBubble>([
  [
    "troubleshooting-email-login-magic-link",
    { bubble: "Still having trouble logging in?", prompt: "I can't log in" },
  ],
  [
    "troubleshooting-google-workspace-login",
    {
      bubble: "Google login not working?",
      prompt: "Google sign-in isn't working",
    },
  ],
]);

export const articleBubbleFor = (
  articleSlug: string | null
): ArticleBubble | undefined =>
  articleSlug === null ? undefined : articleBubbles.get(articleSlug);
