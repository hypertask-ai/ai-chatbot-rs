import { Option, Schema } from "effect";

export const HelpOpenArticle = Schema.Struct({
  slug: Schema.NonEmptyString,
  type: Schema.Literal("help-open-article"),
});

export interface ChatMessage {
  readonly data: unknown;
  readonly origin: string;
}

const decodeOpenArticle = Schema.decodeUnknownOption(HelpOpenArticle);

export const chatArticleSlugOf = (
  message: ChatMessage,
  origin: string
): Option.Option<string> =>
  message.origin === origin
    ? Option.map(decodeOpenArticle(message.data), (open) => open.slug)
    : Option.none();
