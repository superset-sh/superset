#!/usr/bin/env bash
#
# superset-create-workspace — Create a Superset workspace from the command line
#
# This is a temporary workaround that directly manipulates the SQLite database
# and creates git worktrees. It bypasses the app's initialization logic (setup
# scripts, config copying, etc.) but the workspace will appear in the sidebar.
#
# Usage:
#   superset-create-workspace --project <name|id> [--branch <name>] [--name <workspace-name>] [--base <base-branch>] [--existing]
#
# Examples:
#   # Create workspace with auto-generated branch name
#   superset-create-workspace --project camel
#
#   # Create workspace with specific branch
#   superset-create-workspace --project camel --branch feature/my-feature --name "My Feature"
#
#   # Open workspace for existing branch (no new worktree)
#   superset-create-workspace --project camel --branch feature/existing --existing
#
# Requirements: sqlite3, git, uuidgen

set -euo pipefail

DB="$HOME/.superset/local.db"

die() { echo "error: $*" >&2; exit 1; }

# Defaults
PROJECT=""
BRANCH=""
WS_NAME=""
BASE_BRANCH=""
USE_EXISTING=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project|-p) PROJECT="$2"; shift 2 ;;
    --branch|-b)  BRANCH="$2"; shift 2 ;;
    --name|-n)    WS_NAME="$2"; shift 2 ;;
    --base)       BASE_BRANCH="$2"; shift 2 ;;
    --existing|-e) USE_EXISTING=true; shift ;;
    --help|-h)
      sed -n '2,/^$/s/^# //p' "$0"
      exit 0
      ;;
    *) die "Unknown option: $1" ;;
  esac
done

[[ -z "$PROJECT" ]] && die "Required: --project <name|id>"
[[ -f "$DB" ]] || die "Superset database not found at $DB"
command -v sqlite3 >/dev/null || die "sqlite3 is required"
command -v uuidgen >/dev/null || die "uuidgen is required"

# Resolve project
PROJECT_ROW=$(sqlite3 "$DB" "SELECT id, name, main_repo_path, default_branch, worktree_base_dir, workspace_base_branch FROM projects WHERE id = '$PROJECT' OR name = '$PROJECT' LIMIT 1;" 2>/dev/null)
[[ -z "$PROJECT_ROW" ]] && die "Project not found: $PROJECT"

IFS='|' read -r PROJECT_ID PROJECT_NAME MAIN_REPO BASE_DEFAULT_BRANCH WORKTREE_BASE_DIR WORKSPACE_BASE_BRANCH <<< "$PROJECT_ROW"

[[ -d "$MAIN_REPO" ]] || die "Main repo not found: $MAIN_REPO"

# Resolve base branch
if [[ -z "$BASE_BRANCH" ]]; then
  BASE_BRANCH="${WORKSPACE_BASE_BRANCH:-${BASE_DEFAULT_BRANCH:-main}}"
fi

# Resolve worktree base directory
if [[ -n "$WORKTREE_BASE_DIR" ]]; then
  WORKTREE_BASE="$WORKTREE_BASE_DIR/$PROJECT_NAME"
else
  # Check global setting
  GLOBAL_BASE=$(sqlite3 "$DB" "SELECT worktree_base_dir FROM settings LIMIT 1;" 2>/dev/null || true)
  if [[ -n "$GLOBAL_BASE" ]]; then
    WORKTREE_BASE="$GLOBAL_BASE/$PROJECT_NAME"
  else
    WORKTREE_BASE="$HOME/.superset/worktrees/$PROJECT_NAME"
  fi
fi

# Generate branch name if not provided
if [[ -z "$BRANCH" ]]; then
  # Simple two-word branch name (adjective-noun)
  ADJECTIVES=(quick bright calm cool fast bold keen mild warm soft)
  NOUNS=(robin maple cedar brook spark flame ridge stone creek pine)
  while true; do
    ADJ="${ADJECTIVES[$((RANDOM % ${#ADJECTIVES[@]}))]}"
    NOUN="${NOUNS[$((RANDOM % ${#NOUNS[@]}))]}"
    BRANCH="${ADJ}-${NOUN}"
    # Check it doesn't already exist
    EXISTS=$(git -C "$MAIN_REPO" branch --list "$BRANCH" 2>/dev/null | wc -l)
    [[ $EXISTS -eq 0 ]] && break
  done
  echo "Generated branch: $BRANCH"
