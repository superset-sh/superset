CREATE TABLE `pull_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`repo_provider` text NOT NULL,
	`repo_owner` text NOT NULL,
	`repo_name` text NOT NULL,
	`pr_number` integer NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`state` text NOT NULL,
	`is_draft` integer DEFAULT false NOT NULL,
	`head_branch` text NOT NULL,
	`head_sha` text NOT NULL,
	`review_decision` text,
	`checks_status` text DEFAULT 'none' NOT NULL,
	`checks_json` text DEFAULT '[]' NOT NULL,
	`last_fetched_at` integer,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pull_requests_project_id_idx` ON `pull_requests` (`project_id`);--> statement-breakpoint
CREATE INDEX `pull_requests_repo_branch_idx` ON `pull_requests` (`repo_provider`,`repo_owner`,`repo_name`,`head_branch`);--> statement-breakpoint
CREATE UNIQUE INDEX `pull_requests_repo_pr_unique` ON `pull_requests` (`repo_provider`,`repo_owner`,`repo_name`,`pr_number`);--> statement-breakpoint
ALTER TABLE `projects` ADD `repo_provider` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `repo_owner` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `repo_name` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `repo_url` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `remote_name` text;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `head_sha` text;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `pull_request_id` text REFERENCES pull_requests(id);--> statement-breakpoint
CREATE INDEX `workspaces_pull_request_id_idx` ON `workspaces` (`pull_request_id`);