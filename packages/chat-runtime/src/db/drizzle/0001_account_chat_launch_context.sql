ALTER TABLE `chat_sessions_local` ADD `launch_context` text;--> statement-breakpoint
ALTER TABLE `chat_sessions_local` ADD `create_command_id` text;--> statement-breakpoint
ALTER TABLE `chat_sessions_local` ADD `predecessor_session_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `chat_sessions_local_create_command_id_idx` ON `chat_sessions_local` (`create_command_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `chat_sessions_local_predecessor_session_id_idx` ON `chat_sessions_local` (`predecessor_session_id`);