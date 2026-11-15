import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { toHttpApi } from "@rat-stack/capability/http-api";
import {
  AccessLogin,
  AdminPassword,
  adminFromRequest,
} from "@rat-stack/core/admin-access";
import {
  AdminConversationDetail,
  AdminInboxItem,
} from "@rat-stack/core/admin-conversation-store";
import {
  AdminClock,
  adminConversationCapabilities,
} from "@rat-stack/core/admin-conversations";
import { AdminUsageReport } from "@rat-stack/core/admin-usage";
import { webCryptoLayer } from "@rat-stack/core/web-crypto";
import { and, asc, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { drizzle as drizzleSqlite } from "drizzle-orm/sql-js";
import { Effect, FileSystem, Layer, Path, Schema } from "effect";
import { Etag, HttpPlatform, HttpRouter } from "effect/http";
import { HttpApiBuilder } from "effect/http-api";
import initSqlJs from "sql.js";

import {
  adminConversationLayer,
  queryFailure,
} from "../src/admin-conversation.js";
import type { AdminConversationQueries } from "../src/admin-conversation.js";
import { databaseMigrationDirectory } from "../src/migrations.js";
import type { DatabaseOperation } from "../src/model.js";
import { Conversations, Messages } from "../src/schema/d1.js";

const SITE = "https://help.hypertask.ai";

const ADMIN_PREFIX = "/admin/api";

const NOW = 100_000;

const ADMIN_PASSWORD_VALUE = "admin-secret-value";

const GOOD_ACCESS_TOKEN = "good-access-token";

const INBOX_LIMIT = 50;

const PROMPT_TIER_TOKENS = 100_000;

const OLD_PRICE_BASIS =
  "Claude API global list prices effective 2026-10-07. Ephemeral cache_control is the 5-minute write price. A prompt over 100000 tokens (input + cache write + cache read) uses the higher tier for that message.";

const INSERT_CONVERSATION =
  "INSERT INTO conversations (id, visitor_id, visitor_name, visitor_email, has_hypertask_account, profile_completed, status, archived, is_eval, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

const INSERT_MESSAGE =
  "INSERT INTO messages (id, conversation_id, role, content, input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

interface SeedConversation {
  readonly account: string;
  readonly archived: number;
  readonly createdAt: number;
  readonly email: string | null;
  readonly id: string;
  readonly isEval: number;
  readonly name: string | null;
  readonly profileCompleted: number;
  readonly status: string;
  readonly updatedAt: number;
  readonly visitorId: string;
}

interface SeedMessage {
  readonly cacheCreation: number | null;
  readonly cacheRead: number | null;
  readonly content: string;
  readonly conversationId: string;
  readonly createdAt: number;
  readonly id: string;
  readonly input: number | null;
  readonly model: string | null;
  readonly output: number | null;
  readonly role: string;
}

const SEED_CONVERSATIONS: readonly SeedConversation[] = [
  {
    account: "paid",
    archived: 0,
    createdAt: 900,
    email: "ada@example.com",
    id: "conv-handoff",
    isEval: 0,
    name: "Ada Lovelace",
    profileCompleted: 1,
    status: "handoff_requested",
    updatedAt: 70_000,
    visitorId: "v-handoff",
  },
  {
    account: "unknown",
    archived: 0,
    createdAt: 950,
    email: null,
    id: "conv-bot",
    isEval: 0,
    name: null,
    profileCompleted: 0,
    status: "bot",
    updatedAt: 80_000,
    visitorId: "v-bot",
  },
  {
    account: "free",
    archived: 1,
    createdAt: 940,
    email: "sam@example.com",
    id: "conv-archived",
    isEval: 0,
    name: "Sam",
    profileCompleted: 1,
    status: "closed",
    updatedAt: 60_000,
    visitorId: "v-archived",
  },
  {
    account: "unknown",
    archived: 0,
    createdAt: 930,
    email: "eval@example.com",
    id: "conv-eval",
    isEval: 1,
    name: "Eval visitor",
    profileCompleted: 0,
    status: "handoff_requested",
    updatedAt: 99_000,
    visitorId: "v-eval",
  },
];

const SEED_MESSAGES: readonly SeedMessage[] = [
  {
    cacheCreation: null,
    cacheRead: null,
    content: "My invoices are late",
    conversationId: "conv-handoff",
    createdAt: 5000,
    id: "m-h1",
    input: null,
    model: null,
    output: null,
    role: "user",
  },
  {
    cacheCreation: null,
    cacheRead: null,
    content: "Here is the fix",
    conversationId: "conv-handoff",
    createdAt: 5100,
    id: "m-h2",
    input: null,
    model: null,
    output: null,
    role: "bot",
  },
  {
    cacheCreation: null,
    cacheRead: null,
    content: "I can help",
    conversationId: "conv-handoff",
    createdAt: 5200,
    id: "m-h3",
    input: null,
    model: null,
    output: null,
    role: "admin",
  },
  {
    cacheCreation: null,
    cacheRead: null,
    content: "How do I archive",
    conversationId: "conv-bot",
    createdAt: 6000,
    id: "m-b1",
    input: null,
    model: null,
    output: null,
    role: "user",
  },
  {
    cacheCreation: null,
    cacheRead: null,
    content: "Old question",
    conversationId: "conv-archived",
    createdAt: 4000,
    id: "m-a1",
    input: null,
    model: null,
    output: null,
    role: "user",
  },
  {
    cacheCreation: null,
    cacheRead: null,
    content: "Eval question",
    conversationId: "conv-eval",
    createdAt: 5500,
    id: "m-e1",
    input: null,
    model: null,
    output: null,
    role: "user",
  },
  {
    cacheCreation: null,
    cacheRead: 10_000,
    content: "Usage under the tier",
    conversationId: "conv-eval",
    createdAt: 99_000,
    id: "m-u1",
    input: 1000,
    model: "claude-haiku-5-5",
    output: 2000,
    role: "bot",
  },
  {
    cacheCreation: 30_000,
    cacheRead: 0,
    content: "Usage over the tier",
    conversationId: "conv-eval",
    createdAt: 99_100,
    id: "m-u2",
    input: 100_000,
    model: "claude-haiku-5-5",
    output: 1000,
    role: "bot",
  },
  {
    cacheCreation: null,
    cacheRead: null,
    content: "Another model",
    conversationId: "conv-eval",
    createdAt: 80_000,
    id: "m-u3",
    input: 5,
    model: "other-model",
    output: 5,
    role: "bot",
  },
  {
    cacheCreation: null,
    cacheRead: null,
    content: "A visitor message that carries a model",
    conversationId: "conv-eval",
    createdAt: 99_500,
    id: "m-u4",
    input: 999_999,
    model: "claude-haiku-5-5",
    output: 999_999,
    role: "user",
  },
  {
    cacheCreation: null,
    cacheRead: null,
    content: "Older than the window",
    conversationId: "conv-eval",
    createdAt: 5000,
    id: "m-u5",
    input: 123_456,
    model: "claude-haiku-5-5",
    output: 123_456,
    role: "bot",
  },
];

const conversationColumns = {
  archived: Conversations.archived,
  created_at: Conversations.createdAt,
  has_hypertask_account: Conversations.hasHypertaskAccount,
  id: Conversations.id,
  is_eval: Conversations.isEval,
  profile_completed: Conversations.profileCompleted,
  status: Conversations.status,
  updated_at: Conversations.updatedAt,
  visitor_email: Conversations.visitorEmail,
  visitor_id: Conversations.visitorId,
  visitor_name: Conversations.visitorName,
};

const messageColumns = {
  cache_creation_input_tokens: Messages.cacheCreationInputTokens,
  cache_read_input_tokens: Messages.cacheReadInputTokens,
  content: Messages.content,
  conversation_id: Messages.conversationId,
  created_at: Messages.createdAt,
  id: Messages.id,
  input_tokens: Messages.inputTokens,
  model: Messages.model,
  output_tokens: Messages.outputTokens,
  role: Messages.role,
};

const promptOverTier = sql`COALESCE(${Messages.inputTokens}, 0) + COALESCE(${Messages.cacheCreationInputTokens}, 0) + COALESCE(${Messages.cacheReadInputTokens}, 0) > ${PROMPT_TIER_TOKENS}`;

const TestServices = Layer.mergeAll(
  Path.layer,
  Etag.layerWeak,
  HttpPlatform.layer
).pipe(Layer.provideMerge(FileSystem.layerNoop({})));

const AnswerBody = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json));

