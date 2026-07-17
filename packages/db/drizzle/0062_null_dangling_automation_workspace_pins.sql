-- Custom SQL migration file, put your code below! --

-- Null out automation workspace pins whose workspace no longer exists, so the
-- FK added in the next migration can be applied without violations.
UPDATE "automations" a
SET "v2_workspace_id" = NULL
WHERE "v2_workspace_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "v2_workspaces" w WHERE w."id" = a."v2_workspace_id"
  );
