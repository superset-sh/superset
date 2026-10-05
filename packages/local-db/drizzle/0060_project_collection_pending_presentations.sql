CREATE TABLE `project_collection_pending_presentations` (
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`machine_id` text NOT NULL,
	`tag` text NOT NULL,
	`setting` text NOT NULL,
	PRIMARY KEY(`organization_id`, `user_id`, `machine_id`, `tag`)
);
