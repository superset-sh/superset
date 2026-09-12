ALTER TABLE `workspaces` ADD `shelved_at` integer;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `purge_blocked_reason` text;--> statement-breakpoint
CREATE INDEX `workspaces_shelved_at_idx` ON `workspaces` (`shelved_at`);