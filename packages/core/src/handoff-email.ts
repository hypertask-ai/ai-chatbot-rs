import { Context, Effect, Schema } from "effect";

export const HandoffEmailMessageSchema = Schema.Struct({
  conversationId: Schema.String,
  from: Schema.String,
  replyTo: Schema.String,
  subject: Schema.String,
  text: Schema.String,
  to: Schema.String,
});

export type HandoffEmailMessage = typeof HandoffEmailMessageSchema.Type;

export interface HandoffEmailOperations {
  readonly deliver: (message: HandoffEmailMessage) => Effect.Effect<boolean>;
}

export class HandoffEmail extends Context.Service<
  HandoffEmail,
  HandoffEmailOperations
>()("@rat-stack/core/HandoffEmail") {}
