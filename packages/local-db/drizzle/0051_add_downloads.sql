CREATE TABLE `downloads` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`filename` text NOT NULL,
	`save_path` text NOT NULL,
	`mime_type` text,
	`total_bytes` integer,
	`received_bytes` integer DEFAULT 0 NOT NULL,
	`state` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE INDEX `downloads_started_at_idx` ON `downloads` (`started_at`);