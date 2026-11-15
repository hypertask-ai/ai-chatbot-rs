import { defineContract } from "@rat-stack/capability/contract";
import { Schema } from "effect";

import {
  AdminConversationDetail,
  AdminCustomerConversation,
  AdminInboxItem,
} from "./admin-conversation-store.js";
import { AdminUsageReport } from "./admin-usage.js";

export const NoConversationIds = Schema.Struct({
  error: Schema.Literal("No conversation IDs provided"),
}).annotate({ httpApiStatus: 400 });

export type NoConversationIdsValue = typeof NoConversationIds.Type;

export const NoCustomerEmail = Schema.Struct({
  error: Schema.Literal("Email parameter required"),
}).annotate({ httpApiStatus: 400 });

export type NoCustomerEmailValue = typeof NoCustomerEmail.Type;

const ConversationId = Schema.Struct({ id: Schema.String });

const HumanConversation = Schema.Struct({ status: Schema.Literal("human") });

const ClosedConversation = Schema.Struct({ status: Schema.Literal("closed") });

const ArchivedConversation = Schema.Struct({ archived: Schema.Literal(true) });

const UnarchivedConversation = Schema.Struct({
  archived: Schema.Literal(false),
});

const BulkArchived = Schema.Struct({
  archived: Schema.Literal(true),
  count: Schema.Finite,
});

const SentMessage = Schema.Struct({ id: Schema.String });

export const listAdminConversationsContract = defineContract(
  "listAdminConversations",
  {
    annotations: { idempotent: true, readOnly: true },
    description:
      "List the fifty most recent conversations, handoff requests first, with the last message and the unread flag for each",
    failure: Schema.Never,
    http: { method: "GET", path: "/conversations" },
    input: Schema.Struct({
      archived: Schema.optional(Schema.String),
      lastSeen: Schema.optional(Schema.String),
    }),
    output: Schema.Array(AdminInboxItem),
  }
);

export const archiveAdminConversationsContract = defineContract(
  "archiveAdminConversations",
  {
    annotations: { destructive: true, idempotent: true },
    description: "Archive several conversations in one write",
    failure: NoConversationIds,
    http: { method: "POST", path: "/conversations/bulk/archive" },
    input: Schema.Struct({ ids: Schema.optional(Schema.Json) }),
    output: BulkArchived,
  }
);

export const readAdminConversationContract = defineContract(
  "readAdminConversation",
  {
    annotations: { idempotent: true, readOnly: true },
    description:
      "Read one conversation with every message in the order it was written",
    failure: Schema.Never,
    http: { method: "GET", path: "/conversations/:id" },
    input: ConversationId,
    output: AdminConversationDetail,
  }
);

export const acceptAdminConversationContract = defineContract(
  "acceptAdminConversation",
  {
    annotations: { idempotent: true },
    description:
      "Accept a handoff request and mark the conversation as handled by a person",
    failure: Schema.Never,
    http: { method: "POST", path: "/conversations/:id/accept" },
    input: ConversationId,
    output: HumanConversation,
  }
);

export const takeoverAdminConversationContract = defineContract(
  "takeoverAdminConversation",
  {
    annotations: { idempotent: true },
    description:
      "Take a conversation over from the bot before the visitor asks for a person",
    failure: Schema.Never,
    http: { method: "POST", path: "/conversations/:id/takeover" },
    input: ConversationId,
    output: HumanConversation,
  }
);

export const replyToAdminConversationContract = defineContract(
  "replyToAdminConversation",
  {
    annotations: { openWorld: true },
    description:
      "Write an admin reply into one conversation and mark it as touched",
    failure: Schema.Never,
    http: { method: "POST", path: "/conversations/:id/message" },
    input: Schema.Struct({ content: Schema.String, id: Schema.String }),
    output: SentMessage,
  }
);

export const closeAdminConversationContract = defineContract(
  "closeAdminConversation",
  {
    annotations: { idempotent: true },
    description: "Close a conversation",
    failure: Schema.Never,
    http: { method: "POST", path: "/conversations/:id/close" },
    input: ConversationId,
    output: ClosedConversation,
  }
);

export const archiveAdminConversationContract = defineContract(
  "archiveAdminConversation",
  {
    annotations: { destructive: true, idempotent: true },
    description: "Move one conversation to the archive",
    failure: Schema.Never,
    http: { method: "POST", path: "/conversations/:id/archive" },
    input: ConversationId,
    output: ArchivedConversation,
  }
);

export const unarchiveAdminConversationContract = defineContract(
  "unarchiveAdminConversation",
  {
    annotations: { idempotent: true },
    description: "Move one conversation back to the inbox",
    failure: Schema.Never,
    http: { method: "POST", path: "/conversations/:id/unarchive" },
    input: ConversationId,
    output: UnarchivedConversation,
  }
);

export const readAdminUsageContract = defineContract("readAdminUsage", {
  annotations: { idempotent: true, readOnly: true },
  description:
    "Report Haiku messages, tokens and cost per day and model for the last days window",
  failure: Schema.Never,
  http: { method: "GET", path: "/usage" },
  input: Schema.Struct({ days: Schema.optional(Schema.String) }),
  output: AdminUsageReport,
});

export const listCustomerConversationsContract = defineContract(
  "listCustomerConversations",
  {
    annotations: { idempotent: true, readOnly: true },
    description:
      "List every conversation one visitor email has had, newest first, with the first message",
    failure: NoCustomerEmail,
    http: { method: "GET", path: "/customers/conversations" },
    input: Schema.Struct({ email: Schema.optional(Schema.String) }),
    output: Schema.Array(AdminCustomerConversation),
  }
);
