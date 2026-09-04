CREATE TABLE `tag_folder_settings` (
	`scope` text NOT NULL,
	`tag` text NOT NULL,
	`display_name` text,
	`color` text,
	`tab_order` integer,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`scope`, `tag`)
);
--> statement-breakpoint
-- Carry existing project folders over: the old project_id becomes the scope.
-- The Sessions lane had no rows to migrate, since it could not have any.
INSERT OR IGNORE INTO `tag_folder_settings` (`scope`, `tag`, `display_name`, `color`, `tab_order`, `updated_at`)
SELECT `project_id`, `tag`, `display_name`, `color`, `tab_order`, `updated_at` FROM `workspace_tag_settings`;
--> statement-breakpoint
DROP TABLE `workspace_tag_settings`;
