ALTER TABLE `terminal_sessions` ADD COLUMN `tab_id` text;--> statement-breakpoint
ALTER TABLE `terminal_sessions` ADD COLUMN `workspace_name` text;--> statement-breakpoint
ALTER TABLE `terminal_sessions` ADD COLUMN `workspace_path` text;--> statement-breakpoint
ALTER TABLE `terminal_sessions` ADD COLUMN `root_path` text;--> statement-breakpoint
ALTER TABLE `terminal_sessions` ADD COLUMN `cwd` text;--> statement-breakpoint
ALTER TABLE `terminal_sessions` ADD COLUMN `command` text;--> statement-breakpoint
ALTER TABLE `terminal_sessions` ADD COLUMN `pid` integer;--> statement-breakpoint
ALTER TABLE `terminal_sessions` ADD COLUMN `agent_id` text;--> statement-breakpoint
ALTER TABLE `terminal_sessions` ADD COLUMN `agent_session_id` text;--> statement-breakpoint
ALTER TABLE `terminal_sessions` ADD COLUMN `updated_at` integer;--> statement-breakpoint
ALTER TABLE `terminal_sessions` ADD COLUMN `exit_reason` text;--> statement-breakpoint
ALTER TABLE `terminal_sessions` ADD COLUMN `location_key` text;--> statement-breakpoint
UPDATE `terminal_sessions`
SET
	`origin_workspace_id` = COALESCE(
		`origin_workspace_id`,
		(
			SELECT `workspace_id`
			FROM `terminal_session_locations`
			WHERE `pane_id` = `terminal_sessions`.`id`
		)
	),
	`status` = CASE
		WHEN `status` = 'disposed' THEN `status`
		WHEN EXISTS (
			SELECT 1
			FROM `terminal_session_locations`
			WHERE `pane_id` = `terminal_sessions`.`id`
				AND `status` = 'exited'
		) THEN 'exited'
		ELSE `status`
	END,
	`created_at` = COALESCE(
		`created_at`,
		(
			SELECT `created_at`
			FROM `terminal_session_locations`
			WHERE `pane_id` = `terminal_sessions`.`id`
		)
	),
	`ended_at` = COALESCE(
		(
			SELECT `exited_at`
			FROM `terminal_session_locations`
			WHERE `pane_id` = `terminal_sessions`.`id`
		),
		`ended_at`
	),
	`tab_id` = COALESCE(
		(
			SELECT `tab_id`
			FROM `terminal_session_locations`
			WHERE `pane_id` = `terminal_sessions`.`id`
		),
		`tab_id`
	),
	`workspace_name` = COALESCE(
		(
			SELECT `workspace_name`
			FROM `terminal_session_locations`
			WHERE `pane_id` = `terminal_sessions`.`id`
		),
		`workspace_name`
	),
	`workspace_path` = COALESCE(
		(
			SELECT `workspace_path`
			FROM `terminal_session_locations`
			WHERE `pane_id` = `terminal_sessions`.`id`
		),
		`workspace_path`
	),
	`root_path` = COALESCE(
		(
			SELECT `root_path`
			FROM `terminal_session_locations`
			WHERE `pane_id` = `terminal_sessions`.`id`
		),
		`root_path`
	),
	`cwd` = COALESCE(
		(
			SELECT `cwd`
			FROM `terminal_session_locations`
			WHERE `pane_id` = `terminal_sessions`.`id`
		),
		`cwd`
	),
	`command` = COALESCE(
		(
			SELECT `command`
			FROM `terminal_session_locations`
			WHERE `pane_id` = `terminal_sessions`.`id`
		),
		`command`
	),
	`pid` = COALESCE(
		(
			SELECT `pid`
			FROM `terminal_session_locations`
			WHERE `pane_id` = `terminal_sessions`.`id`
		),
		`pid`
	),
	`agent_id` = COALESCE(
		(
			SELECT `agent_id`
			FROM `terminal_session_locations`
			WHERE `pane_id` = `terminal_sessions`.`id`
		),
		`agent_id`
	),
	`agent_session_id` = COALESCE(
		(
			SELECT `agent_session_id`
			FROM `terminal_session_locations`
			WHERE `pane_id` = `terminal_sessions`.`id`
		),
		`agent_session_id`
	),
	`updated_at` = COALESCE(
		(
			SELECT `updated_at`
			FROM `terminal_session_locations`
			WHERE `pane_id` = `terminal_sessions`.`id`
		),
		`updated_at`
	),
	`exit_reason` = COALESCE(
		(
			SELECT `exit_reason`
			FROM `terminal_session_locations`
			WHERE `pane_id` = `terminal_sessions`.`id`
		),
		`exit_reason`
	),
	`location_key` = COALESCE(
		(
			SELECT `location_key`
			FROM `terminal_session_locations`
			WHERE `pane_id` = `terminal_sessions`.`id`
		),
		`location_key`
	)
WHERE `id` IN (
	SELECT `pane_id` FROM `terminal_session_locations`
);--> statement-breakpoint
INSERT INTO `terminal_sessions` (
	`id`,
	`origin_workspace_id`,
	`status`,
	`created_at`,
	`last_attached_at`,
	`ended_at`,
	`tab_id`,
	`workspace_name`,
	`workspace_path`,
	`root_path`,
	`cwd`,
	`command`,
	`pid`,
	`agent_id`,
	`agent_session_id`,
	`updated_at`,
	`exit_reason`,
	`location_key`
)
SELECT
	`pane_id`,
	`workspace_id`,
	CASE
		WHEN `status` = 'exited' THEN 'exited'
		ELSE 'active'
	END,
	`created_at`,
	NULL,
	`exited_at`,
	`tab_id`,
	`workspace_name`,
	`workspace_path`,
	`root_path`,
	`cwd`,
	`command`,
	`pid`,
	`agent_id`,
	`agent_session_id`,
	`updated_at`,
	`exit_reason`,
	`location_key`
FROM `terminal_session_locations`
WHERE NOT EXISTS (
	SELECT 1
	FROM `terminal_sessions`
	WHERE `terminal_sessions`.`id` = `terminal_session_locations`.`pane_id`
);--> statement-breakpoint
DROP TABLE IF EXISTS `terminal_session_locations`;
