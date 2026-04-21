DROP INDEX `workspaces_branch_idx`;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `upstream_owner` text;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `upstream_repo` text;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `upstream_branch` text;--> statement-breakpoint
CREATE INDEX `workspaces_upstream_ref_idx` ON `workspaces` (`upstream_owner`,`upstream_repo`,`upstream_branch`);