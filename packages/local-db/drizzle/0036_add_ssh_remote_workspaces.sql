CREATE TABLE `ssh_hosts` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`hostname` text NOT NULL,
	`port` integer DEFAULT 22,
	`username` text NOT NULL,
	`auth_method` text NOT NULL,
	`private_key_path` text,
	`default_directory` text,
	`last_connected_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ssh_hosts_hostname_idx` ON `ssh_hosts` (`hostname`);--> statement-breakpoint
ALTER TABLE `workspaces` ADD `ssh_host_id` text REFERENCES ssh_hosts(id);--> statement-breakpoint
ALTER TABLE `workspaces` ADD `remote_path` text;