import { Schema } from "effect";
import { defineTaggedUnion } from "foldkit/schema";

import { HelpArticlePage, ReaderPhase } from "./model.js";
import type { ReaderPhaseValue } from "./model.js";

export const readerMessageCases = {
  ReaderClosed: {},
  ReaderFailed: { slug: Schema.String },
  ReaderLoaded: { article: HelpArticlePage, slug: Schema.String },
  ReaderOpened: { slug: Schema.String, wide: Schema.Boolean },
  ReaderViewportChanged: { wide: Schema.Boolean },
};

export const ReaderEvent = defineTaggedUnion(readerMessageCases);

export type ReaderEventValue = typeof ReaderEvent.Type;

export interface ReaderStep {
  readonly phase: ReaderPhaseValue;
  readonly reads?: readonly string[];
}

const unchanged = (phase: ReaderPhaseValue): ReaderStep => ({ phase });

const loading = (slug: string, wide: boolean): ReaderStep => ({
  phase: ReaderPhase.Loading({ slug, wide }),
  reads: [slug],
});

const sized = (phase: ReaderPhaseValue, wide: boolean): ReaderPhaseValue =>
  ReaderPhase.match(phase, {
    Closed: () => ReaderPhase.Closed(),
    Failed: () => ReaderPhase.Failed({ wide }),
    Loading: ({ slug }) => ReaderPhase.Loading({ slug, wide }),
    Open: ({ article }) => ReaderPhase.Open({ article, wide }),
  });

export const readerStep = (
  phase: ReaderPhaseValue,
  event: ReaderEventValue
): ReaderStep =>
  ReaderEvent.match<ReaderStep>(event, {
    ReaderClosed: () =>
      unchanged(
        ReaderPhase.guards.Closed(phase) ? phase : ReaderPhase.Closed()
      ),
    ReaderFailed: ({ slug }) =>
      ReaderPhase.guards.Loading(phase) && phase.slug === slug
        ? unchanged(ReaderPhase.Failed({ wide: phase.wide }))
        : unchanged(phase),
    ReaderLoaded: ({ article, slug }) =>
      ReaderPhase.guards.Loading(phase) && phase.slug === slug
        ? unchanged(ReaderPhase.Open({ article, wide: phase.wide }))
        : unchanged(phase),
    ReaderOpened: ({ slug, wide }) => loading(slug, wide),
    ReaderViewportChanged: ({ wide }) =>
      ReaderPhase.guards.Closed(phase)
        ? unchanged(phase)
        : unchanged(sized(phase, wide)),
  });

export const readerHidesLibrary = (phase: ReaderPhaseValue): boolean =>
  !ReaderPhase.guards.Closed(phase) && phase.wide;
