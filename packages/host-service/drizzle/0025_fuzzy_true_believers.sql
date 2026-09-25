CREATE TABLE `workspace_pull_requests` (
	`workspace_id` text NOT NULL,
	`pull_request_id` text NOT NULL,
	`linked_at` integer NOT NULL,
	PRIMARY KEY(`workspace_id`, `pull_request_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pull_request_id`) REFERENCES `pull_requests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workspace_pull_requests_workspace_idx` ON `workspace_pull_requests` (`workspace_id`);--> statement-breakpoint
INSERT INTO `workspace_pull_requests` (`workspace_id`, `pull_request_id`, `linked_at`)
SELECT `w`.`id`, `w`.`pull_request_id`, CAST(strftime('%s','now') AS INTEGER) * 1000
FROM `workspaces` `w`
JOIN `pull_requests` `p` ON `p`.`id` = `w`.`pull_request_id`
WHERE `w`.`pull_request_id` IS NOT NULL
ON CONFLICT DO NOTHING;
