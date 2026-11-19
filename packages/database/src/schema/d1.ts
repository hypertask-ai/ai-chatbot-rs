import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const RunLogs = sqliteTable(
  "run_logs",
  {
    capability: text("capability").notNull(),
    failureTag: text("failure_tag"),
    id: text("id").primaryKey().notNull(),
    outcome: text("outcome").notNull(),
    personId: text("person_id").notNull(),
    recordedAt: integer("recorded_at").notNull(),
  },
  (table) => [
    index("run_logs_person_recent_idx").on(
      table.personId,
      table.recordedAt,
      table.id
    ),
    check(
      "run_logs_outcome_check",
      sql`${table.outcome} IN ('Succeeded', 'Failed')`
    ),
    check(
      "run_logs_failure_tag_check",
      sql`(${table.outcome} = 'Succeeded' AND ${table.failureTag} IS NULL) OR (${table.outcome} = 'Failed' AND ${table.failureTag} IS NOT NULL)`
    ),
  ]
);

export const Articles = sqliteTable(
  "articles",
  {
    category: text("category"),
    content: text("content").notNull(),
    createdAt: integer("created_at").default(sql`(unixepoch())`),
    excerpt: text("excerpt"),
    id: text("id").primaryKey().notNull(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    updatedAt: integer("updated_at").default(sql`(unixepoch())`),
    url: text("url"),
  },
  (table) => [
    index("idx_articles_slug").on(table.slug),
    index("idx_articles_category").on(table.category),
  ]
);

export const Conversations = sqliteTable(
  "conversations",
  {
    archived: integer("archived").default(0),
    createdAt: integer("created_at").default(sql`(unixepoch())`),
    hasHypertaskAccount: text("has_hypertask_account").default("unknown"),
    id: text("id").primaryKey().notNull(),
    isEval: integer("is_eval").notNull().default(0),
    profileCompleted: integer("profile_completed").default(0),
    status: text("status").default("bot"),
    updatedAt: integer("updated_at").default(sql`(unixepoch())`),
    visitorEmail: text("visitor_email"),
    visitorId: text("visitor_id").notNull(),
    visitorName: text("visitor_name"),
    visitorSecretHash: text("visitor_secret_hash"),
  },
  (table) => [
    index("idx_conversations_status").on(table.status),
    index("idx_conversations_updated").on(table.updatedAt),
    index("idx_conversations_email").on(table.visitorEmail),
    index("idx_conversations_archived").on(table.archived),
    index("idx_conversations_is_eval").on(table.isEval),
    check(
      "conversations_has_hypertask_account_check",
      sql`${table.hasHypertaskAccount} IN ('unknown', 'none', 'free', 'paid')`
    ),
    check(
      "conversations_status_check",
      sql`${table.status} IN ('bot', 'handoff_requested', 'human', 'closed')`
    ),
  ]
);

export const Messages = sqliteTable(
  "messages",
  {
    cacheCreationInputTokens: integer("cache_creation_input_tokens"),
    cacheReadInputTokens: integer("cache_read_input_tokens"),
    content: text("content").notNull(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => Conversations.id),
    createdAt: integer("created_at").default(sql`(unixepoch())`),
    id: text("id").primaryKey().notNull(),
    inputTokens: integer("input_tokens"),
    model: text("model"),
    outputTokens: integer("output_tokens"),
    role: text("role").notNull(),
  },
  (table) => [
    index("idx_messages_conversation").on(table.conversationId),
    index("idx_messages_conversation_created_at").on(
      table.conversationId,
      table.createdAt
    ),
    index("idx_messages_created_role").on(table.createdAt, table.role),
    check(
      "messages_role_check",
      sql`${table.role} IN ('user', 'bot', 'admin')`
    ),
  ]
);

export const ChatResponseCache = sqliteTable(
  "chat_response_cache",
  {
    cacheKey: text("cache_key").primaryKey().notNull(),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),
    expiresAt: integer("expires_at").notNull(),
    response: text("response").notNull(),
  },
  (table) => [index("idx_chat_response_cache_expires").on(table.expiresAt)]
);
