CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrer_organization_id" uuid NOT NULL,
	"referee_user_id" uuid NOT NULL,
	"attributed_at" timestamp DEFAULT now() NOT NULL,
	"rewarded_at" timestamp,
	"rewarded_stripe_customer_id" text,
	"rejection_reason" text,
	CONSTRAINT "referrals_referee_user_id_unique" UNIQUE("referee_user_id")
);
--> statement-breakpoint
ALTER TABLE "auth"."organizations" ADD COLUMN "referral_code" text;--> statement-breakpoint
UPDATE "auth"."organizations"
SET "referral_code" = substr(md5(random()::text || id::text), 1, 10)
WHERE "referral_code" IS NULL;--> statement-breakpoint
ALTER TABLE "auth"."organizations" ALTER COLUMN "referral_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_organization_id_organizations_id_fk" FOREIGN KEY ("referrer_organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referee_user_id_users_id_fk" FOREIGN KEY ("referee_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "referrals_referrer_organization_id_idx" ON "referrals" USING btree ("referrer_organization_id");--> statement-breakpoint
ALTER TABLE "auth"."organizations" ADD CONSTRAINT "organizations_referral_code_unique" UNIQUE("referral_code");