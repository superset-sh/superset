DROP INDEX `terminal_sessions_recovery_until_idx`;--> statement-breakpoint
ALTER TABLE `terminal_sessions` DROP COLUMN `recovery_id`;--> statement-breakpoint
ALTER TABLE `terminal_sessions` DROP COLUMN `recovery_until`;