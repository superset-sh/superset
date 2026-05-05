ALTER TABLE "auth"."oauth_clients" ADD COLUMN "require_pkce" boolean;--> statement-breakpoint
ALTER TABLE "auth"."oauth_clients" ADD COLUMN "subject_type" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "billing_interval" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "stripe_schedule_id" text;