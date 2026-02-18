ALTER TABLE `projects` ADD `vcs_type` text;--> statement-breakpoint
UPDATE `projects` SET `vcs_type` = 'git' WHERE `vcs_type` IS NULL;