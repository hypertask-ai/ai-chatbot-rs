import { Context, Effect, Schema } from "effect";

export const HandoffAlertSchema = Schema.Struct({
  conversationId: Schema.String,
  isEval: Schema.Boolean,
  visitorEmail: Schema.NullOr(Schema.String),
  visitorName: Schema.NullOr(Schema.String),
});

export type HandoffAlert = typeof HandoffAlertSchema.Type;

export const NewConversationAlertSchema = Schema.Struct({
  conversationId: Schema.String,
  isEval: Schema.Boolean,
  message: Schema.UndefinedOr(Schema.String),
});

export type NewConversationAlert = typeof NewConversationAlertSchema.Type;

export const NewMessageAlertSchema = Schema.Struct({
  conversationId: Schema.String,
  isEval: Schema.Boolean,
  message: Schema.String,
  visitorEmail: Schema.NullOr(Schema.String),
  visitorName: Schema.NullOr(Schema.String),
});

export type NewMessageAlert = typeof NewMessageAlertSchema.Type;

export type CustomerAlert =
  | { readonly alert: HandoffAlert; readonly type: "handoff_requested" }
  | { readonly alert: NewConversationAlert; readonly type: "new_conversation" }
  | { readonly alert: NewMessageAlert; readonly type: "new_message" };

export interface CustomerAlertOperations {
  readonly handoffRequested: (alert: HandoffAlert) => Effect.Effect<boolean>;
  readonly newConversation: (
    alert: NewConversationAlert
  ) => Effect.Effect<boolean>;
  readonly newMessage: (alert: NewMessageAlert) => Effect.Effect<boolean>;
}

export const raiseCustomerAlert = (
  alert: Effect.Effect<boolean>
): Effect.Effect<boolean> =>
  Effect.catchCause(alert, () => Effect.succeed(false));

export class CustomerAlerts extends Context.Service<
  CustomerAlerts,
  CustomerAlertOperations
>()("@rat-stack/core/CustomerAlerts") {}
