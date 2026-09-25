PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`worktree_path` text NOT NULL,
	`branch` text NOT NULL,
	`head_sha` text,
	`upstream_owner` text,
	`upstream_repo` text,
	`upstream_branch` text,
	`pull_request_id` text,
	`suppressed_pull_request_id` text,
	`name` text DEFAULT '' NOT NULL,
	`type` text DEFAULT 'worktree' NOT NULL,
	`task_id` text,
	`created_by_user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL,
	`cloud_synced_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pull_request_id`) REFERENCES `pull_requests`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`suppressed_pull_request_id`) REFERENCES `pull_requests`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_workspaces`("id", "project_id", "worktree_path", "branch", "head_sha", "upstream_owner", "upstream_repo", "upstream_branch", "pull_request_id", "suppressed_pull_request_id", "name", "type", "task_id", "created_by_user_id", "created_at", "updated_at", "cloud_synced_at") SELECT "id", "project_id", "worktree_path", "branch", "head_sha", "upstream_owner", "upstream_repo", "upstream_branch", "pull_request_id", "suppressed_pull_request_id", "name", "type", "task_id", "created_by_user_id", "created_at", "updated_at", "cloud_synced_at" FROM `workspaces`;--> statement-breakpoint
DROP TABLE `workspaces`;--> statement-breakpoint
ALTER TABLE `__new_workspaces` RENAME TO `workspaces`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `workspaces_project_id_idx` ON `workspaces` (`project_id`);--> statement-breakpoint
CREATE INDEX `workspaces_upstream_ref_idx` ON `workspaces` (`upstream_owner`,`upstream_repo`,`upstream_branch`);--> statement-breakpoint
CREATE INDEX `workspaces_pull_request_id_idx` ON `workspaces` (`pull_request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_one_main_per_project` ON `workspaces` (`project_id`) WHERE type = 'main';