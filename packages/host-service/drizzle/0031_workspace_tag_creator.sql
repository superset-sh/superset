PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_workspace_tags` (
	`workspace_id` text NOT NULL,
	`tag` text NOT NULL,
	`created_by_user_id` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`workspace_id`, `tag`, `created_by_user_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_workspace_tags`("workspace_id", "tag", "created_by_user_id", "created_at") SELECT `workspace_tags`.`workspace_id`, `workspace_tags`.`tag`, COALESCE(`workspaces`.`created_by_user_id`, ''), `workspace_tags`.`created_at` FROM `workspace_tags` LEFT JOIN `workspaces` ON `workspaces`.`id` = `workspace_tags`.`workspace_id`;--> statement-breakpoint
DROP TABLE `workspace_tags`;--> statement-breakpoint
ALTER TABLE `__new_workspace_tags` RENAME TO `workspace_tags`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `workspace_tags_tag_idx` ON `workspace_tags` (`tag`);