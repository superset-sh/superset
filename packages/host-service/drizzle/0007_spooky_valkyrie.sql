CREATE TABLE `automation_agent_model_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`automation_id` text NOT NULL,
	`agent` text NOT NULL,
	`provider_id` text NOT NULL,
	`gateway_token` text NOT NULL,
	`model_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `model_providers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `automation_agent_model_configs_automation_id_idx` ON `automation_agent_model_configs` (`automation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `automation_agent_model_configs_automation_agent_unique` ON `automation_agent_model_configs` (`automation_id`,`agent`);--> statement-breakpoint
CREATE UNIQUE INDEX `automation_agent_model_configs_gateway_token_unique` ON `automation_agent_model_configs` (`gateway_token`);