const Inbox = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Array(AdminInboxItem))
);

const Detail = Schema.decodeUnknownSync(
  Schema.fromJsonString(AdminConversationDetail)
);

const Usage = Schema.decodeUnknownSync(Schema.fromJsonString(AdminUsageReport));

const SentMessage = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Struct({ id: Schema.String }))
);

const UUID_V4 =
  /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/u;

const HANDOFF_INBOX_ITEM = {
  archived: 0,
  created_at: 900,
  has_hypertask_account: "paid",
  has_new_message: false,
  id: "conv-handoff",
  is_eval: 0,
  last_message: "I can help",
  last_message_role: "admin",
  last_message_time: 5200,
  message_count: 3,
  profile_completed: 1,
  status: "handoff_requested",
  updated_at: 70_000,
  visitor_email: "ada@example.com",
  visitor_id: "v-handoff",
  visitor_name: "Ada Lovelace",
};

const BOT_INBOX_ITEM = {
  archived: 0,
  created_at: 950,
  has_hypertask_account: "unknown",
  has_new_message: true,
  id: "conv-bot",
  is_eval: 0,
  last_message: "How do I archive",
  last_message_role: "user",
  last_message_time: 6000,
  message_count: 1,
  profile_completed: 0,
  status: "bot",
  updated_at: 80_000,
  visitor_email: null,
  visitor_id: "v-bot",
  visitor_name: null,
};

