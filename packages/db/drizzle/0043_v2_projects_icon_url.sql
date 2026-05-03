ALTER TABLE "v2_projects" ADD COLUMN "icon_url" text;
--> statement-breakpoint
-- Backfill icon_url for existing rows by deriving the GitHub owner avatar
-- URL from repo_clone_url. Handles the three remote shapes parseGitHubRemote
-- accepts (https, git@, ssh://). Idempotent: only touches rows where
-- icon_url IS NULL, so re-running this migration is a no-op once rows have
-- a custom icon set via uploadIcon / removeIcon / resetIconToGitHub.
UPDATE "v2_projects"
SET "icon_url" = 'https://github.com/' || COALESCE(
  (regexp_match("repo_clone_url", '^https?://github\.com/([^/]+)/'))[1],
  (regexp_match("repo_clone_url", '^git@github\.com:([^/]+)/'))[1],
  (regexp_match("repo_clone_url", '^ssh://git@github\.com/([^/]+)/'))[1]
) || '.png?size=200'
WHERE "icon_url" IS NULL
  AND "repo_clone_url" IS NOT NULL
  AND (
    "repo_clone_url" ~ '^https?://github\.com/[^/]+/'
    OR "repo_clone_url" ~ '^git@github\.com:[^/]+/'
    OR "repo_clone_url" ~ '^ssh://git@github\.com/[^/]+/'
  );
