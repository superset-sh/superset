CREATE TABLE `closed_panes` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`pane_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`descriptor` text NOT NULL,
	`terminal_id` text,
	`closed_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`restored_at` integer,
	`restored_terminal_id` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `closed_panes_workspace_idx` ON `closed_panes` (`workspace_id`,`closed_at`);--> statement-breakpoint
ALTER TABLE `terminal_sessions` ADD `recovery_id` text;--> statement-breakpoint
ALTER TABLE `terminal_sessions` ADD `recovery_until` integer;