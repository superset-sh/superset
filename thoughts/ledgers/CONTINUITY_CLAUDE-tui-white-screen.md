---
created: 2026-01-02T21:00:00Z
last_updated: 2026-01-02T11:15:00Z
session_count: 3
status: COMPLETED
---

# Session: TUI White Screen on Workspace Switch

## Goal
Fix the remaining white screen issue when switching back to a workspace with an active TUI (vim, opencode, claude). Currently requires manual resize to fix.

## Constraints
- Must not regress the original fix (gibberish text on tab switch)
- Must work with Canvas renderer (macOS default)
- Should minimize visual flash during reattach

## Key Decisions
- Decision 1: Using SIGWINCH approach instead of snapshots for TUI restoration (snapshots don't capture styled spaces)
- Decision 2: Need to ensure alt-screen is fully entered before flushing pending events
- Decision 3: **FINAL** - Keep terminals mounted instead of unmount/remount cycle (Oracle insight: "The moment you create a *new* xterm on remount, you lose emulator state")

## State
- Done: [x] Captured problem statement + prior fix summary
- Done: [x] Identified alt-screen reattach path in Terminal.tsx
- Done: [x] Analyzed timing of current reattach flow
- Done: [x] Identified 3 likely root causes (ranked by probability)
- Done: [x] Consulted Oracle - discovered fundamental issue with unmount/remount
- Done: [x] Implemented "keep terminals mounted" solution
- Done: [x] Added memory warning to settings
- Done: [x] Removed debug logging
- Done: [x] Updated technical documentation
- Done: [x] User verified: "omg everything feels buttery smooth now!"

- Complete: [✓] **BUG RESOLVED**

## Resolution Summary

**Root Cause:** The SIGWINCH approach was fundamentally fragile. React unmounts Terminal components on workspace switch, destroying xterm.js instances. New xterm on remount loses all emulator state - race conditions were inevitable.

**Solution:** Keep all terminal components mounted across workspace/tab switches. Use CSS `visibility: hidden` for inactive tabs. Gate behind `terminalPersistence` setting.

**Files Modified:**
- `TabsContent/index.tsx` - Render all tabs, hide inactive with CSS
- `TerminalSettings.tsx` - Added memory warning
- `Terminal.tsx` - Removed debug logging, kept SIGWINCH as fallback for app restart
- `2026-01-02-terminal-persistence-technical-notes.md` - Documented approach

## Open Questions (Answered)
- ~~Is xterm.write("\x1b[?1049h") async issue the primary cause?~~ **No - fundamental unmount issue**
- ~~Are container dimensions 0 during workspace switch?~~ **Moot - terminals stay mounted**
- ~~Does xterm.refresh() help after SIGWINCH?~~ **Moot - no more remount cycle**

## Working Set
- Branch: `persistent-terminals`
- PR: #541
- Status: Changes ready to commit
