-- Resolve existing duplicate (provider, external_org_id) groups before adding the
-- partial unique index. Within each group keep the most recently updated active
-- row, soft-disconnect the rest.
WITH ranked AS (
	SELECT id,
		ROW_NUMBER() OVER (
			PARTITION BY provider, external_org_id
			ORDER BY updated_at DESC, id DESC
		) AS rn
	FROM integration_connections
	WHERE disconnected_at IS NULL
	  AND external_org_id IS NOT NULL
)
UPDATE integration_connections
SET disconnected_at = now(),
    disconnect_reason = 'duplicate_resolved'
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
--> statement-breakpoint
CREATE UNIQUE INDEX "integration_connections_provider_external_org_active_unique" ON "integration_connections" USING btree ("provider","external_org_id") WHERE "integration_connections"."disconnected_at" IS NULL;
