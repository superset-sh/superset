---
created: 2026-01-02T19:50:00Z
last_updated: 2026-01-03T15:58:00Z
session_count: 2
status: IN_PROGRESS
---

# Session: Working Indicator Implementation

## Goal
Add workspace status indicators showing agent lifecycle states:
- Amber (working) - Agent actively processing
- Red (permission) - Agent blocked, needs immediate action
- Green (review) - Agent completed, ready for review

## Constraints
- Must support Claude Code, OpenCode, and Codex (partial)
- Big bang migration (no backwards compatibility)
- No feature flags

## Key Decisions
- Decision 1: Use `PaneStatus` enum instead of `needsAttention` boolean
- Decision 2: OpenCode uses `session.status` event with `busy`/`idle` (not `tool.execute.before`)
- Decision 3: Claude Code uses `UserPromptSubmit` for Start event
- Decision 4: When clearing "permission" on click, set to "working" (not "idle") - assumes user granted permission
- Decision 5: Codex has partial support (review only, no working indicator)

## State
- Done: [x] Phase 1a: Update shared/tabs-types.ts - Add PaneStatus type
- Done: [x] Phase 1b: Update shared/constants.ts - Rename AGENT_COMPLETE to AGENT_LIFECYCLE
- Done: [x] Phase 2: Update notifications/server.ts - Handle Start event, paneId resolution
- Done: [x] Phase 3a: Update agent-wrappers.ts - Add UserPromptSubmit hook
- Done: [x] Phase 3b: Update agent-wrappers.ts - Update OpenCode plugin for session.status
- Done: [x] Phase 3c: Update notify-hook.ts - Map UserPromptSubmit to Start
- Done: [x] Phase 4: Update trpc/routers/notifications.ts - Update event types
- Done: [x] Phase 5a: Update stores/tabs/types.ts - Update interface
- Done: [x] Phase 5b: Update stores/tabs/store.ts - Add actions, migration
- Done: [x] Phase 6: Update useAgentHookListener.ts - Handle all events
- Done: [x] Phase 7a: Update WorkspaceItem.tsx - 3-color indicator
- Done: [x] Phase 7b: Update WorkspaceListItem.tsx - 3-color indicator
- Done: [x] Phase 8: Run typecheck and fix issues (pre-existing errors only remain)
- Now: [→] Phase 9: Test implementation

## Files to Modify
1. `apps/desktop/src/shared/tabs-types.ts`
2. `apps/desktop/src/shared/constants.ts`
3. `apps/desktop/src/main/lib/notifications/server.ts`
4. `apps/desktop/src/main/lib/agent-setup/agent-wrappers.ts`
5. `apps/desktop/src/main/lib/agent-setup/notify-hook.ts`
6. `apps/desktop/src/lib/trpc/routers/notifications.ts`
7. `apps/desktop/src/renderer/stores/tabs/types.ts`
8. `apps/desktop/src/renderer/stores/tabs/store.ts`
9. `apps/desktop/src/renderer/stores/tabs/useAgentHookListener.ts`
10. `WorkspaceItem.tsx`
11. `WorkspaceListItem.tsx`

## Research Summary
- OpenCode `SessionStatus` types: `idle`, `busy`, `retry`
- Claude Code hooks: `UserPromptSubmit`, `Stop`, `PermissionRequest`
- No "permission granted" hook exists - use click-to-clear → working workaround

## Working Set
- Branch: working-indicator (worktree)
- Status: Implementation in progress

---

## QA Checklist

### Prerequisites
- [ ] Desktop app builds without errors (`bun run dev` in apps/desktop)
- [ ] Notification server is running (check console for `[notifications] Listening on http://127.0.0.1:31416`)

### 1. Claude Code - Working Indicator (Amber)
- [ ] Start Claude Code in a workspace terminal
- [ ] Send a prompt to Claude Code
- [ ] **Expected**: Amber pulsing dot appears on workspace tab immediately
- [ ] **Expected**: Amber pulsing dot appears in sidebar (if using sidebar navigation)
- [ ] **Expected**: Amber pulsing dot appears on group/tab in TabsView

