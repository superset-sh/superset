-- Drop the column if it exists (to make migration idempotent for prod fix)
-- This handles cases where the column was partially added in previous migration attempts
ALTER TABLE `settings` DROP COLUMN `terminal_persistence`;
--> statement-breakpoint
-- Add the column
ALTER TABLE `settings` ADD `terminal_persistence` integer;