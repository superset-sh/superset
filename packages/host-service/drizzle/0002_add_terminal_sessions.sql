CREATE TABLE `terminal_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`cwd` text NOT NULL,
	`shell` text NOT NULL,
	`launch_mode` text DEFAULT 'workspace-shell' NOT NULL,
	`command` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`last_attached_at` integer,
	`ended_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `terminal_sessions_workspace_id_idx` ON `terminal_sessions` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `terminal_sessions_status_idx` ON `terminal_sessions` (`status`);