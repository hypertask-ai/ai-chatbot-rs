import { Context, Effect, Ref, Schema } from "effect";

import {
  ConversationStatusSchema,
  VisitorAccountSchema,
} from "./conversation-machine.js";
import type {
  ConversationState,
  VisitorAccount,
} from "./conversation-machine.js";

export const ChatConversationSchema = Schema.Struct({
  archived: Schema.Boolean,
  email: Schema.UndefinedOr(Schema.String),
  hasAccount: VisitorAccountSchema,
  id: Schema.String,
  isEval: Schema.Boolean,
  name: Schema.UndefinedOr(Schema.String),
  profileCompleted: Schema.Boolean,
  status: ConversationStatusSchema,
  updatedAt: Schema.Natural,
  visitorId: Schema.optionalKey(Schema.String),
});

export type ChatConversation = typeof ChatConversationSchema.Type;

export const ChatConversationSeedSchema = Schema.Struct({
  ...ChatConversationSchema.fields,
  visitorSecretHash: Schema.UndefinedOr(Schema.String),
});

export type ChatConversationSeed = typeof ChatConversationSeedSchema.Type;

export const ReturningCustomerSchema = Schema.Struct({
  hasAccount: VisitorAccountSchema,
  name: Schema.String,
});

export type ReturningCustomer = typeof ReturningCustomerSchema.Type;

export interface ReturningCustomerQuery {
  readonly email: string;
  readonly excludeId: string;
}

export interface VisitorConversationQuery {
  readonly id: string;
  readonly secretHash: string;
}

export interface ChatProfileChange {
  readonly at: number;
  readonly email: string | undefined;
  readonly hasAccount: VisitorAccount | undefined;
  readonly id: string;
  readonly markProfileCompleted: boolean;
  readonly name: string | undefined;
}

export interface ChatHandoffEmailChange {
  readonly at: number;
  readonly email: string;
  readonly id: string;
  readonly repeatWindowSeconds: number;
  readonly secretHash: string;
}

export interface ChatHandoffChange {
  readonly at: number;
  readonly id: string;
}

export interface ChatConversationTouch {
  readonly at: number;
  readonly id: string;
}

export interface VisitorSecretQuery {
  readonly secretHash: string;
  readonly visitorId: string;
}

export type ChatHandoffEmailOutcome = "not_found" | "saved" | "too_soon";

export interface ChatConversationOperations {
  readonly create: (seed: ChatConversationSeed) => Effect.Effect<void>;
  readonly findReturningCustomer: (
    query: ReturningCustomerQuery
  ) => Effect.Effect<ReturningCustomer | undefined>;
  readonly read: (id: string) => Effect.Effect<ChatConversation | undefined>;
  readonly readAsVisitor: (
    query: VisitorConversationQuery
  ) => Effect.Effect<ChatConversation | undefined>;
  readonly requestHandoffEmail: (
    change: ChatHandoffEmailChange
  ) => Effect.Effect<ChatHandoffEmailOutcome>;
  readonly saveProfile: (change: ChatProfileChange) => Effect.Effect<void>;
  readonly setHandoffRequested: (
    change: ChatHandoffChange
  ) => Effect.Effect<void>;
  readonly touch: (change: ChatConversationTouch) => Effect.Effect<void>;
  readonly visitorOwnsSecret: (
    query: VisitorSecretQuery
  ) => Effect.Effect<boolean>;
}

export class ChatConversationStore extends Context.Service<
  ChatConversationStore,
  ChatConversationOperations
>()("@rat-stack/core/ChatConversationStore") {}

export const conversationStateOf = (
  conversation: ChatConversation
): ConversationState => ({
  archived: conversation.archived,
  profile: {
    account: conversation.hasAccount,
    email: conversation.email,
    name: conversation.name,
  },
  status: conversation.status,
  updatedAt: conversation.updatedAt,
});

interface MemoryConversation {
  readonly conversation: ChatConversation;
  readonly visitorSecretHash: string | undefined;
}

const seedConversation = (seed: ChatConversationSeed): ChatConversation => ({
  archived: seed.archived,
  email: seed.email,
  hasAccount: seed.hasAccount,
  id: seed.id,
  isEval: seed.isEval,
  name: seed.name,
  profileCompleted: seed.profileCompleted,
  status: seed.status,
  updatedAt: seed.updatedAt,
  visitorId: seed.visitorId,
});

