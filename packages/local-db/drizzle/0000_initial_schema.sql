CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`main_repo_path` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`tab_order` integer,
	`last_opened_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`config_toast_dismissed` integer,
	`default_branch` text
);
--> statement-breakpoint
CREATE INDEX `projects_main_repo_path_idx` ON `projects` (`main_repo_path`);--> statement-breakpoint
CREATE INDEX `projects_last_opened_at_idx` ON `projects` (`last_opened_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`last_active_workspace_id` text,
	`last_used_app` text,
	`terminal_presets` text,
	`terminal_presets_initialized` integer,
	`selected_ringtone_id` text
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`worktree_id` text,
	`type` text NOT NULL,
	`branch` text NOT NULL,
	`name` text NOT NULL,
	`tab_order` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_opened_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`worktree_id`) REFERENCES `worktrees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workspaces_project_id_idx` ON `workspaces` (`project_id`);--> statement-breakpoint
CREATE INDEX `workspaces_worktree_id_idx` ON `workspaces` (`worktree_id`);--> statement-breakpoint
CREATE INDEX `workspaces_last_opened_at_idx` ON `workspaces` (`last_opened_at`);--> statement-breakpoint
CREATE TABLE `worktrees` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`path` text NOT NULL,
	`branch` text NOT NULL,
	`base_branch` text,
	`created_at` integer NOT NULL,
	`git_status` text,
	`github_status` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `worktrees_project_id_idx` ON `worktrees` (`project_id`);--> statement-breakpoint
CREATE INDEX `worktrees_branch_idx` ON `worktrees` (`branch`);