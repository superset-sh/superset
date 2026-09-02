CREATE TABLE `screenshots` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`filename` text NOT NULL,
	`save_path` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`thumbnail` text NOT NULL,
	`captured_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `screenshots_captured_at_idx` ON `screenshots` (`captured_at`);