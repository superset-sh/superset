CREATE TABLE `project_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`position` integer NOT NULL,
	`folder` text NOT NULL,
	`repo_path` text,
	`repo_url` text,
	`base_branch` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_folders_project_position_unique` ON `project_folders` (`project_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_folders_project_folder_unique` ON `project_folders` (`project_id`,`folder`);--> statement-breakpoint
CREATE TABLE `workspace_repos` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`position` integer NOT NULL,
	`project_id` text NOT NULL,
	`folder` text NOT NULL,
	`worktree_path` text NOT NULL,
	`branch` text NOT NULL,
	`base_branch` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_repos_workspace_position_unique` ON `workspace_repos` (`workspace_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_repos_workspace_project_unique` ON `workspace_repos` (`workspace_id`,`project_id`);--> statement-breakpoint
CREATE INDEX `workspace_repos_project_id_idx` ON `workspace_repos` (`project_id`);--> statement-breakpoint
ALTER TABLE `workspaces` ADD `root_path` text;