#!/usr/bin/env bash
# Set up the manual test fixtures for the v1→v2 importer.
#
# Idempotent — safe to re-run. Pair with v1v2-import-test-cleanup.sh.
#
# Targets:
#   - Dev neon branch via .env DATABASE_URL (must be a non-prod branch)
#   - superset-dev-data/local.db          (v1 fixtures)
#   - superset-dev-data/host/<orgId>/host.db  (host.db fixtures)
#   - ~/code/<repo>                       (on-disk fixture repos)
#
# v1 local DB project rows that already exist (superset, cal.com, onbook,
# onlook, mastra, chatbot) are NOT recreated — we just bump their tab_order
# so they show up in the importer. New synthetic rows (v1v2-no-remote,
# v1v2-ghost) are inserted with id prefix 22222222-bbbb-...

set -euo pipefail

SATYA_TEST_ORG=b2c3d4e5-f6a7-4890-9bcd-ef1234567891
SUPERSET_ORG=a1b2c3d4-e5f6-7890-abcd-ef1234567890

DEV_DATA="$(pwd)/superset-dev-data"
DEV_DATA_LOCAL_DB="$DEV_DATA/local.db"
SATYA_TEST_HOST_DB="$DEV_DATA/host/$SATYA_TEST_ORG/host.db"
SUPERSET_HOST_DB="$DEV_DATA/host/$SUPERSET_ORG/host.db"

NEW_NO_REMOTE_ID=22222222-bbbb-4bbb-8bbb-000000000001
NEW_GHOST_ID=22222222-bbbb-4bbb-8bbb-000000000002

ONBOOK_V1_ID=098e54ad-7160-497f-aae3-57c68c8b6a8e
ONBOOK_FIXTURE_V2_ID=33333333-aaaa-4aaa-8aaa-000000000004

# ---- 0. sanity checks --------------------------------------------------------

if [ ! -f "$DEV_DATA_LOCAL_DB" ]; then
  echo "✗ $DEV_DATA_LOCAL_DB missing — run the dev build at least once first."
  exit 1
fi

PGURL=$(grep '^DATABASE_URL=' .env | sed 's/^DATABASE_URL=//;s/^"//;s/"$//')
BRANCH_NAME=$(grep '^NEON_BRANCH_ID=' .env | sed 's/^NEON_BRANCH_ID=//;s/^"//;s/"$//')
if [ -z "$BRANCH_NAME" ] || [ "$BRANCH_NAME" = "br-billowing-dream-af839yib" ]; then
  echo "✗ refusing to seed — .env DATABASE_URL points at the prod neon branch."
  echo "  Spin up a dev branch and update .env first."
  exit 1
fi

echo "→ targeting neon branch $BRANCH_NAME"

# ---- 1. on-disk fixture repos -----------------------------------------------

echo "→ adding fakeupstream remote to ~/code/onlook"
git -C "$HOME/code/onlook" remote remove fakeupstream 2>/dev/null || true
git -C "$HOME/code/onlook" remote add fakeupstream \
  https://github.com/satya-fake-org/onlook.git

echo "→ cloning onbook → ~/code/onbook-relocate-clone"
rm -rf "$HOME/code/onbook-relocate-clone"
git clone --quiet --depth 1 "$HOME/code/onbook" "$HOME/code/onbook-relocate-clone"
git -C "$HOME/code/onbook-relocate-clone" remote set-url origin \
  https://github.com/onlook-dev/onbook.git

echo "→ creating ~/code/v1v2-no-remote (local-only fixture)"
rm -rf "$HOME/code/v1v2-no-remote"
mkdir -p "$HOME/code/v1v2-no-remote"
(
  cd "$HOME/code/v1v2-no-remote"
  git init -q -b main
  echo "# v1v2-no-remote — local-only fixture" > README.md
  git -c user.email=test@superset.sh -c user.name=Test add README.md
  git -c user.email=test@superset.sh -c user.name=Test commit -q -m init
)

echo "→ creating ~/code/v1v2-ghost (single-remote fixture)"
rm -rf "$HOME/code/v1v2-ghost"
mkdir -p "$HOME/code/v1v2-ghost"
(
  cd "$HOME/code/v1v2-ghost"
  git init -q -b main
  git remote add origin https://github.com/satya-fake-org/v1v2-ghost.git
  echo "# v1v2-ghost fixture" > README.md
  git -c user.email=test@superset.sh -c user.name=Test add README.md
  git -c user.email=test@superset.sh -c user.name=Test commit -q -m init
)

