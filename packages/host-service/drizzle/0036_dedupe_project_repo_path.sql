-- The v1 importer once minted several project rows for one repo path (#7702).
-- Fold each set into its oldest row before the unique index below makes the
-- duplicate impossible. Children move rather than die: the twin's workspaces
-- and PR rows are the user's, and pull_requests is already unique per repo+PR,
-- so nothing collides on the way over. A row whose project row is already
-- gone (a legacy orphan, which the runner tolerates) is left untouched:
-- pull_requests.project_id is NOT NULL, so writing the subquery's NULL there
-- would abort the migration and refuse to serve the database.
UPDATE `workspaces` SET `project_id` = (
	SELECT `keep`.`id` FROM `projects` `keep`
	JOIN `projects` `dup` ON `dup`.`repo_path` = `keep`.`repo_path`
	WHERE `dup`.`id` = `workspaces`.`project_id`
	ORDER BY `keep`.`created_at`, `keep`.`id` LIMIT 1
) WHERE `project_id` IS NOT NULL AND EXISTS (
	SELECT 1 FROM `projects` WHERE `projects`.`id` = `workspaces`.`project_id`
);--> statement-breakpoint
UPDATE `pull_requests` SET `project_id` = (
	SELECT `keep`.`id` FROM `projects` `keep`
	JOIN `projects` `dup` ON `dup`.`repo_path` = `keep`.`repo_path`
	WHERE `dup`.`id` = `pull_requests`.`project_id`
	ORDER BY `keep`.`created_at`, `keep`.`id` LIMIT 1
) WHERE EXISTS (
	SELECT 1 FROM `projects` WHERE `projects`.`id` = `pull_requests`.`project_id`
);--> statement-breakpoint
DELETE FROM `tag_folder_settings` WHERE `scope` IN (
	SELECT `dup`.`id` FROM `projects` `dup`
	WHERE `dup`.`id` <> (
		SELECT `keep`.`id` FROM `projects` `keep`
		WHERE `keep`.`repo_path` = `dup`.`repo_path`
		ORDER BY `keep`.`created_at`, `keep`.`id` LIMIT 1
	)
);--> statement-breakpoint
DELETE FROM `projects` WHERE `id` <> (
	SELECT `keep`.`id` FROM `projects` `keep`
	WHERE `keep`.`repo_path` = `projects`.`repo_path`
	ORDER BY `keep`.`created_at`, `keep`.`id` LIMIT 1
);--> statement-breakpoint
DROP INDEX `projects_repo_path_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `projects_repo_path_idx` ON `projects` (`repo_path`);
