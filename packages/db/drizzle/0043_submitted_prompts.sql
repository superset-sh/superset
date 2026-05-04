CREATE TABLE "submitted_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid,
	"prompt_text" text NOT NULL,
	"submitter_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "submitted_prompts" ADD CONSTRAINT "submitted_prompts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submitted_prompts" ADD CONSTRAINT "submitted_prompts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "submitted_prompts_user_id_idx" ON "submitted_prompts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "submitted_prompts_organization_id_idx" ON "submitted_prompts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "submitted_prompts_created_at_idx" ON "submitted_prompts" USING btree ("created_at");