const newestReturningCustomer = (
  held: ReadonlyMap<string, MemoryConversation>,
  query: ReturningCustomerQuery
): ReturningCustomer | undefined => {
  let found: ReturningCustomer | undefined;
  let foundAt = Number.NEGATIVE_INFINITY;

  for (const entry of held.values()) {
    const { conversation } = entry;

    if (
      conversation.email !== query.email ||
      conversation.id === query.excludeId ||
      conversation.name === undefined ||
      conversation.isEval ||
      conversation.updatedAt < foundAt
    ) {
      continue;
    }

    found = { hasAccount: conversation.hasAccount, name: conversation.name };
    foundAt = conversation.updatedAt;
  }

  return found;
};

export const memoryChatConversations = (
  seed: readonly ChatConversationSeed[]
) =>
  Effect.gen(function* makeMemoryChatConversations() {
    const rows = yield* Ref.make<ReadonlyMap<string, MemoryConversation>>(
      new Map<string, MemoryConversation>(
        seed.map((conversationSeed) => [
          conversationSeed.id,
          {
            conversation: seedConversation(conversationSeed),
            visitorSecretHash: conversationSeed.visitorSecretHash,
          },
        ])
      )
    );

    const operations: ChatConversationOperations = {
      create: (seed) =>
        Ref.update(rows, (held) =>
          new Map(held).set(seed.id, {
            conversation: seedConversation(seed),
            visitorSecretHash: seed.visitorSecretHash,
          })
        ),
      findReturningCustomer: (query) =>
        Ref.get(rows).pipe(
          Effect.map((held) => newestReturningCustomer(held, query))
        ),
      read: (id) =>
        Ref.get(rows).pipe(Effect.map((held) => held.get(id)?.conversation)),
      readAsVisitor: (query) =>
        Ref.get(rows).pipe(
          Effect.map((held) => {
            const entry = held.get(query.id);

            return entry === undefined ||
              entry.visitorSecretHash !== query.secretHash
              ? undefined
              : entry.conversation;
          })
        ),
      requestHandoffEmail: (change) =>
        Effect.gen(function* requestHandoffEmailInMemory() {
          const held = yield* Ref.get(rows);
          const entry = held.get(change.id);

          if (
            entry === undefined ||
            entry.visitorSecretHash !== change.secretHash
          ) {
            return "not_found" as const;
          }

          const { conversation } = entry;

          if (
            conversation.status === "handoff_requested" &&
            conversation.updatedAt > change.at - change.repeatWindowSeconds
          ) {
            return "too_soon" as const;
          }

          const next: ChatConversation = {
            ...conversation,
            email: change.email,
            status: "handoff_requested",
            updatedAt: change.at,
          };

          yield* Ref.set(
            rows,
            new Map(held).set(change.id, {
              conversation: next,
              visitorSecretHash: entry.visitorSecretHash,
            })
          );

          return "saved" as const;
        }),
      saveProfile: (change) =>
        Ref.update(rows, (held) => {
          const entry = held.get(change.id);

          if (entry === undefined) {
            return held;
          }

          const { conversation } = entry;

          const next: ChatConversation = {
            ...conversation,
            email: change.email ?? conversation.email,
            hasAccount: change.hasAccount ?? conversation.hasAccount,
            name: change.name ?? conversation.name,
            profileCompleted:
              change.markProfileCompleted || conversation.profileCompleted,
            updatedAt: change.at,
          };

          return new Map(held).set(change.id, {
            conversation: next,
            visitorSecretHash: entry.visitorSecretHash,
          });
        }),
      setHandoffRequested: (change) =>
        Ref.update(rows, (held) => {
          const entry = held.get(change.id);

          if (entry === undefined) {
            return held;
          }

          const next: ChatConversation = {
            ...entry.conversation,
            status: "handoff_requested",
            updatedAt: change.at,
          };

          return new Map(held).set(change.id, {
            conversation: next,
            visitorSecretHash: entry.visitorSecretHash,
          });
        }),
      touch: (change) =>
        Ref.update(rows, (held) => {
          const entry = held.get(change.id);

          if (entry === undefined) {
            return held;
          }

          return new Map(held).set(change.id, {
            conversation: { ...entry.conversation, updatedAt: change.at },
            visitorSecretHash: entry.visitorSecretHash,
          });
        }),
      visitorOwnsSecret: (query) =>
        Ref.get(rows).pipe(
          Effect.map((held) => {
            for (const entry of held.values()) {
              if (
                entry.conversation.visitorId === query.visitorId &&
                entry.visitorSecretHash === query.secretHash
              ) {
                return true;
              }
            }

            return false;
          })
        ),
    };

    return {
      conversations: Ref.get(rows).pipe(
        Effect.map((held) =>
          [...held.values()].map((entry) => entry.conversation)
        )
      ),
      operations,
    };
  });
