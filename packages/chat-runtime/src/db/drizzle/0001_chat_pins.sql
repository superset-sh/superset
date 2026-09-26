CREATE TABLE `chat_pins` (
	`session_id` text NOT NULL,
	`item_id` text NOT NULL,
	`label` text NOT NULL,
	`snapshot_text` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`session_id`, `item_id`)
);
--> statement-breakpoint
CREATE INDEX `chat_pins_session_id_idx` ON `chat_pins` (`session_id`);