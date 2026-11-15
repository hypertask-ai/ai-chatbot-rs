import { Context, Effect, Schema } from "effect";

import type { UsageDayRowValue } from "./admin-usage.js";

export const AdminConversationRow = Schema.Struct({
  archived: Schema.NullOr(Schema.Finite),
  created_at: Schema.NullOr(Schema.Finite),
  has_hypertask_account: Schema.NullOr(Schema.String),
  id: Schema.String,
  is_eval: Schema.NullOr(Schema.Finite),
  profile_completed: Schema.NullOr(Schema.Finite),
  status: Schema.NullOr(Schema.String),
  updated_at: Schema.NullOr(Schema.Finite),
  visitor_email: Schema.NullOr(Schema.String),
  visitor_id: Schema.String,
  visitor_name: Schema.NullOr(Schema.String),
});

export type AdminConversationRowValue = typeof AdminConversationRow.Type;

export const AdminMessageRow = Schema.Struct({
  cache_creation_input_tokens: Schema.NullOr(Schema.Finite),
  cache_read_input_tokens: Schema.NullOr(Schema.Finite),
  content: Schema.String,
  conversation_id: Schema.String,
  created_at: Schema.NullOr(Schema.Finite),
  id: Schema.String,
  input_tokens: Schema.NullOr(Schema.Finite),
  model: Schema.NullOr(Schema.String),
  output_tokens: Schema.NullOr(Schema.Finite),
  role: Schema.String,
});

export type AdminMessageRowValue = typeof AdminMessageRow.Type;

export const AdminInboxRow = Schema.Struct({
  ...AdminConversationRow.fields,
  last_message: Schema.NullOr(Schema.String),
  last_message_role: Schema.NullOr(Schema.String),
  last_message_time: Schema.NullOr(Schema.Finite),
  message_count: Schema.Finite,
});

export type AdminInboxRowValue = typeof AdminInboxRow.Type;

export const AdminInboxItem = Schema.Struct({
  ...AdminInboxRow.fields,
  has_new_message: Schema.Boolean,
});

export type AdminInboxItemValue = typeof AdminInboxItem.Type;

export const AdminCustomerConversation = Schema.Struct({
  ...AdminConversationRow.fields,
  first_message: Schema.NullOr(Schema.String),
  message_count: Schema.Finite,
});

export type AdminCustomerConversationValue =
  typeof AdminCustomerConversation.Type;

export const AdminConversationDetail = Schema.Struct({
  conversation: Schema.NullOr(AdminConversationRow),
  messages: Schema.Array(AdminMessageRow),
});

export type AdminConversationDetailValue = typeof AdminConversationDetail.Type;

export interface AdminInboxQuery {
  readonly archived: boolean;
}

export interface AdminStatusChange {
  readonly at: number;
  readonly id: string;
  readonly status: "closed" | "human";
}

export interface AdminArchivedChange {
  readonly archived: boolean;
  readonly at: number;
  readonly id: string;
}

export interface AdminArchiveManyChange {
  readonly at: number;
  readonly ids: readonly string[];
}

export interface AdminTouchChange {
  readonly at: number;
  readonly id: string;
}

export interface AdminMessageSeed {
  readonly content: string;
  readonly conversationId: string;
  readonly id: string;
}

export interface AdminConversationOperations {
  readonly archiveMany: (change: AdminArchiveManyChange) => Effect.Effect<void>;
  readonly appendMessage: (message: AdminMessageSeed) => Effect.Effect<void>;
  readonly listCustomer: (
    email: string
  ) => Effect.Effect<readonly AdminCustomerConversationValue[]>;
  readonly listInbox: (
    query: AdminInboxQuery
  ) => Effect.Effect<readonly AdminInboxRowValue[]>;
  readonly listMessages: (
    conversationId: string
  ) => Effect.Effect<readonly AdminMessageRowValue[]>;
  readonly readConversation: (
    id: string
  ) => Effect.Effect<AdminConversationRowValue | undefined>;
  readonly setArchived: (change: AdminArchivedChange) => Effect.Effect<void>;
  readonly setStatus: (change: AdminStatusChange) => Effect.Effect<void>;
  readonly setUpdatedAt: (change: AdminTouchChange) => Effect.Effect<void>;
  readonly usageRows: (
    since: number
  ) => Effect.Effect<readonly UsageDayRowValue[]>;
}

export class AdminConversationStore extends Context.Service<
  AdminConversationStore,
  AdminConversationOperations
>()("@rat-stack/core/AdminConversationStore") {}
