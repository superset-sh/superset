ALTER TABLE "auth"."apikeys" ADD COLUMN "organization_id" uuid GENERATED ALWAYS AS (CASE
				WHEN metadata IS NULL OR metadata = '' THEN NULL
				WHEN NOT (metadata IS JSON OBJECT) THEN NULL
				WHEN (metadata::jsonb->>'organizationId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
					THEN (metadata::jsonb->>'organizationId')::uuid
				ELSE NULL
			END) STORED;--> statement-breakpoint
CREATE INDEX "apikeys_organization_id_idx" ON "auth"."apikeys" USING btree ("organization_id");