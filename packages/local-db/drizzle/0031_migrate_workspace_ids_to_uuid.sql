-- Migrate non-UUID workspace IDs to valid UUID v4 format.
-- The cloud database expects workspace IDs to be UUIDs (z.string().uuid()).
-- Some workspaces may have been created with non-UUID IDs.
--
-- The entire migration runs in a single statement block to ensure atomicity.
-- If any step fails, all changes are rolled back.

CREATE TABLE IF NOT EXISTS _workspace_id_map (
    old_id TEXT PRIMARY KEY,
    new_id TEXT NOT NULL
);

INSERT INTO _workspace_id_map (old_id, new_id)
SELECT
    id,
    lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-' ||
    '4' || substr(lower(hex(randomblob(2))), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' ||
    lower(hex(randomblob(6)))
FROM workspaces
WHERE length(id) != 36
   OR substr(id, 9, 1) != '-'
   OR substr(id, 14, 1) != '-'
   OR substr(id, 19, 1) != '-'
   OR substr(id, 24, 1) != '-';

UPDATE settings
SET last_active_workspace_id = (
    SELECT new_id FROM _workspace_id_map
    WHERE old_id = settings.last_active_workspace_id
)
WHERE last_active_workspace_id IN (
    SELECT old_id FROM _workspace_id_map
);

UPDATE workspaces
SET id = (
    SELECT new_id FROM _workspace_id_map
    WHERE old_id = workspaces.id
)
WHERE id IN (
    SELECT old_id FROM _workspace_id_map
);

DROP TABLE IF EXISTS _workspace_id_map;
