DROP INDEX `workspaces_one_main_per_project`;--> statement-breakpoint
UPDATE `workspaces` SET `name` = 'local' WHERE `type` = 'main' AND `name` = `branch`;--> statement-breakpoint
UPDATE `workspaces` SET `type` = 'local' WHERE `type` = 'main';
