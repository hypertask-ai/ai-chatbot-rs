import { defineContract } from "@rat-stack/capability/contract";
import { implement } from "@rat-stack/capability/implement";
import { Effect, Schema } from "effect";

import { ChatConfig } from "./chat-config.js";
import { ChatReadForbidden, ChatReadUnauthorized } from "./chat-contracts.js";
import { ChatConversationStore } from "./chat-conversation-store.js";
import type { ChatConversation } from "./chat-conversation-store.js";
import {
  ChatMessageRoleSchema,
  ChatMessageStore,
} from "./chat-message-store.js";
import type { ChatMessage } from "./chat-message-store.js";
import { chatReadGrant } from "./chat-read-access.js";
import { ChatVisitorAuth } from "./chat-visitor-auth.js";
import { ConversationStatusSchema } from "./conversation-machine.js";

export const ChatHistoryMessageSchema = Schema.Struct({
  content: Schema.String,
  created_at: Schema.Natural,
  id: Schema.String,
  role: ChatMessageRoleSchema,
});

export const ChatHistoryAnswerSchema = Schema.Struct({
  messages: Schema.Array(ChatHistoryMessageSchema),
  status: Schema.optionalKey(ConversationStatusSchema),
});

export type ChatHistoryAnswer = typeof ChatHistoryAnswerSchema.Type;

export const ChatSessionSchema = Schema.Struct({
  created_at: Schema.Natural,
  id: Schema.String,
  last_message: Schema.NullOr(Schema.String),
  status: ConversationStatusSchema,
  updated_at: Schema.Natural,
});

export type ChatSession = typeof ChatSessionSchema.Type;

export const ChatSessionsAnswerSchema = Schema.Struct({
  sessions: Schema.Array(ChatSessionSchema),
});

export type ChatSessionsAnswer = typeof ChatSessionsAnswerSchema.Type;

export const readChatHistoryContract = defineContract("readChatHistory", {
  annotations: { idempotent: true, readOnly: true },
  description:
    "Read one conversation's messages and status for the visitor who owns it, or for an admin.",
  failure: Schema.Union([ChatReadUnauthorized, ChatReadForbidden]),
  http: { method: "GET", path: "/api/chat/history/:conversationId" },
  input: Schema.Struct({ conversationId: Schema.String }),
  output: ChatHistoryAnswerSchema,
});

export const listChatSessionsContract = defineContract("listChatSessions", {
  annotations: { idempotent: true, readOnly: true },
  description:
    "Read one visitor's recent conversations, newest first, for that visitor or for an admin.",
  failure: Schema.Union([ChatReadUnauthorized, ChatReadForbidden]),
  http: { method: "GET", path: "/api/chat/sessions/:visitorId" },
  input: Schema.Struct({ visitorId: Schema.String }),
  output: ChatSessionsAnswerSchema,
});

const ascendingBySecond = (left: ChatMessage, right: ChatMessage): number =>
  left.createdAt - right.createdAt;

const newestMessage = (
  transcript: readonly ChatMessage[]
): ChatMessage | undefined => {
  let newest: ChatMessage | undefined;

  for (const message of transcript) {
    if (newest === undefined || message.createdAt > newest.createdAt) {
      newest = message;
    }
  }

  return newest;
};

const historyAnswer = (
  transcript: readonly ChatMessage[],
  conversation: ChatConversation | undefined
): ChatHistoryAnswer => {
  const messages = [...transcript]
    .toSorted(ascendingBySecond)
    .map((message) => ({
      content: message.content,
      created_at: message.createdAt,
      id: message.id,
      role: message.role,
    }));

  return conversation === undefined
    ? { messages }
    : { messages, status: conversation.status };
};

const sessionOf = (
  conversation: ChatConversation,
  transcript: readonly ChatMessage[]
): ChatSession => ({
  created_at: conversation.createdAt,
  id: conversation.id,
  last_message: newestMessage(transcript)?.content ?? null,
  status: conversation.status,
  updated_at: conversation.updatedAt,
});

export const readChatHistory = implement(readChatHistoryContract, (input) =>
  Effect.gen(function* readChatHistoryEffect() {
    const conversations = yield* ChatConversationStore;
    const messages = yield* ChatMessageStore;
    const auth = yield* ChatVisitorAuth;
    const config = yield* ChatConfig;

    const grant = yield* chatReadGrant({
      adminPassword: config.adminPassword,
      authorization: auth.authorization,
      conversationId: input.conversationId,
      conversations,
    });

    const conversation = yield* conversations.read(grant.conversationId);
    const transcript = yield* messages.list(grant.conversationId);

    return historyAnswer(transcript, conversation);
  })
);

export const listChatSessions = implement(listChatSessionsContract, (input) =>
  Effect.gen(function* listChatSessionsEffect() {
    const conversations = yield* ChatConversationStore;
    const messages = yield* ChatMessageStore;
    const auth = yield* ChatVisitorAuth;
    const config = yield* ChatConfig;

    const grant = yield* chatReadGrant({
      adminPassword: config.adminPassword,
      authorization: auth.authorization,
      conversations,
      visitorId: input.visitorId,
    });

    const recent = yield* conversations.listRecentForVisitor({
      secretHash: grant.visitorSecretHash,
      visitorId: grant.visitorId,
    });

    const sessions = yield* Effect.forEach([...recent], (conversation) =>
      messages
        .list(conversation.id)
        .pipe(Effect.map((transcript) => sessionOf(conversation, transcript)))
    );

    return { sessions };
  })
);
