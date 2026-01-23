-- Cloud Workspaces table - synced from cloud via Electric SQL
CREATE TABLE `cloud_workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`repository_id` text NOT NULL,
	`creator_id` text NOT NULL,
	`name` text NOT NULL,
	`branch` text NOT NULL,
	`provider_type` text NOT NULL,
	`provider_vm_id` text,
	`status` text NOT NULL,
	`status_message` text,
	`auto_stop_minutes` integer NOT NULL,
	`last_active_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cloud_workspaces_organization_id_idx` ON `cloud_workspaces` (`organization_id`);
--> statement-breakpoint
CREATE INDEX `cloud_workspaces_repository_id_idx` ON `cloud_workspaces` (`repository_id`);
--> statement-breakpoint
CREATE INDEX `cloud_workspaces_creator_id_idx` ON `cloud_workspaces` (`creator_id`);
--> statement-breakpoint
CREATE INDEX `cloud_workspaces_status_idx` ON `cloud_workspaces` (`status`);
--> statement-breakpoint
-- Cloud Workspace Sessions table - synced from cloud via Electric SQL
CREATE TABLE `cloud_workspace_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`client_type` text NOT NULL,
	`connected_at` text NOT NULL,
	`last_heartbeat_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `cloud_workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cloud_workspace_sessions_workspace_id_idx` ON `cloud_workspace_sessions` (`workspace_id`);
--> statement-breakpoint
CREATE INDEX `cloud_workspace_sessions_user_id_idx` ON `cloud_workspace_sessions` (`user_id`);