const ARCHIVED_INBOX_ITEM = {
  archived: 1,
  created_at: 940,
  has_hypertask_account: "free",
  has_new_message: true,
  id: "conv-archived",
  is_eval: 0,
  last_message: "Old question",
  last_message_role: "user",
  last_message_time: 4000,
  message_count: 1,
  profile_completed: 1,
  status: "closed",
  updated_at: 60_000,
  visitor_email: "sam@example.com",
  visitor_id: "v-archived",
  visitor_name: "Sam",
};

const CUSTOMER_CONVERSATION = {
  archived: 0,
  created_at: 900,
  first_message: "My invoices are late",
  has_hypertask_account: "paid",
  id: "conv-handoff",
  is_eval: 0,
  message_count: 3,
  profile_completed: 1,
  status: "handoff_requested",
  updated_at: 70_000,
  visitor_email: "ada@example.com",
  visitor_id: "v-handoff",
  visitor_name: "Ada Lovelace",
};

const EXPECTED_USAGE = {
  currency: "USD",
  days: [
    {
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      cost_usd: null,
      day: "1970-01-01",
      input_tokens: 5,
      messages: 1,
      model: "other-model",
      output_tokens: 5,
    },
    {
      cache_creation_input_tokens: 30_000,
      cache_read_input_tokens: 10_000,
      cost_usd: 0.07245,
      day: "1970-01-02",
      input_tokens: 101_000,
      messages: 2,
      model: "claude-haiku-5-5",
      output_tokens: 3000,
    },
  ],
  model: "claude-haiku-5-5",
  price_basis: OLD_PRICE_BASIS,
  prices_per_mtok: {
    over_100k: {
      cache_creation: 0.625,
      cache_read: 0.05,
      input: 0.5,
      output: 2.5,
    },
    up_to_100k: {
      cache_creation: 0.125,
      cache_read: 0.01,
      input: 0.1,
      output: 0.5,
    },
  },
  totals: {
    cache_creation_input_tokens: 30_000,
    cache_read_input_tokens: 10_000,
    cost_usd: 0.07245,
    input_tokens: 101_005,
    messages: 3,
    output_tokens: 3005,
  },
  window_days: 1,
};

interface Answered {
  readonly body: string;
  readonly status: number;
}

interface AdminClient {
  readonly get: (
    path: string,
    headers?: Readonly<Record<string, string>>
  ) => Effect.Effect<Answered>;
  readonly post: (
    path: string,
    body: string | undefined,
    headers?: Readonly<Record<string, string>>
  ) => Effect.Effect<Answered>;
}

interface AdminRequest {
  readonly headers: Readonly<Record<string, string>>;
  readonly method: string;
  readonly path: string;
}

interface RefusedIdentity {
  readonly headers: Readonly<Record<string, string>>;
  readonly name: string;
}

const BEARER = { authorization: `Bearer ${ADMIN_PASSWORD_VALUE}` };

const REFUSED_IDENTITIES: readonly RefusedIdentity[] = [
  { headers: {}, name: "no login" },
  { headers: { authorization: "Bearer" }, name: "a malformed login" },
  {
    headers: { authorization: "Bearer visitor-secret" },
    name: "a visitor login",
  },
  {
    headers: { authorization: "Basic YWRtaW46YWRtaW4=" },
    name: "a login with another scheme",
  },
  {
    headers: { "cf-access-jwt-assertion": "not-a-token" },
    name: "a malformed Access login",
  },
];

