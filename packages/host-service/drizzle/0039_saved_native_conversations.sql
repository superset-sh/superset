CREATE TABLE `saved_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`provider` text NOT NULL,
	`native_session_id` text NOT NULL,
	`store_path` text NOT NULL,
	`transcript_path` text NOT NULL,
	`cwd` text NOT NULL,
	`definition_id` text NOT NULL,
	`account_json` text NOT NULL,
	`provenance_json` text NOT NULL,
	`adopted_at` integer NOT NULL,
	`state` text DEFAULT 'adopted' NOT NULL,
	`terminal_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saved_conversations_native_store_idx` ON `saved_conversations` (`provider`,`native_session_id`,`store_path`);--> statement-breakpoint
CREATE INDEX `saved_conversations_workspace_idx` ON `saved_conversations` (`workspace_id`);