CREATE TABLE `project_group_members` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`project_id` text NOT NULL,
	`position` integer NOT NULL,
	`folder` text NOT NULL,
	`base_branch` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `project_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_group_members_group_position_unique` ON `project_group_members` (`group_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_group_members_group_folder_unique` ON `project_group_members` (`group_id`,`folder`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_group_members_group_project_unique` ON `project_group_members` (`group_id`,`project_id`);--> statement-breakpoint
CREATE INDEX `project_group_members_project_id_idx` ON `project_group_members` (`project_id`);--> statement-breakpoint
CREATE TABLE `project_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`color` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `workspaces` ADD `group_id` text REFERENCES project_groups(id);