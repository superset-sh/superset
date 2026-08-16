CREATE TABLE `plugin_kv` (
	`plugin_id` text NOT NULL,
	`key` text NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_kv_plugin_key_unique` ON `plugin_kv` (`plugin_id`,`key`);--> statement-breakpoint
CREATE TABLE `plugins` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`description` text,
	`source_type` text NOT NULL,
	`source` text NOT NULL,
	`source_commit` text,
	`manifest_json` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`installed_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
