ALTER TABLE `workspaces` ADD `parent_workspace_id` text REFERENCES workspaces(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `workspaces_parent_workspace_id_idx` ON `workspaces` (`parent_workspace_id`);
