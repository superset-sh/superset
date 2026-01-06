---
created: 2026-01-06T12:00:00Z
last_updated: 2026-01-06T16:15:00Z
session_count: 3
status: IN_PROGRESS
---

# Session: Working Indicator Feature

## Goal
Ship 3-color workspace status indicators on main branch, with proper OpenCode support.

## Completed Work

### 1. Rebase onto main (DONE)
- Cherry-picked `c3a67201` onto main (was on persistent-terminals)
- Resolved 8 conflicts, dropped persistent-terminals code
- Pushed as commit `a9cd65d4`

### 2. Fix sidebar StatusIndicator regression (DONE)
- WorkspaceListItem.tsx had hardcoded red dot instead of 3-color StatusIndicator
- Added `workspaceStatus` computation with priority: permission > working > review
- Replaced hardcoded red with StatusIndicator component
- Pushed as commit `6e4a8d0e`

### 3. Updated PR #588 (DONE)
- Changed base branch from persistent-terminals → main
- Updated description with UI locations, QA checklist, indicator colors

### 4. Fix OpenCode completion detection (DONE)
**Root cause found:** OpenCode uses `session.busy` and `session.idle` as separate event types, NOT `session.status` with nested `status.type`.

**Fix applied:**
- OLD: `session.status` with `status.type === "busy"` / `"idle"`
- NEW: `session.busy` / `session.idle` as separate events
- Bumped plugin version to v5
- Committed as `649258f7`

### 5. Fix stuck indicator on agent quit (DONE)
**Problem:** When agent is quit via Ctrl+C or exit, Stop hook never fires and indicator stays amber forever.

**Root cause:** Terminal exit events were disconnected from pane status cleanup.

**Solution:** Clear "working" and "permission" status when terminal exits.
- Added `setPaneStatus` selector to Terminal.tsx
- Added status clearing in both exit handlers (handleStreamData and flushPendingEvents)
- "review" status preserved (user should see completed work)
- Updated useAgentHookListener.ts documentation
- Committed as `60c36400`

## Current Work

### Ready for QA (IN PROGRESS)
All fixes applied, needs manual testing:
1. OpenCode completion detection
2. Stuck indicator on quit

## Next Steps
- [ ] Manual test with Claude and OpenCode
- [ ] Get PR merged

## Key Files
- `apps/desktop/src/main/lib/agent-setup/agent-wrappers.ts` - OpenCode plugin (FIXED)
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/Terminal.tsx` - Terminal exit cleanup (FIXED)
- `apps/desktop/src/renderer/stores/tabs/useAgentHookListener.ts` - Agent lifecycle docs (UPDATED)

## Working Set
- Branch: `working-indicator`
- PR: https://github.com/superset-sh/superset/pull/588
- Latest commit: `60c36400 fix(desktop): clear pane status on terminal exit to fix stuck indicators`

## Key Learnings
- OpenCode emits `session.busy` and `session.idle` as separate events (not nested in `session.status`)
- Terminal exit events (from node-pty) are reliable and always fire
- Connecting terminal exit to status cleanup provides a robust fallback for stuck indicators
