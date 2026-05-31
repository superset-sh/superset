CREATE TABLE `model_provider_models` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`model_id` text NOT NULL,
	`display_name` text,
	`enabled` integer DEFAULT true NOT NULL,
	`capabilities_json` text DEFAULT '{}' NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `model_providers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `model_provider_models_provider_id_idx` ON `model_provider_models` (`provider_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `model_provider_models_provider_model_unique` ON `model_provider_models` (`provider_id`,`model_id`);--> statement-breakpoint
CREATE TABLE `model_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`protocol` text NOT NULL,
	`base_url` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`secret_encrypted` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `model_providers_enabled_idx` ON `model_providers` (`enabled`);--> statement-breakpoint
CREATE INDEX `model_providers_protocol_idx` ON `model_providers` (`protocol`);--> statement-breakpoint
CREATE TABLE `workspace_agent_model_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`agent` text NOT NULL,
	`provider_id` text NOT NULL,
	`gateway_token` text NOT NULL,
	`haiku_model_id` text NOT NULL,
	`sonnet_model_id` text NOT NULL,
	`opus_model_id` text NOT NULL,
	`disable_one_million_context` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`provider_id`) REFERENCES `model_providers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workspace_agent_model_configs_workspace_id_idx` ON `workspace_agent_model_configs` (`workspace_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_agent_model_configs_workspace_agent_unique` ON `workspace_agent_model_configs` (`workspace_id`,`agent`);--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_agent_model_configs_gateway_token_unique` ON `workspace_agent_model_configs` (`gateway_token`);