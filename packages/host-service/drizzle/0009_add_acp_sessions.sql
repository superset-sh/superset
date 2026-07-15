CREATE TABLE `acp_sessions` (
	`session_id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`acp_session_id` text NOT NULL,
	`harness` text NOT NULL,
	`cwd` text NOT NULL,
	`title` text,
	`last_stop_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `acp_sessions_workspace_id_idx` ON `acp_sessions` (`workspace_id`);