### 2. Claude Code - Review Indicator (Green)
- [ ] Wait for Claude Code to complete its response
- [ ] Switch to a DIFFERENT workspace before completion (so you're not watching)
- [ ] **Expected**: Green static dot appears on the original workspace
- [ ] **Expected**: Native notification appears: "Agent Complete — {workspace}"
- [ ] Click on workspace to acknowledge
- [ ] **Expected**: Green dot disappears (status → idle)

### 3. Claude Code - Permission Indicator (Red)
- [ ] Trigger a permission request in Claude Code (e.g., file edit, bash command)
- [ ] **Expected**: Red pulsing dot appears immediately
- [ ] **Expected**: Native notification appears: "Input Needed — {workspace}"
- [ ] Click on workspace to acknowledge
- [ ] **Expected**: Red dot changes to Amber (assuming permission granted, agent continues)

### 4. OpenCode - Working Indicator (Amber)
- [ ] Start OpenCode in a workspace terminal
- [ ] Send a prompt to OpenCode
- [ ] **Expected**: Amber pulsing dot appears when session.status = "busy"
- [ ] **Expected**: Indicator persists while OpenCode is processing

### 5. OpenCode - Review Indicator (Green)
- [ ] Wait for OpenCode to complete (session.status = "idle")
- [ ] Switch away before completion
- [ ] **Expected**: Green static dot appears on workspace
- [ ] **Expected**: Native notification appears

### 6. Click Behavior - Review Status
- [ ] Have a workspace in "review" state (green dot)
- [ ] Click on that workspace
- [ ] **Expected**: Green dot disappears (status → idle)

### 7. Click Behavior - Permission Status
- [ ] Have a workspace in "permission" state (red dot)
- [ ] Click on that workspace
- [ ] **Expected**: Red dot changes to Amber (status → working, not idle)

### 8. Click Behavior - Working Status
- [ ] Have a workspace in "working" state (amber dot)
- [ ] Click on that workspace
- [ ] **Expected**: Amber dot persists (working is NOT cleared by click)

### 9. Already Active Workspace
- [ ] Stay on a workspace while Claude Code is running
- [ ] Let it complete while you're watching
- [ ] **Expected**: NO indicator appears (goes straight to idle, not review)
- [ ] **Expected**: NO notification appears (you're already watching)

### 10. Multiple Panes - Priority
- [ ] Have multiple panes in one workspace
- [ ] Put one pane in "working" state, another in "permission" state
- [ ] **Expected**: Workspace shows RED dot (permission takes priority over working)
- [ ] Clear the permission pane
- [ ] **Expected**: Workspace shows AMBER dot (working is highest remaining)

### 11. App Restart - Stale Working Cleanup
- [ ] Get a pane into "working" state
- [ ] Quit the desktop app
- [ ] Restart the app
- [ ] **Expected**: "working" status is cleared to "idle" on startup (stale cleanup)
- [ ] **Expected**: "review" and "permission" statuses persist

### 12. Migration from Old Schema
- [ ] (If possible) Test with old persisted state that has `needsAttention: true`
- [ ] **Expected**: Migrates to `status: "review"`
- [ ] **Expected**: Old `needsAttention` field is removed

### 13. UI Locations - All Indicators Work
- [ ] Top bar workspace tabs (WorkspaceItem.tsx)
- [ ] Sidebar workspace list (WorkspaceListItem.tsx)
- [ ] Group strip tabs (GroupStrip.tsx)
- [ ] Tab item in sidebar (TabItem/index.tsx)
- [ ] **Expected**: All locations show consistent 3-color indicator

### 14. Tooltips
- [ ] Hover over indicator in TabItem
- [ ] **Expected**: Tooltip shows appropriate message:
  - Red: "Needs input"
  - Amber: "Agent working"
  - Green: "Ready for review"

### Notes/Issues Found
- 
- 
-

---

## Dev/Prod Separation (Hardening)

### Problem Discovered During Testing
When running both dev and prod versions simultaneously, agent hooks conflicted:
1. Global OpenCode plugin (`~/.config/opencode/plugin/superset-notify.js`) was shared
2. Dev overwrote it with new protocol (adds `Start` event)
3. Prod server didn't understand `Start`, treated it as `Stop` → notification spam

### Implementation Summary

#### P0: Critical Fixes
1. **Remove global plugin write** (`agent-wrappers.ts`)
   - No longer writes to `~/.config/opencode/plugin/`
   - Added `cleanupGlobalOpenCodePlugin()` to remove stale global plugins on startup

2. **Server ignores unknown events** (`notifications/server.ts`)
   - `mapEventType()` returns `null` for unknown event types
   - Server returns `{ success: true, ignored: true }` for unknown events
   - Ensures forward compatibility with future hook versions

3. **Fix notify.sh default behavior** (`notify-hook.ts`)
   - No longer defaults missing eventType to "Stop"
   - Parse failures no longer trigger completion notifications
   - Exits early if no valid event type found

#### P1: Environment Validation
1. **Added `SUPERSET_ENV`** to terminal env vars (`terminal/env.ts`)
   - Value: `"development"` or `"production"`
   - Passed in notify.sh requests

2. **Server validates environment** (`notifications/server.ts`)
   - Checks if incoming request's `env` matches server's environment
   - Logs warning and ignores mismatched requests
   - Returns success to not block agents

#### P2: Protocol Versioning
1. **Added `SUPERSET_HOOK_VERSION`** to terminal env vars
   - Current version: `"2"`
   - Passed in notify.sh requests

2. **Server logs version** for debugging
   - Helps troubleshoot version mismatches

#### P3: Documentation
- Created `apps/desktop/docs/EXTERNAL_FILES.md`
- Documents all files written outside of user projects
- Explains dev/prod separation strategy

#### P4: Testing
- Added tests in `terminal/env.test.ts` for new env vars
- Created `notifications/server.test.ts` for `mapEventType()` function

### Files Modified for Dev/Prod Separation
1. `apps/desktop/src/main/lib/agent-setup/agent-wrappers.ts`
2. `apps/desktop/src/main/lib/agent-setup/notify-hook.ts`
3. `apps/desktop/src/main/lib/agent-setup/index.ts`
4. `apps/desktop/src/main/lib/notifications/server.ts`
5. `apps/desktop/src/main/lib/terminal/env.ts`
6. `apps/desktop/src/main/lib/terminal/env.test.ts`
7. `apps/desktop/src/main/lib/notifications/server.test.ts` (new)
8. `apps/desktop/docs/EXTERNAL_FILES.md` (new)

---

## PR Description Template

### Title
feat(desktop): Add workspace status indicators with dev/prod separation

### Summary
This PR implements a 3-color workspace status indicator system and hardens the agent hook protocol for dev/prod separation.

### Changes

#### Workspace Status Indicators
- **Amber (pulsing)**: Agent actively processing
- **Red (pulsing)**: Agent blocked, needs user input  
- **Green (static)**: Agent completed, ready for review

Key features:
- Status aggregation: workspace shows highest-priority status across all panes
- Click behavior: review → idle, permission → working, working unchanged
- App restart: stale "working" status cleared on startup
- Migration: old `needsAttention` boolean migrated to `status: "review"`

#### Dev/Prod Separation
- Removed global OpenCode plugin write (was causing cross-talk)
- Added startup cleanup for stale global plugins
- Server ignores unknown event types (forward compatibility)
- notify.sh no longer defaults to "Stop" on parse failure
- Added `SUPERSET_ENV` and `SUPERSET_HOOK_VERSION` to terminal environment
- Server validates environment and logs mismatches

### Testing
- Run `bun test` in apps/desktop
- Manual QA checklist in ledger

### Breaking Changes
None - backwards compatible with existing persisted state (migration handled)

---

## Code Review #2 (2026-01-03)

### Feedback Analysis

#### P2 Issues

| Issue | Valid? | Action |
|-------|--------|--------|
| **P2-A**: `server.ts:141` hardcodes `"2"` instead of using `HOOK_PROTOCOL_VERSION` constant | ✅ VALID | Fix - import and use the constant |
| **P2-B**: `trpc-storage.ts` always returns `version: 0`, disabling Zustand persist versioning | ⚠️ VALID but PRE-EXISTING | This is NOT introduced by working-indicators. The adapter was already broken. Migration is idempotent so no corruption. Low priority. |

#### Questions

| Question | Response |
|----------|----------|
| **Q1**: With persistent terminals, can agent still be running after restart? Should use timeout/liveness? | Agent CAN still be running in daemon. However, status will auto-correct on next event (Start/Stop/Permission). Brief window of incorrect status is acceptable. Adding liveness check adds complexity for marginal benefit. **Decision: Document this limitation, don't add liveness check.** |
| **Q2**: `resolvePaneId` fallback - misattribute vs drop events? | **Misattribution is better than dropping.** If dropped, user sees NO indicator. If misattributed, at least SOME indicator shows on workspace. Worst case: wrong pane shows indicator, but user still gets alerted. **Decision: Keep current behavior, document trade-off.** |
| **Q3**: Should `thoughts/shared/handoffs/*` artifacts ship in repo? | ❌ **NO** - these are session artifacts. Should be in `.gitignore` or removed before merge. |

### Action Items
- [x] P2-A: Use `HOOK_PROTOCOL_VERSION` constant in server.ts ✅ Fixed
- [ ] Q3: Remove or gitignore handoff artifacts before merge
- [ ] (Optional) P2-B: Fix trpc-storage version handling (separate PR - pre-existing issue)
