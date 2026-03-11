CREATE TABLE `workspace_sections` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`tab_order` integer NOT NULL,
	`is_collapsed` integer DEFAULT false,
	`color` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workspace_sections_project_id_idx` ON `workspace_sections` (`project_id`);--> statement-breakpoint
ALTER TABLE `workspaces` ADD `section_id` text REFERENCES workspace_sections(id);--> statement-breakpoint
CREATE INDEX `workspaces_section_id_idx` ON `workspaces` (`section_id`);