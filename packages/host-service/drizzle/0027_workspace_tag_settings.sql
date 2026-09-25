CREATE TABLE `workspace_tag_settings` (
	`project_id` text NOT NULL,
	`tag` text NOT NULL,
	`display_name` text,
	`color` text,
	`tab_order` integer,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`project_id`, `tag`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
