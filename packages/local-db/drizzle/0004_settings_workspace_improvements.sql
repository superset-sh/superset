ALTER TABLE `settings` ADD `terminal_link_behavior` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `navigation_style` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `terminal_persistence` integer;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `is_unread` integer DEFAULT false;