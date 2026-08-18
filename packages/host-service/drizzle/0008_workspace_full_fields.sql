CREATE TABLE `workspace_cloud_deletes` (
	`id` text PRIMARY KEY NOT NULL,
	`queued_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `workspaces` ADD `name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `type` text DEFAULT 'worktree' NOT NULL;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `task_id` text;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `created_by_user_id` text;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `cloud_synced_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_one_main_per_project` ON `workspaces` (`project_id`) WHERE type = 'main';