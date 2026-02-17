CREATE TABLE `browser_history` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`favicon_url` text,
	`last_visited_at` integer NOT NULL,
	`visit_count` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `browser_history_url_unique` ON `browser_history` (`url`);--> statement-breakpoint
CREATE INDEX `browser_history_url_idx` ON `browser_history` (`url`);--> statement-breakpoint
CREATE INDEX `browser_history_last_visited_at_idx` ON `browser_history` (`last_visited_at`);