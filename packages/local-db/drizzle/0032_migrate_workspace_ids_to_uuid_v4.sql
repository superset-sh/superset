-- Migrate non-UUID workspace IDs to valid UUIDs.
-- Uses sqlite function `uuid_v4()` registered in apps/desktop local-db bootstrap.

CREATE TABLE IF NOT EXISTS _workspace_id_map (
	old_id TEXT PRIMARY KEY,
	new_id TEXT NOT NULL
);
--> statement-breakpoint

INSERT INTO _workspace_id_map (old_id, new_id)
SELECT id, uuid_v4()
FROM workspaces
WHERE uuid_is_valid_v4(id) = 0;
--> statement-breakpoint

UPDATE settings
SET last_active_workspace_id = (
	SELECT new_id FROM _workspace_id_map
	WHERE old_id = settings.last_active_workspace_id
)
WHERE last_active_workspace_id IN (
	SELECT old_id FROM _workspace_id_map
);
--> statement-breakpoint

UPDATE workspaces
SET id = (
	SELECT new_id FROM _workspace_id_map
	WHERE old_id = workspaces.id
)
WHERE id IN (
	SELECT old_id FROM _workspace_id_map
);
--> statement-breakpoint

DROP TABLE IF EXISTS _workspace_id_map;
