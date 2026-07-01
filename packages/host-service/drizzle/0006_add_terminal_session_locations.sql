CREATE TABLE `terminal_session_locations` (
	`pane_id` text PRIMARY KEY NOT NULL,
	`tab_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`workspace_name` text,
	`workspace_path` text,
	`root_path` text,
	`cwd` text NOT NULL,
	`command` text,
	`pid` integer,
	`agent_id` text,
	`agent_session_id` text,
	`status` text DEFAULT 'available' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`exited_at` integer,
	`exit_reason` text,
	`location_key` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `terminal_session_locations_location_key_unique` ON `terminal_session_locations` (`location_key`);--> statement-breakpoint
CREATE INDEX `terminal_session_locations_workspace_id_idx` ON `terminal_session_locations` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `terminal_session_locations_status_idx` ON `terminal_session_locations` (`status`);--> statement-breakpoint
CREATE INDEX `terminal_session_locations_updated_at_idx` ON `terminal_session_locations` (`updated_at`);
