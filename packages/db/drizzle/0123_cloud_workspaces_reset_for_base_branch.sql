-- Custom SQL migration file, put your code below! --

-- `branch` changes meaning in the next migration: it becomes the branch a
-- sandbox works on, and `base_branch` (NOT NULL) records what it was cut
-- from. Every row so far predates that split, and cloud workspaces are
-- internal-only, so they are dropped rather than backfilled. Their
-- repositories go with them by cascade; the sandboxes and Neon branches
-- behind them are reclaimed by hand before this lands.
DELETE FROM "cloud_workspaces";
