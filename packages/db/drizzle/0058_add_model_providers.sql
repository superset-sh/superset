CREATE TABLE "model_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"name" text NOT NULL,
	"protocol" text NOT NULL,
	"base_url" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"secret_encrypted" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "model_providers_org_name_unique" UNIQUE("organization_id","name")
);
--> statement-breakpoint
CREATE TABLE "model_provider_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"model_id" text NOT NULL,
	"display_name" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"capabilities" jsonb DEFAULT '{}'::jsonb,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "model_provider_models_provider_model_unique" UNIQUE("provider_id","model_id")
);
--> statement-breakpoint
ALTER TABLE "model_providers" ADD CONSTRAINT "model_providers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "model_providers" ADD CONSTRAINT "model_providers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "model_provider_models" ADD CONSTRAINT "model_provider_models_provider_id_model_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."model_providers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "model_providers_organization_id_idx" ON "model_providers" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "model_providers_enabled_idx" ON "model_providers" USING btree ("enabled");
--> statement-breakpoint
CREATE INDEX "model_providers_protocol_idx" ON "model_providers" USING btree ("protocol");
--> statement-breakpoint
CREATE INDEX "model_provider_models_provider_id_idx" ON "model_provider_models" USING btree ("provider_id");
