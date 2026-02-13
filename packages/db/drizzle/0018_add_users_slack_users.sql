CREATE TABLE "users__slack_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slack_user_id" text NOT NULL,
	"team_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"model_preference" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users__slack_users_unique" UNIQUE("slack_user_id","team_id")
);
--> statement-breakpoint
ALTER TABLE "users__slack_users" ADD CONSTRAINT "users__slack_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users__slack_users" ADD CONSTRAINT "users__slack_users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users__slack_users_user_idx" ON "users__slack_users" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users__slack_users_org_idx" ON "users__slack_users" USING btree ("organization_id");