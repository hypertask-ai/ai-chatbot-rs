import { implement } from "@rat-stack/capability/implement";
import { Clock, Context, Effect, Option, Schema } from "effect";
import * as SecureRandom from "effect/crypto/SecureRandom";

import {
  acceptAdminConversationContract,
  archiveAdminConversationContract,
  archiveAdminConversationsContract,
  closeAdminConversationContract,
  listAdminConversationsContract,
  listCustomerConversationsContract,
  readAdminConversationContract,
  readAdminUsageContract,
  replyToAdminConversationContract,
  takeoverAdminConversationContract,
  unarchiveAdminConversationContract,
} from "./admin-contracts.js";
import { AdminConversationStore } from "./admin-conversation-store.js";
import type {
  AdminConversationOperations,
  AdminInboxQuery,
  AdminInboxRowValue,
} from "./admin-conversation-store.js";
import {
  buildUsageReport,
  usageSince,
  usageWindowDays,
} from "./admin-usage.js";

export interface AdminClockValue {
  readonly now: Effect.Effect<number>;
}

export const AdminClock = Context.Reference<AdminClockValue>(
  "@rat-stack/core/AdminClock",
  {
    defaultValue: () => ({
      now: Clock.currentTimeMillis.pipe(
        Effect.map((millis) => Math.floor(millis / 1000))
      ),
    }),
  }
);

const LastSeen = Schema.fromJsonString(
  Schema.Record(Schema.String, Schema.Finite)
);

const ArchiveIds = Schema.Array(Schema.Union([Schema.String, Schema.Finite]));

const emptyLastSeen = (): Readonly<Record<string, number>> => ({});

export const lastSeenOf = (raw?: string): Readonly<Record<string, number>> =>
  raw === undefined
    ? emptyLastSeen()
    : Option.getOrElse(
        Schema.decodeUnknownOption(LastSeen)(raw),
        emptyLastSeen
      );

export const unreadOf = (
  row: AdminInboxRowValue,
  lastSeen: Readonly<Record<string, number>>
): boolean =>
  row.last_message_role === "user" &&
  row.last_message_time !== null &&
  row.last_message_time > (lastSeen[row.id] ?? 0);

export const inboxQueryOf = (
  archived: string | undefined
): AdminInboxQuery => ({
  archived: archived === "true",
});

export const archiveIdsOf = (
  raw?: Schema.Json
): readonly string[] | undefined => {
  const decoded = Schema.decodeUnknownOption(ArchiveIds)(raw);

  if (Option.isNone(decoded) || decoded.value.length === 0) {
    return undefined;
  }

  return decoded.value.map(String);
};

const mailbox = <A, E, R>(
  use: (
    store: AdminConversationOperations,
    clock: AdminClockValue
  ) => Effect.Effect<A, E, R>
) =>
  Effect.gen(function* readMailbox() {
    const store = yield* AdminConversationStore;
    const clock = yield* AdminClock;

    return yield* use(store, clock);
  });

export const listAdminConversations = implement(
  listAdminConversationsContract,
  ({ archived, lastSeen }) =>
    mailbox((store) =>
      Effect.gen(function* listInbox() {
        const seen = lastSeenOf(lastSeen);
        const rows = yield* store.listInbox(inboxQueryOf(archived));

        return rows.map((row) => ({
          ...row,
          has_new_message: unreadOf(row, seen),
        }));
      })
    )
);

export const archiveAdminConversations = implement(
  archiveAdminConversationsContract,
  ({ ids }) =>
    mailbox((store, clock) =>
      Effect.gen(function* archiveManyConversations() {
        const list = archiveIdsOf(ids);

        if (list === undefined) {
          return yield* Effect.fail({
            error: "No conversation IDs provided" as const,
          });
        }

        const at = yield* clock.now;

        yield* store.archiveMany({ at, ids: list });

        return { archived: true as const, count: list.length };
      })
    )
);

export const readAdminConversation = implement(
  readAdminConversationContract,
  ({ id }) =>
    mailbox((store) =>
      Effect.gen(function* readConversation() {
        const conversation = yield* store.readConversation(id);
        const messages = yield* store.listMessages(id);

        return { conversation: conversation ?? null, messages };
      })
    )
);

export const acceptAdminConversation = implement(
  acceptAdminConversationContract,
  ({ id }) =>
    mailbox((store, clock) =>
      Effect.gen(function* acceptHandoff() {
        const at = yield* clock.now;

        yield* store.setStatus({ at, id, status: "human" });

        return { status: "human" as const };
      })
    )
);

export const takeoverAdminConversation = implement(
  takeoverAdminConversationContract,
  ({ id }) =>
    mailbox((store, clock) =>
      Effect.gen(function* takeOverConversation() {
        const at = yield* clock.now;

        yield* store.setStatus({ at, id, status: "human" });

        return { status: "human" as const };
      })
    )
);

export const replyToAdminConversation = implement(
  replyToAdminConversationContract,
  ({ content, id }) =>
    mailbox((store, clock) =>
      Effect.gen(function* writeAdminReply() {
        const random = yield* SecureRandom.SecureRandom;
        const messageId = yield* random.uuidV4();
        const at = yield* clock.now;

        yield* store.appendMessage({
          content,
          conversationId: id,
          id: messageId,
        });
        yield* store.setUpdatedAt({ at, id });

        return { id: messageId };
      })
    )
);

export const closeAdminConversation = implement(
  closeAdminConversationContract,
  ({ id }) =>
    mailbox((store, clock) =>
      Effect.gen(function* closeConversation() {
        const at = yield* clock.now;

        yield* store.setStatus({ at, id, status: "closed" });

        return { status: "closed" as const };
      })
    )
);

export const archiveAdminConversation = implement(
  archiveAdminConversationContract,
  ({ id }) =>
    mailbox((store, clock) =>
      Effect.gen(function* archiveConversation() {
        const at = yield* clock.now;

        yield* store.setArchived({ archived: true, at, id });

        return { archived: true as const };
      })
    )
);

export const unarchiveAdminConversation = implement(
  unarchiveAdminConversationContract,
  ({ id }) =>
    mailbox((store, clock) =>
      Effect.gen(function* unarchiveConversation() {
        const at = yield* clock.now;

        yield* store.setArchived({ archived: false, at, id });

        return { archived: false as const };
      })
    )
);

export const readAdminUsage = implement(
  readAdminUsageContract,
  ({ days: rawDays }) =>
    mailbox((store, clock) =>
      Effect.gen(function* readUsage() {
        const days = usageWindowDays(rawDays);
        const now = yield* clock.now;
        const rows = yield* store.usageRows(usageSince(now, days));

        return buildUsageReport(rows, days);
      })
    )
);

export const listCustomerConversations = implement(
  listCustomerConversationsContract,
  ({ email }) =>
    mailbox((store) =>
      email === undefined || email === ""
        ? Effect.fail({ error: "Email parameter required" as const })
        : store.listCustomer(email)
    )
);

export const adminConversationCapabilities = [
  listAdminConversations,
  archiveAdminConversations,
  readAdminConversation,
  acceptAdminConversation,
  takeoverAdminConversation,
  replyToAdminConversation,
  closeAdminConversation,
  archiveAdminConversation,
  unarchiveAdminConversation,
  readAdminUsage,
  listCustomerConversations,
] as const;
