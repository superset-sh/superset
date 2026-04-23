CREATE TABLE `v1_migration_state` (
	`v1_id` text NOT NULL,
	`kind` text NOT NULL,
	`v2_id` text,
	`organization_id` text NOT NULL,
	`status` text NOT NULL,
	`reason` text,
	`migrated_at` integer NOT NULL,
	PRIMARY KEY(`organization_id`, `v1_id`, `kind`)
);
--> statement-breakpoint
CREATE INDEX `v1_migration_state_v2_id_idx` ON `v1_migration_state` (`v2_id`);