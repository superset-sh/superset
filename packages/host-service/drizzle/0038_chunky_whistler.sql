DROP INDEX `pull_requests_repo_branch_idx`;--> statement-breakpoint
DROP INDEX `pull_requests_repo_pr_unique`;--> statement-breakpoint
ALTER TABLE `pull_requests` ADD `repo_instance` text DEFAULT 'https://github.com' NOT NULL;--> statement-breakpoint
CREATE INDEX `pull_requests_repo_branch_idx` ON `pull_requests` (`repo_provider`,`repo_instance`,`repo_owner`,`repo_name`,`head_branch`);--> statement-breakpoint
CREATE UNIQUE INDEX `pull_requests_repo_pr_unique` ON `pull_requests` (`repo_provider`,`repo_instance`,`repo_owner`,`repo_name`,`pr_number`);--> statement-breakpoint
ALTER TABLE `projects` ADD `repo_instance` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `repo_project_id` integer;--> statement-breakpoint
UPDATE `projects` SET `repo_instance` = 'https://github.com' WHERE `repo_provider` = 'github';