fi

WS_NAME="${WS_NAME:-$BRANCH}"
WORKTREE_PATH="$WORKTREE_BASE/$BRANCH"

# Check if workspace already exists for this branch
EXISTING_WS=$(sqlite3 "$DB" "SELECT w.id FROM workspaces w JOIN worktrees wt ON w.worktree_id = wt.id WHERE wt.project_id = '$PROJECT_ID' AND wt.branch = '$BRANCH' AND w.deleting_at IS NULL LIMIT 1;" 2>/dev/null || true)
if [[ -n "$EXISTING_WS" ]]; then
  echo "Workspace already exists for branch '$BRANCH': $EXISTING_WS"
  # Update last_opened_at
  NOW_MS=$(($(date +%s) * 1000))
  sqlite3 "$DB" "UPDATE workspaces SET last_opened_at = $NOW_MS WHERE id = '$EXISTING_WS';"
  echo "Updated last_opened_at. Open Superset to see the workspace."
  exit 0
fi

# Check if worktree exists in DB but no workspace
EXISTING_WT=$(sqlite3 "$DB" "SELECT id, path FROM worktrees WHERE project_id = '$PROJECT_ID' AND branch = '$BRANCH' LIMIT 1;" 2>/dev/null || true)

if [[ -n "$EXISTING_WT" ]]; then
  IFS='|' read -r WT_ID WT_PATH <<< "$EXISTING_WT"
  echo "Found existing worktree $WT_ID at $WT_PATH, creating workspace..."
else
  # Create git worktree
  mkdir -p "$(dirname "$WORKTREE_PATH")"

  if [[ "$USE_EXISTING" == "true" ]]; then
    echo "Checking out existing branch '$BRANCH' as worktree..."
    git -C "$MAIN_REPO" worktree add "$WORKTREE_PATH" "$BRANCH" || die "Failed to create worktree for existing branch '$BRANCH'"
  else
    echo "Creating worktree at $WORKTREE_PATH (branch: $BRANCH, base: $BASE_BRANCH)..."
    git -C "$MAIN_REPO" worktree add -b "$BRANCH" "$WORKTREE_PATH" "$BASE_BRANCH" || die "Failed to create worktree"
  fi

  # Insert worktree record
  WT_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
  NOW_MS=$(($(date +%s) * 1000))

  sqlite3 "$DB" "INSERT INTO worktrees (id, project_id, path, branch, base_branch, created_at, created_by_superset) VALUES ('$WT_ID', '$PROJECT_ID', '$WORKTREE_PATH', '$BRANCH', '$BASE_BRANCH', $NOW_MS, 1);"
  echo "Created worktree: $WT_ID"
fi

# Get max tab_order for this project
MAX_ORDER=$(sqlite3 "$DB" "SELECT COALESCE(MAX(tab_order), 0) FROM workspaces WHERE project_id = '$PROJECT_ID';" 2>/dev/null || echo "0")
TAB_ORDER=$((MAX_ORDER + 1))

# Insert workspace record
WS_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
NOW_MS=$(($(date +%s) * 1000))

sqlite3 "$DB" "INSERT INTO workspaces (id, project_id, worktree_id, type, branch, name, tab_order, created_at, updated_at, last_opened_at) VALUES ('$WS_ID', '$PROJECT_ID', '$WT_ID', 'worktree', '$BRANCH', '$WS_NAME', $TAB_ORDER, $NOW_MS, $NOW_MS, $NOW_MS);"

echo ""
echo "Workspace created successfully!"
echo "  ID:       $WS_ID"
echo "  Name:     $WS_NAME"
echo "  Branch:   $BRANCH"
echo "  Worktree: ${WT_PATH:-$WORKTREE_PATH}"
echo ""
echo "Click on the project in the Superset sidebar to see the new workspace."
echo "Or to navigate directly (once deep link support ships):"
echo "  open 'superset://workspace/$WS_ID'"
