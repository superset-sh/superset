CREATE TABLE "auth"."device_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_code" text NOT NULL,
	"user_code" text NOT NULL,
	"user_id" text,
	"expires_at" timestamp NOT NULL,
	"status" text NOT NULL,
	"last_polled_at" timestamp,
	"polling_interval" integer,
	"client_id" text,
	"scope" text
);
--> statement-breakpoint
ALTER TABLE "auth"."apikeys" DROP CONSTRAINT "apikeys_user_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "auth"."apikeys_user_id_idx";
--> statement-breakpoint
ALTER TABLE "auth"."apikeys" RENAME COLUMN "user_id" TO "reference_id";
--> statement-breakpoint
ALTER TABLE "auth"."apikeys" ALTER COLUMN "reference_id" SET DATA TYPE text;
--> statement-breakpoint
ALTER TABLE "auth"."apikeys" ADD COLUMN "config_id" text NOT NULL DEFAULT 'default';
--> statement-breakpoint
CREATE INDEX "apikeys_configId_idx" ON "auth"."apikeys" USING btree ("config_id");
--> statement-breakpoint
CREATE INDEX "apikeys_referenceId_idx" ON "auth"."apikeys" USING btree ("reference_id");
