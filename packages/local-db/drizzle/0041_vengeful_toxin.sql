ALTER TABLE `projects` ADD `archived_at` integer;--> statement-breakpoint
CREATE INDEX `projects_archived_at_idx` ON `projects` (`archived_at`);