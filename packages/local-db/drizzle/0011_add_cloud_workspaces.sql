-- Add cloud_workspaces synced table (mirrored from cloud Postgres via Electric SQL)
CREATE TABLE `cloud_workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL REFERENCES `organizations`(`id`) ON DELETE CASCADE,
	`repository_id` text NOT NULL,
	`name` text NOT NULL,
	`branch` text NOT NULL,
	`provider_type` text NOT NULL,
	`provider_vm_id` text,
	`status` text NOT NULL,
	`status_message` text,
	`creator_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`auto_stop_minutes` integer NOT NULL DEFAULT 30,
	`last_active_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);

CREATE INDEX `cloud_workspaces_organization_id_idx` ON `cloud_workspaces` (`organization_id`);
CREATE INDEX `cloud_workspaces_creator_id_idx` ON `cloud_workspaces` (`creator_id`);
CREATE INDEX `cloud_workspaces_status_idx` ON `cloud_workspaces` (`status`);

-- Add cloud workspace link to workspaces table
ALTER TABLE `workspaces` ADD `cloud_workspace_id` text;
