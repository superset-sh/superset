CREATE TABLE `workspace_purge_tombstones` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`purged_at` integer NOT NULL
);
