CREATE UNIQUE INDEX IF NOT EXISTS `workspaces_unique_branch_per_project` ON `workspaces` (`project_id`) WHERE `type` = 'branch';
