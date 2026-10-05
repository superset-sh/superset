CREATE TABLE `project_collection_placements` (
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`kind` text NOT NULL,
	`tab_order` integer DEFAULT 0 NOT NULL,
	`is_collapsed` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`organization_id`, `user_id`, `key`)
);