echo "→ adding worktrees to ~/code/onbook-relocate-clone"
for branch in v1v2-test-clean v1v2-test-stale-fallback v1v2-test-ghost; do
  git -C "$HOME/code/onbook-relocate-clone" worktree remove -f \
    ".worktrees/$branch" 2>/dev/null || true
  git -C "$HOME/code/onbook-relocate-clone" branch -D "$branch" 2>/dev/null || true
  git -C "$HOME/code/onbook-relocate-clone" worktree add -q \
    ".worktrees/$branch" -b "$branch"
done

# ---- 2. cloud v2 fixtures (Satya Test Org) ----------------------------------

echo "→ seeding v2 projects in Satya Test Org"
psql "$PGURL" >/dev/null <<SQL
INSERT INTO public.v2_projects (id, organization_id, name, slug, repo_clone_url) VALUES
  ('11111111-aaaa-4aaa-8aaa-000000000001', '$SATYA_TEST_ORG', 'cal.com (calcom)',      'cal-com-calcom',     'https://github.com/calcom/cal.com'),
  ('11111111-aaaa-4aaa-8aaa-000000000002', '$SATYA_TEST_ORG', 'cal.com (onlook fork)', 'cal-com-onlook-dev', 'https://github.com/onlook-dev/cal.com'),
  ('11111111-aaaa-4aaa-8aaa-000000000003', '$SATYA_TEST_ORG', 'onlook',                'onlook-v1v2-test',   'https://github.com/onlook-dev/onlook'),
  ('11111111-aaaa-4aaa-8aaa-000000000004', '$SATYA_TEST_ORG', 'onbook',                'onbook-v1v2-test',   'https://github.com/onlook-dev/onbook')
ON CONFLICT (id) DO NOTHING;
SQL

# ---- 3. cloud v2 fixtures (Superset Org — where active session usually is) --

echo "→ seeding v2 projects in Superset Org"
psql "$PGURL" >/dev/null <<SQL
INSERT INTO public.v2_projects (id, organization_id, name, slug, repo_clone_url) VALUES
  ('33333333-aaaa-4aaa-8aaa-000000000001', '$SUPERSET_ORG', 'cal.com (calcom)',      'v1v2-test-cal-com-calcom',     'https://github.com/calcom/cal.com'),
  ('33333333-aaaa-4aaa-8aaa-000000000002', '$SUPERSET_ORG', 'cal.com (onlook fork)', 'v1v2-test-cal-com-onlook-dev', 'https://github.com/onlook-dev/cal.com'),
  ('33333333-aaaa-4aaa-8aaa-000000000003', '$SUPERSET_ORG', 'onlook (test fixture)', 'v1v2-test-onlook',             'https://github.com/onlook-dev/onlook'),
  ('$ONBOOK_FIXTURE_V2_ID',                '$SUPERSET_ORG', 'onbook (test fixture)', 'v1v2-test-onbook',             'https://github.com/onlook-dev/onbook')
ON CONFLICT (id) DO NOTHING;
SQL

# ---- 4. v1 local.db fixtures ------------------------------------------------

echo "→ updating v1 local.db"
sqlite3 "$DEV_DATA_LOCAL_DB" <<SQL
-- Surface existing v1 projects in the importer (tab_order IS NOT NULL gate)
UPDATE projects SET tab_order = 1 WHERE name = 'cal.com';
UPDATE projects SET tab_order = 2 WHERE name = 'onlook';
UPDATE projects SET tab_order = 3, main_repo_path = '$HOME/code/onbook-relocate-clone' WHERE name = 'onbook';
UPDATE projects SET tab_order = 4 WHERE name = 'mastra';
UPDATE projects SET tab_order = 5 WHERE name = 'chatbot';

-- Synthetic v1 projects: one local-only, one with a parseable but unreachable remote
INSERT INTO projects (id, main_repo_path, name, color, tab_order, last_opened_at, created_at, default_branch, github_owner)
VALUES
  ('$NEW_NO_REMOTE_ID', '$HOME/code/v1v2-no-remote', 'v1v2-no-remote', 'default', 6, strftime('%s','now')*1000, strftime('%s','now')*1000, 'main', NULL),
  ('$NEW_GHOST_ID',     '$HOME/code/v1v2-ghost',     'v1v2-ghost',     'default', 7, strftime('%s','now')*1000, strftime('%s','now')*1000, 'main', NULL)