const seededConnection = (connection: {
  readonly run: (
    statement: string,
    values: readonly (number | string | null)[]
  ) => void;
}) => {
  for (const conversation of SEED_CONVERSATIONS) {
    connection.run(INSERT_CONVERSATION, [
      conversation.id,
      conversation.visitorId,
      conversation.name,
      conversation.email,
      conversation.account,
      conversation.profileCompleted,
      conversation.status,
      conversation.archived,
      conversation.isEval,
      conversation.createdAt,
      conversation.updatedAt,
    ]);
  }

  for (const message of SEED_MESSAGES) {
    connection.run(INSERT_MESSAGE, [
      message.id,
      message.conversationId,
      message.role,
      message.content,
      message.input,
      message.output,
      message.cacheRead,
      message.cacheCreation,
      message.model,
      message.createdAt,
    ]);
  }
};

const queryRows = (
  operation: DatabaseOperation,
  run: () => Promise<readonly unknown[]>
) => Effect.tryPromise({ catch: queryFailure(operation), try: run });

const queryWrite = (operation: DatabaseOperation, run: () => Promise<void>) =>
  Effect.tryPromise({ catch: queryFailure(operation), try: run });

const queriesOf = (
  db: ReturnType<typeof drizzleSqlite>
): AdminConversationQueries => ({
  appendMessage: (message) =>
    queryWrite("setAdminMessage", () =>
      db.insert(Messages).values({
        content: message.content,
        conversationId: message.conversationId,
        id: message.id,
        role: "admin",
      })
    ),
  archiveMany: (change) =>
    queryWrite("archiveAdminConversations", () =>
      db
        .update(Conversations)
        .set({ archived: 1, updatedAt: change.at })
        .where(inArray(Conversations.id, [...change.ids]))
    ),
  listCustomer: (email) =>
    queryRows("listCustomerConversations", () =>
      db
        .select({
          ...conversationColumns,
          first_message: sql<
            string | null
          >`(SELECT content FROM messages WHERE conversation_id = ${Conversations.id} ORDER BY created_at ASC LIMIT 1)`,
          message_count: sql<number>`(SELECT COUNT(*) FROM messages WHERE conversation_id = ${Conversations.id})`,
        })
        .from(Conversations)
        .where(eq(Conversations.visitorEmail, email))
        .orderBy(desc(Conversations.createdAt))
    ),
  listInbox: (query) =>
    queryRows("listAdminConversations", () =>
      db
        .select({
          ...conversationColumns,
          last_message: sql<
            string | null
          >`(SELECT content FROM messages WHERE conversation_id = ${Conversations.id} ORDER BY created_at DESC LIMIT 1)`,
          last_message_role: sql<
            string | null
          >`(SELECT role FROM messages WHERE conversation_id = ${Conversations.id} ORDER BY created_at DESC LIMIT 1)`,
          last_message_time: sql<
            number | null
          >`(SELECT created_at FROM messages WHERE conversation_id = ${Conversations.id} ORDER BY created_at DESC LIMIT 1)`,
          message_count: sql<number>`(SELECT COUNT(*) FROM messages WHERE conversation_id = ${Conversations.id})`,
        })
        .from(Conversations)
        .where(
          and(
            eq(Conversations.archived, query.archived ? 1 : 0),
            sql`COALESCE(${Conversations.isEval}, 0) = 0`
          )
        )
        .orderBy(
          sql`CASE WHEN ${Conversations.status} = 'handoff_requested' THEN 0 ELSE 1 END`,
          desc(Conversations.updatedAt)
        )
        .limit(INBOX_LIMIT)
    ),
  listMessages: (conversationId) =>
    queryRows("listAdminMessages", () =>
      db
        .select(messageColumns)
        .from(Messages)
        .where(eq(Messages.conversationId, conversationId))
        .orderBy(asc(Messages.createdAt))
    ),
  readConversation: (id) =>
    queryRows("readAdminConversation", () =>
      db
        .select(conversationColumns)
        .from(Conversations)
        .where(eq(Conversations.id, id))
        .limit(1)
    ),
  setArchived: (change) =>
    queryWrite("setAdminArchived", () =>
      db
        .update(Conversations)
        .set({ archived: change.archived ? 1 : 0, updatedAt: change.at })
        .where(eq(Conversations.id, change.id))
    ),
  setStatus: (change) =>
    queryWrite("setAdminStatus", () =>
      db
        .update(Conversations)
        .set({ status: change.status, updatedAt: change.at })
        .where(eq(Conversations.id, change.id))
    ),
  setUpdatedAt: (change) =>
    queryWrite("touchAdminConversation", () =>
      db
        .update(Conversations)
        .set({ updatedAt: change.at })
        .where(eq(Conversations.id, change.id))
    ),
  usageRows: (since) =>
    queryRows("readAdminUsage", () =>
      db
        .select({
          cache_creation_input_tokens: sql<number>`SUM(COALESCE(${Messages.cacheCreationInputTokens}, 0))`,
          cache_creation_input_tokens_over_100k: sql<number>`SUM(CASE WHEN ${promptOverTier} THEN COALESCE(${Messages.cacheCreationInputTokens}, 0) ELSE 0 END)`,
          cache_read_input_tokens: sql<number>`SUM(COALESCE(${Messages.cacheReadInputTokens}, 0))`,
          cache_read_input_tokens_over_100k: sql<number>`SUM(CASE WHEN ${promptOverTier} THEN COALESCE(${Messages.cacheReadInputTokens}, 0) ELSE 0 END)`,
          day: sql<string>`date(${Messages.createdAt}, 'unixepoch')`,
          input_tokens: sql<number>`SUM(COALESCE(${Messages.inputTokens}, 0))`,
          input_tokens_over_100k: sql<number>`SUM(CASE WHEN ${promptOverTier} THEN COALESCE(${Messages.inputTokens}, 0) ELSE 0 END)`,
          messages: sql<number>`COUNT(*)`,
          model: sql<string>`COALESCE(${Messages.model}, '')`,
          output_tokens: sql<number>`SUM(COALESCE(${Messages.outputTokens}, 0))`,
          output_tokens_over_100k: sql<number>`SUM(CASE WHEN ${promptOverTier} THEN COALESCE(${Messages.outputTokens}, 0) ELSE 0 END)`,
        })
        .from(Messages)
        .where(
          and(
            eq(Messages.role, "bot"),
            isNotNull(Messages.model),
            gte(Messages.createdAt, since)
          )
        )
        .groupBy(
          sql`date(${Messages.createdAt}, 'unixepoch')`,
          sql`COALESCE(${Messages.model}, '')`
        )
        .orderBy(sql`date(${Messages.createdAt}, 'unixepoch') ASC`)
    ),
});

