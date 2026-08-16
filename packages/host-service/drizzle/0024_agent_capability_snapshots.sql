CREATE TABLE `host_agent_capability_snapshots` (
	`agent_id` text PRIMARY KEY NOT NULL,
	`preset_id` text NOT NULL,
	`config_revision` integer NOT NULL,
	`schema_version` integer NOT NULL,
	`inventory_json` text,
	`status` text NOT NULL,
	`installed` integer,
	`auth` text NOT NULL,
	`error_kind` text,
	`message` text,
	`resolver_source` text,
	`inventory_checked_at` integer,
	`status_checked_at` integer NOT NULL,
	`written_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `host_agent_configs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `host_agent_capability_snapshots_written_at_idx` ON `host_agent_capability_snapshots` (`written_at`);--> statement-breakpoint
ALTER TABLE `host_agent_configs` ADD `capability_revision` integer DEFAULT 1 NOT NULL;