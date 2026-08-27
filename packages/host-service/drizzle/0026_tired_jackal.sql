ALTER TABLE `workspaces` ADD `sandbox_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `sandbox_image_digest` text;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `sandbox_port_map_json` text DEFAULT '{}' NOT NULL;