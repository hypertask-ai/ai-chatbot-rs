CREATE TABLE `articles` (
	`id` text PRIMARY KEY,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`content` text NOT NULL,
	`excerpt` text,
	`category` text,
	`url` text,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch()),
	CONSTRAINT "articles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX `idx_articles_slug` ON `articles` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_articles_category` ON `articles` (`category`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY,
	`visitor_id` text NOT NULL,
	`visitor_secret_hash` text,
	`visitor_name` text,
	`visitor_email` text,
	`has_hypertask_account` text DEFAULT 'unknown',
	`profile_completed` integer DEFAULT 0,
	`status` text DEFAULT 'bot',
	`archived` integer DEFAULT 0,
	`is_eval` integer NOT NULL DEFAULT 0,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch()),
	CONSTRAINT "conversations_has_hypertask_account_check" CHECK(`has_hypertask_account` IN ('unknown', 'none', 'free', 'paid')),
	CONSTRAINT "conversations_status_check" CHECK(`status` IN ('bot', 'handoff_requested', 'human', 'closed'))
);
--> statement-breakpoint
CREATE INDEX `idx_conversations_status` ON `conversations` (`status`);--> statement-breakpoint
CREATE INDEX `idx_conversations_updated` ON `conversations` (`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_conversations_email` ON `conversations` (`visitor_email`);--> statement-breakpoint
CREATE INDEX `idx_conversations_archived` ON `conversations` (`archived`);--> statement-breakpoint
CREATE INDEX `idx_conversations_is_eval` ON `conversations` (`is_eval`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY,
	`conversation_id` text NOT NULL REFERENCES conversations(id),
	`role` text NOT NULL,
	`content` text NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`cache_read_input_tokens` integer,
	`cache_creation_input_tokens` integer,
	`model` text,
	`created_at` integer DEFAULT (unixepoch()),
	CONSTRAINT "messages_role_check" CHECK(`role` IN ('user', 'bot', 'admin'))
);
--> statement-breakpoint
CREATE INDEX `idx_messages_conversation` ON `messages` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `idx_messages_conversation_created_at` ON `messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_messages_created_role` ON `messages` (`created_at`,`role`);--> statement-breakpoint
CREATE TABLE `chat_response_cache` (
	`cache_key` text PRIMARY KEY,
	`response` text NOT NULL,
	`created_at` integer NOT NULL DEFAULT (unixepoch()),
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_chat_response_cache_expires` ON `chat_response_cache` (`expires_at`);
