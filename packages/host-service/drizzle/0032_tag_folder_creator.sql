PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_tag_folder_settings` (
	`scope` text NOT NULL,
	`tag` text NOT NULL,
	`created_by_user_id` text DEFAULT '' NOT NULL,
	`display_name` text,
	`color` text,
	`tab_order` integer,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`scope`, `tag`, `created_by_user_id`)
);
--> statement-breakpoint
INSERT INTO `__new_tag_folder_settings`("scope", "tag", "created_by_user_id", "display_name", "color", "tab_order", "updated_at") SELECT "scope", "tag", '', "display_name", "color", "tab_order", "updated_at" FROM `tag_folder_settings`;--> statement-breakpoint
DROP TABLE `tag_folder_settings`;--> statement-breakpoint
ALTER TABLE `__new_tag_folder_settings` RENAME TO `tag_folder_settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;