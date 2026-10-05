CREATE TABLE `project_tags` (
	`project_id` text NOT NULL,
	`tag` text NOT NULL,
	`created_by_user_id` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`project_id`, `tag`, `created_by_user_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_tags_tag_idx` ON `project_tags` (`tag`);