ALTER TABLE `host_agent_configs` ADD `resume_args_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `terminal_agent_bindings` ADD `ended_at` integer;--> statement-breakpoint
ALTER TABLE `terminal_agent_bindings` ADD `end_reason` text;