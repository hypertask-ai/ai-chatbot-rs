import { Context, Schema } from "effect";
import type { Effect } from "effect";

export const HandoffAlertSchema = Schema.Struct({
  conversationId: Schema.String,
  isEval: Schema.Boolean,
  visitorEmail: Schema.NullOr(Schema.String),
  visitorName: Schema.NullOr(Schema.String),
});

export type HandoffAlert = typeof HandoffAlertSchema.Type;

export interface CustomerAlertOperations {
  readonly handoffRequested: (alert: HandoffAlert) => Effect.Effect<boolean>;
}

export class CustomerAlerts extends Context.Service<
  CustomerAlerts,
  CustomerAlertOperations
>()("@rat-stack/core/CustomerAlerts") {}