const routes = toHttpApi(SITE, adminConversationCapabilities, {
  prefix: ADMIN_PREFIX,
  provide: [adminFromRequest],
});

const withSite = <A, E, R>(
  use: (client: AdminClient) => Effect.Effect<A, E, R>
) =>
  Effect.gen(function* prepareAdminSite() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const SQL = yield* Effect.promise(() => initSqlJs());

    const database = yield* Effect.acquireRelease(
      Effect.sync(() => new SQL.Database()),
      (connection) =>
        Effect.sync(() => {
          connection.close();
        })
    );

    const migrationRoot = databaseMigrationDirectory("d1");

    const migrationDirectories = (yield* fileSystem.readDirectory(
      migrationRoot
    )).toSorted();

    for (const directory of migrationDirectories) {
      const migration = yield* fileSystem.readFileString(
        path.resolve(migrationRoot, directory, "migration.sql")
      );

      yield* Effect.sync(() => database.exec(migration));
    }

    yield* Effect.sync(() => {
      seededConnection({
        run: (statement, values) => {
          database.run(statement, [...values]);
        },
      });
    });

    const db = drizzleSqlite(database);

    const site = HttpApiBuilder.layer(routes.api).pipe(
      Layer.provide(routes.layer),
      Layer.provide(adminConversationLayer(Effect.succeed(queriesOf(db)))),
      Layer.provide(Layer.succeed(AdminClock, { now: Effect.succeed(NOW) })),
      Layer.provide(Layer.succeed(AdminPassword, ADMIN_PASSWORD_VALUE)),
      Layer.provide(
        Layer.succeed(AccessLogin, {
          verify: (token) => Effect.succeed(token === GOOD_ACCESS_TOKEN),
        })
      ),
      Layer.provide(webCryptoLayer),
      Layer.provide(TestServices)
    );

    const served = HttpRouter.toWebHandler(site, { disableLogger: true });

    yield* Effect.addFinalizer(() => Effect.promise(() => served.dispose()));

    const answer = (request: Request) =>
      Effect.gen(function* answerRequest() {
        const response = yield* Effect.promise(() => served.handler(request));
        const body = yield* Effect.promise(() => response.text());

        return { body, status: response.status };
      });

    return yield* use({
      get: (requestPath, headers) =>
        answer(
          new Request(`${SITE}${requestPath}`, {
            headers: headers ?? {},
            method: "GET",
          })
        ),
      post: (requestPath, body, headers) =>
        answer(
          new Request(`${SITE}${requestPath}`, {
            body,
            headers: headers ?? {},
            method: "POST",
          })
        ),
    });
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer));

