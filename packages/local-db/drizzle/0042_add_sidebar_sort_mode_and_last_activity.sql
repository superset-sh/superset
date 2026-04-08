ALTER TABLE `settings` ADD `sidebar_sort_mode` text;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `last_activity_at` integer;--> statement-breakpoint
CREATE INDEX `workspaces_last_activity_at_idx` ON `workspaces` (`last_activity_at`);