CREATE TABLE `workspace_setup_runs` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `projects` ADD `default_base_ref` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `shared_file_paths` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `setup_suggestion_dismissed` integer DEFAULT false NOT NULL;