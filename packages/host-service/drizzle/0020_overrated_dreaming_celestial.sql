ALTER TABLE `pull_requests` ADD `merged_at` integer;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `archived_at` integer;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `archive_reason` text;--> statement-breakpoint
CREATE INDEX `workspaces_archived_at_idx` ON `workspaces` (`archived_at`);