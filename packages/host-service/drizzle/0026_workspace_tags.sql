CREATE TABLE `workspace_tags` (
	`workspace_id` text NOT NULL,
	`tag` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_tags_unique` ON `workspace_tags` (`workspace_id`,`tag`);--> statement-breakpoint
CREATE INDEX `workspace_tags_tag_idx` ON `workspace_tags` (`tag`);