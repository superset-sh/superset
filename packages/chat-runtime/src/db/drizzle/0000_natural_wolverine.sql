CREATE TABLE `chat_journal` (
	`session_id` text NOT NULL,
	`epoch` text NOT NULL,
	`seq` integer NOT NULL,
	`ts` integer NOT NULL,
	`event_json` text NOT NULL,
	PRIMARY KEY(`session_id`, `epoch`, `seq`)
);
--> statement-breakpoint
CREATE TABLE `chat_sessions_local` (
	`session_id` text PRIMARY KEY NOT NULL,
	`scope_id` text NOT NULL,
	`harness` text NOT NULL,
	`harness_session_id` text,
	`epoch` text NOT NULL,
	`status` text NOT NULL,
	`title` text,
	`queued_count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `chat_sessions_local_scope_id_idx` ON `chat_sessions_local` (`scope_id`);