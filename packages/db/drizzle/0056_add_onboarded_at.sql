ALTER TABLE "auth"."users" ADD COLUMN "onboarded_at" timestamp;--> statement-breakpoint
UPDATE "auth"."users" SET "onboarded_at" = "created_at" WHERE "onboarded_at" IS NULL;
