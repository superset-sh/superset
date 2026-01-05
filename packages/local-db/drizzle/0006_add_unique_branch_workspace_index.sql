-- Dedupe existing duplicate branch workspaces before creating unique index.
-- Keep the most recently used one (highest last_opened_at), with id ASC as tiebreaker.
-- First, update settings.last_active_workspace_id if it points to a workspace we're about to delete
UPDATE settings
SET last_active_workspace_id = (
    SELECT w1.id FROM workspaces w1
    WHERE w1.type = 'branch'
    AND w1.project_id = (
        SELECT w2.project_id FROM workspaces w2 WHERE w2.id = settings.last_active_workspace_id
    )
    ORDER BY w1.last_opened_at DESC NULLS LAST, w1.id ASC
    LIMIT 1
)
WHERE last_active_workspace_id IN (
    SELECT w1.id FROM workspaces w1
    WHERE w1.type = 'branch'
    AND EXISTS (
        SELECT 1 FROM workspaces w2
        WHERE w2.type = 'branch'
        AND w2.project_id = w1.project_id
        AND (
            w2.last_opened_at > w1.last_opened_at
            OR (w2.last_opened_at = w1.last_opened_at AND w2.id < w1.id)
            OR (w2.last_opened_at IS NOT NULL AND w1.last_opened_at IS NULL)
            OR (w1.last_opened_at IS NULL AND w2.last_opened_at IS NULL AND w2.id < w1.id)
        )
    )
);
--> statement-breakpoint
-- Delete duplicate branch workspaces, keeping the most recently used per project
-- Survivor selection: highest last_opened_at, then lowest id as tiebreaker
DELETE FROM workspaces
WHERE type = 'branch'
AND id NOT IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (
            PARTITION BY project_id
            ORDER BY last_opened_at DESC NULLS LAST, id ASC
        ) as rn
        FROM workspaces
        WHERE type = 'branch'
    ) ranked
    WHERE rn = 1
);
--> statement-breakpoint
-- Now safe to create the unique index
CREATE UNIQUE INDEX IF NOT EXISTS `workspaces_unique_branch_per_project` ON `workspaces` (`project_id`) WHERE `type` = 'branch';
