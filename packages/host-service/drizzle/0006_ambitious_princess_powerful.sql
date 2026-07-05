CREATE TABLE `terminal_agent_bindings` (
	`terminal_id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`agent_session_id` text,
	`definition_id` text,
	`started_at` integer NOT NULL,
	`last_event_at` integer NOT NULL,
	`last_event_type` text NOT NULL,
	FOREIGN KEY (`terminal_id`) REFERENCES `terminal_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `terminal_agent_bindings_workspace_id_idx` ON `terminal_agent_bindings` (`workspace_id`);