CREATE TABLE `project_collection_deletions` (
	`tag` text NOT NULL,
	`created_by_user_id` text DEFAULT '' NOT NULL,
	`deleted_at` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`tag`, `created_by_user_id`)
);
