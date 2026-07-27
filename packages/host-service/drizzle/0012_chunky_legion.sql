CREATE TABLE `session_meta` (
	`session_id` text PRIMARY KEY NOT NULL,
	`title_overridden` integer DEFAULT false NOT NULL,
	`title` text,
	`archived_at` integer,
	`closed_at` integer,
	`updated_at` integer NOT NULL
);
