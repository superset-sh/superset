CREATE INDEX `closed_panes_expires_at_idx` ON `closed_panes` (`expires_at`);--> statement-breakpoint
CREATE INDEX `terminal_sessions_recovery_until_idx` ON `terminal_sessions` (`recovery_until`);