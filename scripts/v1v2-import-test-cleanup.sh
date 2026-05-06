#!/usr/bin/env bash
# Undoes everything v1v2-import-test-setup.sh did. Idempotent.

set -euo pipefail

SATYA_TEST_ORG=b2c3d4e5-f6a7-4890-9bcd-ef1234567891
SUPERSET_ORG=a1b2c3d4-e5f6-7890-abcd-ef1234567890
DEV_DATA_LOCAL_DB="$(pwd)/superset-dev-data/local.db"
SATYA_TEST_HOST_DB="$(pwd)/superset-dev-data/host/$SATYA_TEST_ORG/host.db"
SUPERSET_HOST_DB="$(pwd)/superset-dev-data/host/$SUPERSET_ORG/host.db"

NEW_NO_REMOTE_ID=22222222-bbbb-4bbb-8bbb-000000000001
NEW_GHOST_ID=22222222-bbbb-4bbb-8bbb-000000000002

echo "→ removing on-disk fixture repos"
if [ -d "$HOME/code/onbook-relocate-clone/.git" ]; then
  for branch in v1v2-test-clean v1v2-test-stale-fallback v1v2-test-ghost; do
    git -C "$HOME/code/onbook-relocate-clone" worktree remove -f \
      ".worktrees/$branch" 2>/dev/null || true
    git -C "$HOME/code/onbook-relocate-clone" branch -D "$branch" 2>/dev/null || true
  done
fi
rm -rf "$HOME/code/onbook-relocate-clone" \
       "$HOME/code/v1v2-no-remote" \
       "$HOME/code/v1v2-ghost"

echo "→ removing fakeupstream remote from onlook"
git -C "$HOME/code/onlook" remote remove fakeupstream 2>/dev/null || true

echo "→ restoring v1 onbook mainRepoPath + clearing fixtures we added"
sqlite3 "$DEV_DATA_LOCAL_DB" <<SQL
UPDATE projects SET tab_order = NULL WHERE name IN ('cal.com','onlook','mastra','chatbot');
UPDATE projects SET tab_order = NULL, main_repo_path = '$HOME/code/onbook' WHERE name = 'onbook';
DELETE FROM projects WHERE id IN ('$NEW_NO_REMOTE_ID','$NEW_GHOST_ID');
DELETE FROM workspaces WHERE id LIKE '55555555-dddd-4ddd-8ddd-%';
DELETE FROM worktrees WHERE id LIKE '44444444-cccc-4ccc-8ccc-%';
SQL

echo "→ removing fixture host.db rows from both orgs"
sqlite3 "$SATYA_TEST_HOST_DB" \
  "DELETE FROM projects WHERE id LIKE '11111111-aaaa-4aaa-8aaa-%'"
sqlite3 "$SUPERSET_HOST_DB" \
  "DELETE FROM projects WHERE id LIKE '33333333-aaaa-4aaa-8aaa-%'"

echo "→ deleting fixture v2 projects from dev cloud"
PGURL=$(grep '^DATABASE_URL=' .env | sed 's/^DATABASE_URL=//;s/^"//;s/"$//')
psql "$PGURL" -c "DELETE FROM public.v2_projects WHERE id::text LIKE '11111111-aaaa-4aaa-8aaa-%' OR id::text LIKE '33333333-aaaa-4aaa-8aaa-%'" >/dev/null

echo "✓ cleanup done"
