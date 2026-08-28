CREATE TABLE "deal_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"external_redemption_id" text NOT NULL,
	"deal_id" integer NOT NULL,
	"email" text,
	"name" text,
	"company_name" text,
	"company_batch" text,
	"status" text NOT NULL,
	"organization_id" uuid,
	"stripe_subscription_id" text,
	"promotion_code" text,
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deal_redemptions" ADD CONSTRAINT "deal_redemptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deal_redemptions_source_external_id_unique" ON "deal_redemptions" USING btree ("source","external_redemption_id");--> statement-breakpoint
CREATE INDEX "deal_redemptions_email_idx" ON "deal_redemptions" USING btree ("email");