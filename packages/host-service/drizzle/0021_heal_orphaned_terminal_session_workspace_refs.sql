-- Heal legacy orphaned terminal_sessions.origin_workspace_id references.
-- Long-lived host DBs accumulated rows pointing at workspaces deleted while
-- FK enforcement was not in effect on the deleting connection. The FK is
-- ON DELETE SET NULL, so apply the action enforcement would have taken.
-- Without this, the post-migration foreign_key_check in createDb fails and
-- the host service crash-loops on startup (canary 2026-08-10 incident).
UPDATE `terminal_sessions` SET `origin_workspace_id` = NULL
WHERE `origin_workspace_id` IS NOT NULL
  AND `origin_workspace_id` NOT IN (SELECT `id` FROM `workspaces`);