const idsOf = (answer: Answered) => Inbox(answer.body).map((item) => item.id);

const filledPath = (path: string) =>
  path
    .split("/")
    .map((segment) => (segment.startsWith(":") ? "conv-handoff" : segment))
    .join("");

const adminRequests = (): readonly AdminRequest[] =>
  adminConversationCapabilities.map(({ contract }) => {
    const { http, name } = contract;

    if (http === undefined) {
      throw new Error(`${name} has no HTTP route`);
    }

    return {
      headers: {},
      method: http.method,
      path: `${ADMIN_PREFIX}${filledPath(http.path)}`,
    };
  });

const send = (client: AdminClient, request: AdminRequest) =>
  request.method === "GET"
    ? client.get(request.path, request.headers)
    : client.post(request.path, undefined, request.headers);

describe("admin conversations over a local D1 database", () => {
  it.effect("lists the inbox with handoff requests first", () =>
    withSite((client) =>
      Effect.gen(function* listInbox() {
        const answered = yield* client.get(
          `${ADMIN_PREFIX}/conversations`,
          BEARER
        );

        expect(answered.status).toBe(200);
        expect(Inbox(answered.body)).toEqual([
          HANDOFF_INBOX_ITEM,
          BOT_INBOX_ITEM,
        ]);
      })
    )
  );

  it.effect(
    "marks a conversation read once the admin has seen its last message",
    () =>
      withSite((client) =>
        Effect.gen(function* markRead() {
          const lastSeen = encodeURIComponent(
            JSON.stringify({ "conv-bot": 6000 })
          );

          const answered = yield* client.get(
            `${ADMIN_PREFIX}/conversations?lastSeen=${lastSeen}`,
            BEARER
          );

          expect(
            Inbox(answered.body).map((item) => [item.id, item.has_new_message])
          ).toEqual([
            ["conv-handoff", false],
            ["conv-bot", false],
          ]);
        })
      )
  );

  it.effect("lists the archived tab", () =>
    withSite((client) =>
      Effect.gen(function* listArchived() {
        const answered = yield* client.get(
          `${ADMIN_PREFIX}/conversations?archived=true`,
          BEARER
        );

        expect(Inbox(answered.body)).toEqual([ARCHIVED_INBOX_ITEM]);
      })
    )
  );

  it.effect("bulk archives the conversations it is given", () =>
    withSite((client) =>
      Effect.gen(function* bulkArchive() {
        const answered = yield* client.post(
          `${ADMIN_PREFIX}/conversations/bulk/archive`,
          JSON.stringify({ ids: ["conv-handoff", "conv-bot"] }),
          BEARER
        );

        expect([answered.status, AnswerBody(answered.body)]).toEqual([
          200,
          { archived: true, count: 2 },
        ]);

        const inbox = yield* client.get(
          `${ADMIN_PREFIX}/conversations`,
          BEARER
        );

        const archived = yield* client.get(
          `${ADMIN_PREFIX}/conversations?archived=true`,
          BEARER
        );

        expect([idsOf(inbox), idsOf(archived)]).toEqual([
          [],
          ["conv-handoff", "conv-bot", "conv-archived"],
        ]);
      })
    )
  );

  it.effect("refuses a bulk archive with no ids in the old 400 body", () =>
    withSite((client) =>
      Effect.gen(function* refuseEmptyBulkArchive() {
        const empty = yield* client.post(
          `${ADMIN_PREFIX}/conversations/bulk/archive`,
          JSON.stringify({ ids: [] }),
          BEARER
        );

        const missing = yield* client.post(
          `${ADMIN_PREFIX}/conversations/bulk/archive`,
          JSON.stringify({}),
          BEARER
        );

        expect([
          [empty.status, empty.body],
          [missing.status, missing.body],
        ]).toEqual([
          [400, '{"error":"No conversation IDs provided"}'],
          [400, '{"error":"No conversation IDs provided"}'],
        ]);
      })
    )
  );

  it.effect("reads one conversation with its messages in order", () =>
    withSite((client) =>
      Effect.gen(function* readConversation() {
        const answered = yield* client.get(
          `${ADMIN_PREFIX}/conversations/conv-handoff`,
          BEARER
        );

        expect(Detail(answered.body)).toEqual({
          conversation: {
            archived: 0,
            created_at: 900,
            has_hypertask_account: "paid",
            id: "conv-handoff",
            is_eval: 0,
            profile_completed: 1,
            status: "handoff_requested",
            updated_at: 70_000,
            visitor_email: "ada@example.com",
            visitor_id: "v-handoff",
            visitor_name: "Ada Lovelace",
          },
          messages: [
            {
              cache_creation_input_tokens: null,
              cache_read_input_tokens: null,
              content: "My invoices are late",
              conversation_id: "conv-handoff",
              created_at: 5000,
              id: "m-h1",
              input_tokens: null,
              model: null,
              output_tokens: null,
              role: "user",
            },
            {
              cache_creation_input_tokens: null,
              cache_read_input_tokens: null,
              content: "Here is the fix",
              conversation_id: "conv-handoff",
              created_at: 5100,
              id: "m-h2",
              input_tokens: null,
              model: null,
              output_tokens: null,
              role: "bot",
            },
            {
              cache_creation_input_tokens: null,
              cache_read_input_tokens: null,
              content: "I can help",
              conversation_id: "conv-handoff",
              created_at: 5200,
              id: "m-h3",
              input_tokens: null,
              model: null,
              output_tokens: null,
              role: "admin",
            },
          ],
        });
      })
    )
  );

  it.effect("answers an unknown conversation with null and no messages", () =>
    withSite((client) =>
      Effect.gen(function* readMissingConversation() {
        const answered = yield* client.get(
          `${ADMIN_PREFIX}/conversations/conv-missing`,
          BEARER
        );

        expect([answered.status, Detail(answered.body)]).toEqual([
          200,
          { conversation: null, messages: [] },
        ]);
      })
    )
  );

  it.effect("accepts a handoff request", () =>
    withSite((client) =>
      Effect.gen(function* acceptHandoff() {
        const accepted = yield* client.post(
          `${ADMIN_PREFIX}/conversations/conv-handoff/accept`,
          undefined,
          BEARER
        );

        expect([accepted.status, AnswerBody(accepted.body)]).toEqual([
          200,
          { status: "human" },
        ]);

        const detail = Detail(
          (yield* client.get(
            `${ADMIN_PREFIX}/conversations/conv-handoff`,
            BEARER
          )).body
        );

        expect([
          detail.conversation?.status,
          detail.conversation?.updated_at,
        ]).toEqual(["human", NOW]);
      })
    )
  );

  it.effect("takes a conversation over from the bot", () =>
    withSite((client) =>
      Effect.gen(function* takeOver() {
        const taken = yield* client.post(
          `${ADMIN_PREFIX}/conversations/conv-bot/takeover`,
          undefined,
          BEARER
        );

        expect([taken.status, AnswerBody(taken.body)]).toEqual([
          200,
          { status: "human" },
        ]);

        const detail = Detail(
          (yield* client.get(`${ADMIN_PREFIX}/conversations/conv-bot`, BEARER))
            .body
        );

        expect(detail.conversation?.status).toBe("human");
      })
    )
  );

  it.effect("closes a conversation", () =>
    withSite((client) =>
      Effect.gen(function* closeConversation() {
        const closed = yield* client.post(
          `${ADMIN_PREFIX}/conversations/conv-bot/close`,
          undefined,
          BEARER
        );

        expect([closed.status, AnswerBody(closed.body)]).toEqual([
          200,
          { status: "closed" },
        ]);

        const detail = Detail(
          (yield* client.get(`${ADMIN_PREFIX}/conversations/conv-bot`, BEARER))
            .body
        );

        expect(detail.conversation?.status).toBe("closed");
      })
    )
  );

  it.effect("archives a conversation and moves it back", () =>
    withSite((client) =>
      Effect.gen(function* archiveAndUnarchive() {
        const archived = yield* client.post(
          `${ADMIN_PREFIX}/conversations/conv-bot/archive`,
          undefined,
          BEARER
        );

        const movedBack = yield* client.post(
          `${ADMIN_PREFIX}/conversations/conv-archived/unarchive`,
          undefined,
          BEARER
        );

        expect([AnswerBody(archived.body), AnswerBody(movedBack.body)]).toEqual(
          [{ archived: true }, { archived: false }]
        );

        const inbox = yield* client.get(
          `${ADMIN_PREFIX}/conversations`,
          BEARER
        );

        const tab = yield* client.get(
          `${ADMIN_PREFIX}/conversations?archived=true`,
          BEARER
        );

        expect([idsOf(inbox), idsOf(tab)]).toEqual([
          ["conv-handoff", "conv-archived"],
          ["conv-bot"],
        ]);
      })
    )
  );

  it.effect("writes an admin reply and touches the conversation", () =>
    withSite((client) =>
      Effect.gen(function* writeReply() {
        const answered = yield* client.post(
          `${ADMIN_PREFIX}/conversations/conv-bot/message`,
          JSON.stringify({ content: "On it" }),
          BEARER
        );

        expect(answered.status).toBe(200);
        expect(SentMessage(answered.body).id).toMatch(UUID_V4);

        const detail = Detail(
          (yield* client.get(`${ADMIN_PREFIX}/conversations/conv-bot`, BEARER))
            .body
        );

        expect(
          detail.messages.map(({ content, role }) => [role, content])
        ).toEqual([
          ["user", "How do I archive"],
          ["admin", "On it"],
        ]);
        expect(detail.conversation?.updated_at).toBe(NOW);
      })
    )
  );

  it.effect("reports usage per day and model with the Haiku price tiers", () =>
    withSite((client) =>
      Effect.gen(function* readUsage() {
        const answered = yield* client.get(
          `${ADMIN_PREFIX}/usage?days=1`,
          BEARER
        );

        expect([answered.status, Usage(answered.body)]).toEqual([
          200,
          EXPECTED_USAGE,
        ]);
      })
    )
  );

  it.effect("lists a customer's conversations with the first message", () =>
    withSite((client) =>
      Effect.gen(function* listCustomer() {
        const answered = yield* client.get(
          `${ADMIN_PREFIX}/customers/conversations?email=ada%40example.com`,
          BEARER
        );

        expect([answered.status, AnswerBody(answered.body)]).toEqual([
          200,
          [CUSTOMER_CONVERSATION],
        ]);
      })
    )
  );

  it.effect("refuses a customer lookup with no email", () =>
    withSite((client) =>
      Effect.gen(function* refuseCustomerLookup() {
        const answered = yield* client.get(
          `${ADMIN_PREFIX}/customers/conversations`,
          BEARER
        );

        expect([answered.status, answered.body]).toEqual([
          400,
          '{"error":"Email parameter required"}',
        ]);
      })
    )
  );

  it.effect("allows every admin route with a valid Access login", () =>
    withSite((client) =>
      Effect.gen(function* allowAccessLogin() {
        const answered = yield* client.get(`${ADMIN_PREFIX}/conversations`, {
          "cf-access-jwt-assertion": GOOD_ACCESS_TOKEN,
        });

        expect(answered.status).toBe(200);
      })
    )
  );

  it.effect(
    "refuses every admin route for a missing, visitor or malformed login",
    () =>
      withSite((client) =>
        Effect.gen(function* refuseEveryRoute() {
          const cases: readonly AdminRequest[] = adminRequests().flatMap(
            (route) =>
              REFUSED_IDENTITIES.map((identity) => ({
                headers: identity.headers,
                method: route.method,
                path: route.path,
              }))
          );

          const answers = yield* Effect.all(
            cases.map((request) => send(client, request)),
            { concurrency: 1 }
          );

          expect(answers.map(({ body, status }) => [status, body])).toEqual(
            cases.map(() => [401, '{"error":"Unauthorized"}'])
          );
        })
      )
  );

  it.effect("walks every admin route the capability list holds", () =>
    withSite((client) =>
      Effect.gen(function* walkRoutes() {
        const routesUnderTest = adminRequests();

        expect(
          routesUnderTest.map(({ method, path }) => `${method} ${path}`)
        ).toEqual([
          "GET /admin/api/conversations",
          "POST /admin/api/conversations/bulk/archive",
          "GET /admin/api/conversations/:id",
          "POST /admin/api/conversations/:id/accept",
          "POST /admin/api/conversations/:id/takeover",
          "POST /admin/api/conversations/:id/message",
          "POST /admin/api/conversations/:id/close",
          "POST /admin/api/conversations/:id/archive",
          "POST /admin/api/conversations/:id/unarchive",
          "GET /admin/api/usage",
          "GET /admin/api/customers/conversations",
        ]);

        const answered = yield* client.get(
          `${ADMIN_PREFIX}/conversations`,
          BEARER
        );

        expect(answered.status).toBe(200);
      })
    )
  );
});
