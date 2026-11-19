import { Context, Schema } from "effect";
import type { Effect } from "effect";

export const ChatCitationSchema = Schema.Struct({
  slug: Schema.String,
  title: Schema.String,
  url: Schema.String,
});

export type ChatCitation = typeof ChatCitationSchema.Type;

export interface ChatCitationsOperations {
  readonly sourcesFor: (
    answer: string
  ) => Effect.Effect<readonly ChatCitation[]>;
}

export class ChatCitations extends Context.Service<
  ChatCitations,
  ChatCitationsOperations
>()("@rat-stack/core/ChatCitations") {}
