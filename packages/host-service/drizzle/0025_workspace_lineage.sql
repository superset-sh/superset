ALTER TABLE `workspaces` ADD `parent_workspace_id` text REFERENCES workspaces(id);--> statement-breakpoint
ALTER TABLE `workspaces` ADD `spawn_origin` text;--> statement-breakpoint
CREATE INDEX `workspaces_parent_workspace_id_idx` ON `workspaces` (`parent_workspace_id`);