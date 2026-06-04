CREATE TABLE `host_agent_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`preset_id` text NOT NULL,
	`label` text NOT NULL,
	`command` text NOT NULL,
	`args_json` text DEFAULT '[]' NOT NULL,
	`prompt_transport` text NOT NULL,
	`prompt_args_json` text DEFAULT '[]' NOT NULL,
	`env_json` text DEFAULT '{}' NOT NULL,
	`display_order` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `host_agent_configs_display_order_idx` ON `host_agent_configs` (`display_order`);