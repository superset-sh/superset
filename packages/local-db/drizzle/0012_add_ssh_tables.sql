CREATE TABLE `remote_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`ssh_connection_id` text NOT NULL,
	`remote_path` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`tab_order` integer,
	`last_opened_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`default_branch` text,
	FOREIGN KEY (`ssh_connection_id`) REFERENCES `ssh_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `remote_projects_ssh_connection_id_idx` ON `remote_projects` (`ssh_connection_id`);--> statement-breakpoint
CREATE INDEX `remote_projects_last_opened_at_idx` ON `remote_projects` (`last_opened_at`);--> statement-breakpoint
CREATE TABLE `remote_workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`remote_project_id` text NOT NULL,
	`branch` text NOT NULL,
	`name` text NOT NULL,
	`tab_order` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_opened_at` integer NOT NULL,
	`is_unread` integer DEFAULT false,
	`deleting_at` integer,
	FOREIGN KEY (`remote_project_id`) REFERENCES `remote_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `remote_workspaces_remote_project_id_idx` ON `remote_workspaces` (`remote_project_id`);--> statement-breakpoint
CREATE INDEX `remote_workspaces_last_opened_at_idx` ON `remote_workspaces` (`last_opened_at`);--> statement-breakpoint
CREATE TABLE `ssh_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`host` text NOT NULL,
	`port` integer DEFAULT 22 NOT NULL,
	`username` text NOT NULL,
	`auth_method` text NOT NULL,
	`private_key_path` text,
	`agent_forward` integer,
	`remote_work_dir` text,
	`keep_alive_interval` integer,
	`connection_timeout` integer,
	`created_at` integer NOT NULL,
	`last_connected_at` integer
);
--> statement-breakpoint
CREATE INDEX `ssh_connections_name_idx` ON `ssh_connections` (`name`);--> statement-breakpoint
CREATE INDEX `ssh_connections_host_idx` ON `ssh_connections` (`host`);