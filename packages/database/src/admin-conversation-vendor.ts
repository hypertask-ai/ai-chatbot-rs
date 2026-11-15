import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Drizzle from "@alchemy.run/drizzle";
import * as RuntimeContext from "alchemy/RuntimeContext";
import { and, asc, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";

import { adminConversationLayer, queryFailure } from "./admin-conversation.js";
import { Conversations, Messages } from "./schema/d1.js";
import type { DatabaseVendorResource } from "./vendor.js";

export const ADMIN_INBOX_LIMIT = 50;

const PROMPT_TIER_TOKENS = 100_000;

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

const usageColumns = {
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
};

export const AdminConversationStoreLayer = (vendor: DatabaseVendorResource) =>
  Layer.unwrap(
    Match.value(vendor).pipe(
      Match.tags({
        D1: (d1) =>
          Effect.gen(function* buildD1AdminConversationStoreLayer() {
            const client = yield* Cloudflare.D1.QueryDatabase(d1.database);

            const db = yield* Drizzle.D1(client);

            return adminConversationLayer(
              Effect.succeed({
                appendMessage: (message) =>
                  db
                    .insert(Messages)
                    .values({
                      content: message.content,
                      conversationId: message.conversationId,
                      id: message.id,
                      role: "admin",
                    })
                    .pipe(
                      Effect.asVoid,
                      Effect.mapError(queryFailure("setAdminMessage")),
                      Effect.provide(RuntimeContext.RuntimeContext.phantom)
                    ),
                archiveMany: (change) =>
                  db
                    .update(Conversations)
                    .set({ archived: 1, updatedAt: change.at })
                    .where(inArray(Conversations.id, [...change.ids]))
                    .pipe(
                      Effect.asVoid,
                      Effect.mapError(
                        queryFailure("archiveAdminConversations")
                      ),
                      Effect.provide(RuntimeContext.RuntimeContext.phantom)
                    ),
                listCustomer: (email) =>
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
                    .pipe(
                      Effect.mapError(
                        queryFailure("listCustomerConversations")
                      ),
                      Effect.provide(RuntimeContext.RuntimeContext.phantom)
                    ),
                listInbox: (query) =>
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
                    .limit(ADMIN_INBOX_LIMIT)
                    .pipe(
                      Effect.mapError(queryFailure("listAdminConversations")),
                      Effect.provide(RuntimeContext.RuntimeContext.phantom)
                    ),
                listMessages: (conversationId) =>
                  db
                    .select(messageColumns)
                    .from(Messages)
                    .where(eq(Messages.conversationId, conversationId))
                    .orderBy(asc(Messages.createdAt))
                    .pipe(
                      Effect.mapError(queryFailure("listAdminMessages")),
                      Effect.provide(RuntimeContext.RuntimeContext.phantom)
                    ),
                readConversation: (id) =>
                  db
                    .select(conversationColumns)
                    .from(Conversations)
                    .where(eq(Conversations.id, id))
                    .limit(1)
                    .pipe(
                      Effect.mapError(queryFailure("readAdminConversation")),
                      Effect.provide(RuntimeContext.RuntimeContext.phantom)
                    ),
                setArchived: (change) =>
                  db
                    .update(Conversations)
                    .set({
                      archived: change.archived ? 1 : 0,
                      updatedAt: change.at,
                    })
                    .where(eq(Conversations.id, change.id))
                    .pipe(
                      Effect.asVoid,
                      Effect.mapError(queryFailure("setAdminArchived")),
                      Effect.provide(RuntimeContext.RuntimeContext.phantom)
                    ),
                setStatus: (change) =>
                  db
                    .update(Conversations)
                    .set({ status: change.status, updatedAt: change.at })
                    .where(eq(Conversations.id, change.id))
                    .pipe(
                      Effect.asVoid,
                      Effect.mapError(queryFailure("setAdminStatus")),
                      Effect.provide(RuntimeContext.RuntimeContext.phantom)
                    ),
                setUpdatedAt: (change) =>
                  db
                    .update(Conversations)
                    .set({ updatedAt: change.at })
                    .where(eq(Conversations.id, change.id))
                    .pipe(
                      Effect.asVoid,
                      Effect.mapError(queryFailure("touchAdminConversation")),
                      Effect.provide(RuntimeContext.RuntimeContext.phantom)
                    ),
                usageRows: (since) =>
                  db
                    .select(usageColumns)
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
                    .pipe(
                      Effect.mapError(queryFailure("readAdminUsage")),
                      Effect.provide(RuntimeContext.RuntimeContext.phantom)
                    ),
              })
            );
          }),
        HyperdrivePostgres: () =>
          Effect.die(
            "Admin conversations have no Postgres adapter yet. Fix: provide the D1 vendor, or add the Postgres tables and adapter before choosing that vendor."
          ),
      }),
      Match.exhaustive
    )
  );
