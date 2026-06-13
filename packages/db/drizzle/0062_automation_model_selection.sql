ALTER TABLE "automations" ADD COLUMN "model_provider_id" uuid;--> statement-breakpoint
ALTER TABLE "automations" ADD COLUMN "model_id" text;--> statement-breakpoint
ALTER TABLE "automations" ADD COLUMN "model_config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_model_provider_id_model_providers_id_fk" FOREIGN KEY ("model_provider_id") REFERENCES "public"."model_providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automations_model_provider_idx" ON "automations" USING btree ("model_provider_id");