ON CONFLICT (id) DO UPDATE SET
  main_repo_path = excluded.main_repo_path,
  tab_order = excluded.tab_order;

-- Worktrees under onbook for the workspace-tab tests
INSERT INTO worktrees (id, project_id, path, branch, base_branch, created_at, created_by_superset)
VALUES
  ('44444444-cccc-4ccc-8ccc-000000000001', '$ONBOOK_V1_ID', '$HOME/code/onbook-relocate-clone/.worktrees/v1v2-test-clean',           'v1v2-test-clean',           'main', strftime('%s','now')*1000, 1),
  ('44444444-cccc-4ccc-8ccc-000000000002', '$ONBOOK_V1_ID', '/tmp/v1v2-stale-path-nowhere',                                          'v1v2-test-stale-fallback', 'main', strftime('%s','now')*1000, 1),
  ('44444444-cccc-4ccc-8ccc-000000000003', '$ONBOOK_V1_ID', '$HOME/code/onbook-relocate-clone/.worktrees/v1v2-test-orphan-branch',   'v1v2-test-orphan-branch',  'main', strftime('%s','now')*1000, 1),
  ('44444444-cccc-4ccc-8ccc-000000000004', '$ONBOOK_V1_ID', '$HOME/code/onbook-relocate-clone/.worktrees/v1v2-test-ghost',           'v1v2-test-ghost',          'main', strftime('%s','now')*1000, 1)
ON CONFLICT (id) DO UPDATE SET path = excluded.path, branch = excluded.branch;

-- Workspaces using those worktrees
INSERT INTO workspaces (id, project_id, worktree_id, type, branch, name, tab_order, created_at, updated_at, last_opened_at)
VALUES
  ('55555555-dddd-4ddd-8ddd-000000000001', '$ONBOOK_V1_ID', '44444444-cccc-4ccc-8ccc-000000000001', 'worktree', 'v1v2-test-clean',           'clean adopt fixture',           100, strftime('%s','now')*1000, strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('55555555-dddd-4ddd-8ddd-000000000002', '$ONBOOK_V1_ID', '44444444-cccc-4ccc-8ccc-000000000002', 'worktree', 'v1v2-test-stale-fallback', 'stale path -> branch fallback', 101, strftime('%s','now')*1000, strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('55555555-dddd-4ddd-8ddd-000000000003', '$ONBOOK_V1_ID', '44444444-cccc-4ccc-8ccc-000000000003', 'worktree', 'v1v2-test-orphan-branch',  'orphan (should be hidden)',     102, strftime('%s','now')*1000, strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('55555555-dddd-4ddd-8ddd-000000000004', '$ONBOOK_V1_ID', '44444444-cccc-4ccc-8ccc-000000000004', 'worktree', 'v1v2-test-ghost',          'v1v2-test-ghost',               103, strftime('%s','now')*1000, strftime('%s','now')*1000, strftime('%s','now')*1000)
ON CONFLICT (id) DO UPDATE SET
  worktree_id = excluded.worktree_id,
  branch = excluded.branch,
  name = excluded.name;
SQL

# ---- 5. host.db row for relocate scenario -----------------------------------

echo "→ inserting host.db relocate row (Superset org)"
sqlite3 "$SUPERSET_HOST_DB" <<SQL
INSERT INTO projects (id, repo_path, created_at, repo_provider, repo_owner, repo_name, repo_url, remote_name)
VALUES (
  '$ONBOOK_FIXTURE_V2_ID',
  '$HOME/code/onbook',
  strftime('%s','now') * 1000,
  'github', 'onlook-dev', 'onbook',
  'https://github.com/onlook-dev/onbook',
  'origin'
)
ON CONFLICT (id) DO UPDATE SET repo_path = excluded.repo_path;
SQL

echo "✓ setup done"
echo ""
echo "v1 projects you'll see in the importer:"
sqlite3 -separator $'\t' "$DEV_DATA_LOCAL_DB" \
  "SELECT tab_order, name, main_repo_path FROM projects WHERE tab_order IS NOT NULL ORDER BY tab_order"
