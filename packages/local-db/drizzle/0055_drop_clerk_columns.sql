DROP INDEX `organizations_clerk_org_id_unique`;--> statement-breakpoint
DROP INDEX `organizations_clerk_org_id_idx`;--> statement-breakpoint
ALTER TABLE `organizations` DROP COLUMN `clerk_org_id`;--> statement-breakpoint
DROP INDEX `users_clerk_id_unique`;--> statement-breakpoint
DROP INDEX `users_clerk_id_idx`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `clerk_id`;