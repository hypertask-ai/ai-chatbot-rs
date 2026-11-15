import {
  AdminConversationRow,
  AdminConversationStore,
  AdminCustomerConversation,
  AdminInboxRow,
  AdminMessageRow,
} from "@rat-stack/core/admin-conversation-store";
import type {
  AdminArchiveManyChange,
  AdminArchivedChange,
  AdminInboxQuery,
  AdminMessageSeed,
  AdminStatusChange,
  AdminTouchChange,
} from "@rat-stack/core/admin-conversation-store";
import { UsageDayRow } from "@rat-stack/core/admin-usage";
import { Effect, Layer, Option, Schema } from "effect";

import { DatabaseError } from "./model.js";
import type { DatabaseOperation } from "./model.js";

export interface AdminConversationQueries {
  readonly appendMessage: (
    message: AdminMessageSeed
  ) => Effect.Effect<void, DatabaseError>;
  readonly archiveMany: (
    change: AdminArchiveManyChange
  ) => Effect.Effect<void, DatabaseError>;
  readonly listCustomer: (
    email: string
  ) => Effect.Effect<readonly unknown[], DatabaseError>;
  readonly listInbox: (
    query: AdminInboxQuery
  ) => Effect.Effect<readonly unknown[], DatabaseError>;
  readonly listMessages: (
    conversationId: string
  ) => Effect.Effect<readonly unknown[], DatabaseError>;
  readonly readConversation: (
    id: string
  ) => Effect.Effect<readonly unknown[], DatabaseError>;
  readonly setArchived: (
    change: AdminArchivedChange
  ) => Effect.Effect<void, DatabaseError>;
  readonly setStatus: (
    change: AdminStatusChange
  ) => Effect.Effect<void, DatabaseError>;
  readonly setUpdatedAt: (
    change: AdminTouchChange
  ) => Effect.Effect<void, DatabaseError>;
  readonly usageRows: (
    since: number
  ) => Effect.Effect<readonly unknown[], DatabaseError>;
}

export const queryFailure =
  (operation: DatabaseOperation) =>
  (cause: unknown): DatabaseError =>
    new DatabaseError({ cause, operation });

const loadInbox = (source: AdminConversationQueries, query: AdminInboxQuery) =>
  Effect.gen(function* listAdminConversations() {
    const rows = yield* source.listInbox(query);

    // oxlint-disable-next-line unicorn/no-array-method-this-argument -- Effect.forEach is not Array#forEach; the callback is an effectful mapper.
    return yield* Effect.forEach(rows, (row) =>
      Schema.decodeUnknownEffect(AdminInboxRow)(row).pipe(
        Effect.mapError(queryFailure("listAdminConversations"))
      )
    );
  }).pipe(Effect.orDie);

const loadCustomers = (source: AdminConversationQueries, email: string) =>
  Effect.gen(function* listCustomerConversations() {
    const rows = yield* source.listCustomer(email);

    // oxlint-disable-next-line unicorn/no-array-method-this-argument -- Effect.forEach is not Array#forEach; the callback is an effectful mapper.
    return yield* Effect.forEach(rows, (row) =>
      Schema.decodeUnknownEffect(AdminCustomerConversation)(row).pipe(
        Effect.mapError(queryFailure("listCustomerConversations"))
      )
    );
  }).pipe(Effect.orDie);

const loadMessages = (
  source: AdminConversationQueries,
  conversationId: string
) =>
  Effect.gen(function* listAdminMessages() {
    const rows = yield* source.listMessages(conversationId);

    // oxlint-disable-next-line unicorn/no-array-method-this-argument -- Effect.forEach is not Array#forEach; the callback is an effectful mapper.
    return yield* Effect.forEach(rows, (row) =>
      Schema.decodeUnknownEffect(AdminMessageRow)(row).pipe(
        Effect.mapError(queryFailure("listAdminMessages"))
      )
    );
  }).pipe(Effect.orDie);

const loadConversation = (source: AdminConversationQueries, id: string) =>
  Effect.gen(function* readAdminConversation() {
    const rows = yield* source.readConversation(id);
    const [row] = rows;

    if (row === undefined) {
      return Option.none();
    }

    const conversation = yield* Schema.decodeUnknownEffect(
      AdminConversationRow
    )(row).pipe(Effect.mapError(queryFailure("readAdminConversation")));

    return Option.some(conversation);
  }).pipe(Effect.orDie);

const loadUsage = (source: AdminConversationQueries, since: number) =>
  Effect.gen(function* readAdminUsage() {
    const rows = yield* source.usageRows(since);

    // oxlint-disable-next-line unicorn/no-array-method-this-argument -- Effect.forEach is not Array#forEach; the callback is an effectful mapper.
    return yield* Effect.forEach(rows, (row) =>
      Schema.decodeUnknownEffect(UsageDayRow)(row).pipe(
        Effect.mapError(queryFailure("readAdminUsage"))
      )
    );
  }).pipe(Effect.orDie);

export const adminConversationLayer = <E, R>(
  queries: Effect.Effect<AdminConversationQueries, E, R>
) =>
  Layer.effect(
    AdminConversationStore,
    Effect.gen(function* buildAdminConversationLayer() {
      const source = yield* queries;

      return AdminConversationStore.of({
        appendMessage: (message) =>
          source
            .appendMessage(message)
            .pipe(
              Effect.mapError(queryFailure("setAdminMessage")),
              Effect.orDie
            ),
        archiveMany: (change) =>
          source
            .archiveMany(change)
            .pipe(
              Effect.mapError(queryFailure("archiveAdminConversations")),
              Effect.orDie
            ),
        listCustomer: (email) => loadCustomers(source, email),
        listInbox: (query) => loadInbox(source, query),
        listMessages: (conversationId) => loadMessages(source, conversationId),
        readConversation: (id) => loadConversation(source, id),
        setArchived: (change) =>
          source
            .setArchived(change)
            .pipe(
              Effect.mapError(queryFailure("setAdminArchived")),
              Effect.orDie
            ),
        setStatus: (change) =>
          source
            .setStatus(change)
            .pipe(
              Effect.mapError(queryFailure("setAdminStatus")),
              Effect.orDie
            ),
        setUpdatedAt: (change) =>
          source
            .setUpdatedAt(change)
            .pipe(
              Effect.mapError(queryFailure("touchAdminConversation")),
              Effect.orDie
            ),
        usageRows: (since) => loadUsage(source, since),
      });
    })
  );
