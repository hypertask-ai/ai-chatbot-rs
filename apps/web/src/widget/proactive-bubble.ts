import { proactiveDismissPrefix } from "./storage.js";
import { articleBubbleFor } from "./suggestions.js";

export const proactiveBubbleDelayMs = 3000;

export const proactiveDismissKey = (slug: string): string =>
  `${proactiveDismissPrefix}${slug}`;

export type ProactiveBubbleLoad = Readonly<{
  docked: boolean;
  dismissed: boolean;
  slug: string | null;
}>;

export type ProactiveBubbleShow = ProactiveBubbleLoad &
  Readonly<{ open: boolean }>;

const hasBubble = (slug: string | null): boolean =>
  slug !== null && articleBubbleFor(slug) !== undefined;

export const proactiveBubbleOffered = (load: ProactiveBubbleLoad): boolean =>
  !load.docked && !load.dismissed && hasBubble(load.slug);

export const proactiveBubbleShown = (show: ProactiveBubbleShow): boolean =>
  proactiveBubbleOffered(show) && !show.open;
