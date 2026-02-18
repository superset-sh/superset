ALTER TABLE `ssh_connections` ADD `connection_status` text;--> statement-breakpoint
ALTER TABLE `ssh_connections` ADD `updated_at` integer;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `ssh_connection_id` text;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `remote_path` text;