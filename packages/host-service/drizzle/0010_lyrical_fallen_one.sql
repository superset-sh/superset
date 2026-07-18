CREATE TABLE `sidebar_sections` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`tab_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sidebar_sections_project_id_idx` ON `sidebar_sections` (`project_id`);--> statement-breakpoint
ALTER TABLE `workspaces` ADD `section_id` text;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `tab_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `workspaces_section_id_idx` ON `workspaces` (`section_id`);
