ALTER TABLE `workspaces` ADD `cloud_workspace_id` text;--> statement-breakpoint
CREATE INDEX `workspaces_cloud_workspace_id_idx` ON `workspaces` (`cloud_workspace_id`);