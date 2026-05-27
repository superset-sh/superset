CREATE TABLE `host_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`worktree_base_dir` text,
	`branch_prefix_mode` text,
	`branch_prefix_custom` text
);
--> statement-breakpoint
ALTER TABLE `projects` ADD `worktree_base_dir` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `branch_prefix_mode` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `branch_prefix_custom` text;