PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_terminal_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`origin_workspace_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`last_attached_at` integer,
	`ended_at` integer,
	`tab_id` text,
	`workspace_name` text,
	`workspace_path` text,
	`root_path` text,
	`cwd` text,
	`command` text,
	`pid` integer,
	`agent_id` text,
	`agent_session_id` text,
	`updated_at` integer,
	`exit_reason` text,
	`location_key` text
);--> statement-breakpoint
INSERT INTO `__new_terminal_sessions` (
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
FROM `terminal_sessions`;--> statement-breakpoint
DROP TABLE `terminal_sessions`;--> statement-breakpoint
ALTER TABLE `__new_terminal_sessions` RENAME TO `terminal_sessions`;--> statement-breakpoint
CREATE INDEX `terminal_sessions_origin_workspace_id_idx` ON `terminal_sessions` (`origin_workspace_id`);--> statement-breakpoint
CREATE INDEX `terminal_sessions_status_idx` ON `terminal_sessions` (`status`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
