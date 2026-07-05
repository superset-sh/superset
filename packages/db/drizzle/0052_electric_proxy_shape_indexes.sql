CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX "apikeys_metadata_trgm_idx" ON "auth"."apikeys" USING gin ("metadata" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "users_organization_ids_idx" ON "auth"."users" USING gin ("organization_ids");
