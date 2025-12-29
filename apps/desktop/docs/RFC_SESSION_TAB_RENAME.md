# RFC: Group/Panes UX Refactor

> **Status**: Draft
> **Author**: Claude + Andreas
> **Date**: 2025-12-29

## Summary

Rename the core UI hierarchy to match user mental models:
- **Tab** (layout container) → **Group** (a named Mosaic layout)
- **Pane** → **Pane** (a terminal, file viewer, or webview)
- **“New Terminal”** → Creates a **Terminal Pane** within the active Group (auto-splits if needed)

UI follow-up:
- Move Group switching from the left sidebar to a small tab strip above the content area
- Make the left sidebar primarily file-centric (Changes/Pinned/etc.), not a “terminal list”
- Add a workspace-level view toggle: **Workbench | Review**
  - **Workbench** = Groups strip + Mosaic (in-flow terminals + file viewer panes)
  - **Review** = dedicated Changes page for focused reviews

This fixes a fundamental UX confusion where "New Terminal" creates a whole new layout instead of adding a terminal.

### Motivation

This is a stepping stone toward a more **Conductor-like** workflow: the ability to view **code (files/diffs)** and **terminals** together in a single window/layout, without constantly switching “modes”.

Concretely, this unblocks a **File Viewer pane** that can live alongside terminals in the Mosaic layout.

This matters most for the “review + feedback loop” workflow:
- Reviewing code and plans while giving feedback to an AI via the CLI
- Keeping the terminal visible while reading changes/diffs and docs

Today the design makes this difficult because the user often has to switch between views to accomplish what should be one continuous flow.

Longer-term, this structure also sets us up to support higher-level review workflows (e.g., creating GitHub review comments from inside Superset), but that is explicitly out of scope for the MVP.

### Goals

- Make “New Terminal” add a terminal to the current layout by default
- Align user-facing language with how people expect “tabs” to work
- Keep migration seamless for existing users

### Non-goals (for the initial rollout)

- Changing the workspace (top bar) model or terminology
- Reworking terminal lifecycle/persistence beyond what’s required to support the rename/migration
- Removing the dedicated Changes page (Review mode needs a focused review surface)

### Terminology Note

> **⚠️ Decision needed:** What should we call the layout container?

This RFC uses **Group** as the placeholder term for the layout container (currently called a Tab). We explicitly avoid **Session** because it's already used for other concepts (terminal sessions, auth sessions, etc.).

| Option | Pros | Cons |
|--------|------|------|
| **Group** | Familiar from browser tab groups, suggests "collection of things" | Generic, could mean anything |
| **Layout** | Describes exactly what it is (a pane arrangement) | Less personal/memorable, sounds technical |
| **Space** | Used by macOS (Spaces), implies a "workspace within a workspace" | Could conflict with "Workspace" terminology |
| **Canvas** | Creative, implies "arrange things freely" | Uncommon in dev tools, learning curve |
| **View** | Simple, familiar | Overloaded term (file view, diff view, etc.) |

**Current recommendation:** **Group** - but revisit after user testing.

---

## Problem Statement

### Current Behavior (Confusing)

```
┌─────────────────────────────────────────────────────────────────┐
│ Content (active Tab = layout container):                         │
│  ┌─────────────────────┬─────────────────────┐                  │
│  │ Pane: Terminal A    │ Pane: Terminal B    │                  │
│  └─────────────────────┴─────────────────────┘                  │
└─────────────────────────────────────────────────────────────────┘

Sidebar (Terminals):
┌─────────────────────┐
│ Terminals       [+] │  ← [+] creates NEW TAB (unexpected!)
│ ● Tab 1 (2)         │  ← "2" means 2 panes inside
│   Tab 2             │
└─────────────────────┘
```

### The Confusion

| Action | User Expects | Actually Happens |
|--------|--------------|------------------|
| Click [+] "New Terminal" | Add terminal to current view | Creates entirely new Tab/layout |
| "Tab 1 (2)" | ??? | Tab 1 contains 2 panes |
| Split terminal | Creates new pane | Creates new pane ✓ |

Users expect:
- **“New Terminal”** adds a terminal pane to the current layout
- The unit you “switch between” is a named group/layout, not a terminal itself

Reality (today):
- Our **Tab** is a layout container (Mosaic of panes)
- **“New Terminal”** creates a new layout container

### Root Cause

Our naming + placement implies “tabs behave like browser tabs”, but our Tab is actually a layout container.

```
Current (code + UI today):               Proposed (user-facing):

Workspace                                Workspace
  └── Tab (layout container)               └── Group (layout container)
        └── Pane (terminal/file)                 └── Pane (terminal/file)
```

---

## Proposed Solution

### Rename the Hierarchy

| Current Term | New Term | Definition |
|--------------|----------|------------|
| Tab | **Group** | A Mosaic layout containing one or more Panes |
| Pane | **Pane** | A single view: terminal, file viewer, or webview |
| TabsStore | *(optional)* **GroupsStore** | Internal rename for clarity (follow-up) |
| TabsView | **GroupSwitch** | UI control for switching Groups (moves above content) |

### Fix "New Terminal" Behavior

| Action | Current | Proposed |
|--------|---------|----------|
| “New Terminal” (`Cmd+T` / button) | Creates new Tab (layout) | Creates a Terminal Pane in the active Group |
| “New Group” (`+` in group switcher) | Creates new Tab (layout) | Creates a new Group |
| Split action | Creates pane | Creates pane (unchanged) |

### Visual Comparison

**Before (Current):**
```
┌─────────────────────────────────────────────────────────────────┐
│ Sidebar (today):         │  Content (active Tab):                │
│ ┌─────────────────────┐ │  ┌─────────────────────────────────┐  │
│ │ New Terminal     [+]│ │  │ Pane        │ Pane              │  │
│ │ ● Tab 1 (2)         │ │  │ Terminal A  │ Terminal B        │  │
│ │   Tab 2             │ │  └─────────────────────────────────┘  │
│ └─────────────────────┘ │  (+) creates a new Tab/layout          │
└─────────────────────────┴───────────────────────────────────────┘
```

**After (Proposed):**
```
┌─────────────────────────────────────────────────────────────────┐
│ Groups: [review] [dev-server] [+]           ← [+] = New Group    │
├───────────────────────┬─────────────────────────────────────────┤
│ Sidebar (files)       │  Active Group: review                    │
│ ┌───────────────────┐ │  ┌──────────────────┬─────────────────┐ │
│ │ Changes       [⟳] │ │  │ Pane: Terminal   │ Pane: File View  │ │
│ │ Pinned        [+] │ │  │                  │                 │ │
│ │ Ports             │ │  └──────────────────┴─────────────────┘ │
│ └───────────────────┘ │  “New Terminal” / Cmd+T adds a pane      │
└───────────────────────┴─────────────────────────────────────────┘
```

---

## Detailed Design

### 1. Terminology & Scope (User-facing)

- **Workspace**: existing top-level unit (top bar). Unchanged.
- **Group**: the layout container currently implemented as a Tab (holds a Mosaic layout of panes). Shown in a group tab strip above the content area.
- **Pane**: a single view inside a Group (terminal / file viewer / webview). Implemented as Mosaic tiles.

**Recommended implementation approach (MVP): UI-first**
- Keep existing internal names (`TabsStore`, `Tab`, `Pane`) to minimize churn and avoid a persisted-state migration.
- Change UI labels (Tab → Group), move the group switcher UI, and change “New Terminal” to add a pane to the active group.

**Follow-up (optional): internal rename**
- If we still want code parity with UI terminology later, do a pure refactor (Tab → Group in code) behind a schema version bump + migration.

### 2. UI Changes

#### Group Switcher (above content)

- Add a small group tab strip directly above the Mosaic content (inside `WorkspaceView`, below `WorkspaceActionBar`).
- Group items show the current Tab names; `+` creates a new Group; rename on double-click.
- This becomes the primary way to switch Groups (instead of the left sidebar).

#### Sidebar (file-centric)

- Sidebar becomes stacked sections (Changes, Pinned, Ports, …) so file navigation/actions don’t replace the main content.
- No “Terminals” list in the sidebar for MVP (terminal panes are navigated in-place via the Mosaic layout + existing pane focus shortcuts).
- In **Workbench**, content always renders the Mosaic layout (no Tabs/Changes content swap driven by sidebar mode).

#### Workspace View Toggle (Workbench | Review)

- Add a workspace-level view toggle in `WorkspaceActionBar`: **Workbench | Review**
  - **Workbench**: Groups strip + Mosaic content (in-flow terminals + file viewer panes)
  - **Review**: dedicated Changes page for focused review (Groups strip hidden)

#### File Viewer Pane (MVP)

- Add a `file-viewer` pane type that can be opened alongside terminals in the Mosaic layout.
- Modes:
  - **Rendered**: markdown rendering for docs/plans
  - **Raw**: plain text/code view
  - **Diff**: inline/side-by-side diff for changed files

**Default mode selection:**
| File context | Default mode |
|--------------|--------------|
| File is in Changes (modified) | **Diff** |
| File is `.md` / `.mdx` | **Rendered** |
| All other files | **Raw** |

User can switch modes via a toggle in the pane header.

**Open behavior:** Clicking a file in **Changes** or **Pinned** opens/reuses a File Viewer pane in the active Group.

**Reuse policy:** Reuse the most-recent unlocked File Viewer pane in the active Group; if none exists, create a new pane via auto-split. Track "most recent" by last-focused timestamp.

**Lock/pin concept:**
- By default, File Viewer panes are **unlocked** (preview mode). Clicking another file replaces the content.
- **Locking** a pane (via a 🔒 toggle or double-clicking the file tab) prevents it from being replaced. This lets you keep important files open while browsing others.
- Files opened from **Pinned** default to locked.
- Visual indicator: locked panes show a pin/lock icon in their header.

```
Example: You have 2 file viewer panes open

┌─────────────────────┬─────────────────────┐
│ 📄 README.md   [🔒] │ 📄 config.ts   [ ]  │  ← README is locked, config is unlocked
└─────────────────────┴─────────────────────┘

Click "utils.ts" in Changes sidebar:
→ config.ts pane gets replaced with utils.ts (it was unlocked)
→ README.md stays open (it was locked)
```

#### Auto-Split Algorithm

When creating a new pane (terminal or file viewer), the system needs to decide how to split the layout.

**Options considered:**

| Option | Behavior | Pros | Cons |
|--------|----------|------|------|
| **A. Always horizontal** | New pane appears to the right | Predictable | Wastes vertical space on wide monitors |
| **B. Always vertical** | New pane appears below | Predictable | Wastes horizontal space |
| **C. Aspect-ratio based** | Split the longer dimension | Adapts to window shape | Less predictable |
| **D. Largest-pane based** | Find largest pane, split it | Balances layout | Complex, may split unexpected pane |
| **E. User preference** | Setting: "Default split direction" | User control | Extra config |

**Recommendation: Option C (aspect-ratio based)** with a twist:

1. Look at the **focused pane's** dimensions (not the whole layout)
2. If pane width > height × 1.5 → split **horizontal** (new pane to right)
3. Else → split **vertical** (new pane below)
4. Fallback for first pane: horizontal split

This adapts to the current layout naturally. A wide terminal gets split horizontally; a tall one gets split vertically.

### 3. Interaction Flows

#### Creating a New Terminal Pane

**Trigger:** `Cmd+T` (and/or a “New Terminal” button near the group switcher)

1. If there is an active Group: add a terminal pane to it (auto-split if needed).
2. If there is no active Group: create the first Group, then create the terminal pane.

#### Creating a New Group

**Trigger:** Click `+` in the group switcher

1. Create a new Group with a single terminal pane.
2. Set it active and focus the new pane.

#### Opening a File (from Changes or Pinned)

1. Open/reuse a File Viewer pane in the active Group (reuse an unlocked one if present; otherwise create a new pane via auto-split).
2. Load the file in the selected view mode (Rendered/Raw/Diff).

### 4. Group Naming

Groups get intelligent default names based on content:

| Context | Default Name |
|---------|--------------|
| First group | `"main"` or workspace name |
| Has claude terminal | `"claude-review"` |
| Has dev server | `"dev-server"` |
| Generic | `"Group N"` |

User can rename by double-clicking the group label in the group switcher.

### 5. Keyboard Shortcuts

We should avoid collisions with existing workspace/window shortcuts (e.g., `Cmd+N` = New Workspace, `Cmd+1-9` = Switch Workspace, `Cmd+Shift+W` = Close Window).

**Proposed MVP (keep keys, update meaning/labels to match UX):**

| Shortcut | Current Action (today) | Proposed Action |
|----------|-------------------------|-----------------|
| `Cmd+T` | New terminal Tab (new layout container) | New terminal **Pane** in active Group (fallback: create Group if none) |
| `Cmd+Up/Down` | Previous/Next terminal Tab | Previous/Next **Group** |
| `Cmd+W` | Close focused Pane (may close the Tab if last) | Close focused Pane (same behavior) |
| `Cmd+⌥+Left/Right` | Previous/Next Pane within a Tab | Previous/Next Pane within a Group (same behavior) |
| `Cmd+D` / `Cmd+Shift+D` / `Cmd+E` | Split pane (right/down/auto) | Split pane (same behavior) |

**Out of scope:** a hotkey for “New Group”.

---

## Migration

MVP (UI-first): **No persisted-state migration.** We keep the existing `TabsStore` schema and only change behavior + labels.

Optional follow-up (internal rename): If we later rename internal state (tabs → groups, `tabId` → `groupId`, etc.), bump the persisted schema version and add a migration.

---

## Implementation Plan

### Phase 0: UX Fix (MVP)

- [ ] Add Group switcher strip above content
- [ ] Add workspace-level view toggle in `WorkspaceActionBar`: **Workbench | Review**
- [ ] Make `Cmd+T` / “New Terminal” create a terminal pane in the active Group (fallback: create first Group)
- [ ] Update UI copy + hotkey labels: “Tab” → “Group” where we mean the layout container

### Phase 1: File-centric Sidebar + File Viewer Pane

- [ ] Refactor sidebar into stacked sections (Changes, Pinned, Ports, …)
- [ ] Clicking a file opens/reuses a file viewer pane in the active Group
- [ ] Remove the content-area mode swap (content always renders the Mosaic layout)
- [ ] Keep a dedicated Changes page (current `ChangesContent`) for focused review workflows (Review mode)

### Phase 2: Optional Internal Rename

- [ ] Rename internal types/files for clarity (Tab → Group in code) once the UX is validated
- [ ] Add a persisted schema version bump + migration only if we change stored keys/shape

---

## Visual Summary

### Proposed Layout (MVP)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Workspace Tabs (unchanged)                                                │
├──────────────────────────────────────────────────────────────────────────┤
│ WorkspaceActionBar (workspace header)                View: [Workbench|Review] │
├──────────────────────────────────────────────────────────────────────────┤
│ Workbench: Groups: [● review] [dev-server] [+]     (Cmd+T = New Terminal) │
├─────────────────────────┬────────────────────────────────────────────────┤
│ SIDEBAR (files)         │  GROUP: review                                  │
│ ┌─────────────────────┐ │  ┌──────────────────┬────────────────────────┐ │
│ │ Changes         [⟳] │ │  │ Pane: Terminal    │ Pane: File Viewer      │ │
│ │ Pinned          [+] │ │  │                  │                        │ │
│ │ Ports               │ │  └──────────────────┴────────────────────────┘ │
│ └─────────────────────┘ │                                                │
└─────────────────────────┴────────────────────────────────────────────────┘

Legend:
  [+] in Groups strip = New Group
  Workbench shows Groups strip + Mosaic
  Review shows the dedicated Changes page (focused review)
```

### Review Mode (focused Changes page)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Workspace Tabs (unchanged)                                                │
├──────────────────────────────────────────────────────────────────────────┤
│ WorkspaceActionBar (workspace header)                View: [Workbench|Review] │
├──────────────────────────────────────────────────────────────────────────┤
│ Review: Focused Changes page (no Groups strip)                            │
│ ┌─────────────────────────┬────────────────────────────────────────────┐ │
│ │ Changes list / filters   │ Diff / editor / actions                     │ │
│ │ - Against main           │ - View diff                                 │ │
│ │ - Staged / Unstaged      │ - Stage / unstage / discard                 │ │
│ │ - Commits                │ - Commit / PR helpers                        │ │
│ └─────────────────────────┴────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Open Questions

### 1. Group persistence
Should groups persist across app restarts?

**Recommendation**: Yes, with terminal reconnection where possible.

---

### 2. Empty groups
What happens when the last Pane in a Group is closed?

| Option | Behavior | Pros | Cons |
|--------|----------|------|------|
| **A. Delete the Group** | Group disappears when last pane closes | Simple, no empty states | Loses the "named layout" if user wants to reuse it |
| **B. Keep with empty state** | Show empty Group with "New Terminal" prompt | Preserves named layouts | Adds a third state (has panes / empty / doesn't exist) |
| **C. Keep but auto-create pane** | Immediately create a new terminal pane | Never empty | Unexpected terminal spawning |

**Recommendation**: **Option A (Delete the Group)** for MVP simplicity. If users want to keep a layout, they don't close all panes. Revisit if feedback suggests people want persistent named layouts.

---

### 3. Group limits
Maximum groups per workspace?

**Recommendation**: No hard limit, but warn above 10.

---

### 4. Cross-group pane movement
Allow moving panes between groups?

**Recommendation**: Yes, via context menu (drag/drop optional follow-up).

---

### 5. Terminal discoverability across Groups

> **⚠️ Decision needed:** How do users find a specific terminal when they have many terminals across multiple Groups?

**Problem:** The sidebar becomes file-centric (Changes, Pinned, Ports). If a user has 5 terminals across 2 Groups, how do they find the one running `npm run build`?

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A. Sidebar terminal section** | Keep a collapsible "Terminals" section in sidebar | Familiar, always visible | Clutters sidebar, competes with file focus |
| **B. Quick-switch overlay** | `Cmd+Shift+T` opens a searchable terminal picker | Fast, keyboard-centric | Hidden, discoverability issue |
| **C. Mosaic pane headers** | Show terminal name/command in each pane header | Always visible in-context | Only works for visible panes |
| **D. Group hover preview** | Hovering a Group tab shows thumbnail/list of panes | Non-intrusive | Requires mouse, slow |
| **E. Combined B + C** | Pane headers + quick-switch overlay | Best of both worlds | More to build |

**Visual: Option B (Quick-switch overlay)**
```
┌──────────────────────────────────────────────────────────────────┐
│ Cmd+Shift+T pressed:                                              │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ 🔍 Search terminals...                                        │ │
│ ├──────────────────────────────────────────────────────────────┤ │
│ │ ● npm run dev          [dev-server] Group                    │ │
│ │   claude --chat        [review] Group                        │ │
│ │   npm run build        [review] Group                        │ │
│ │   zsh                  [main] Group                          │ │
│ └──────────────────────────────────────────────────────────────┘ │
│ ↑↓ to navigate, Enter to switch, Esc to cancel                   │
└──────────────────────────────────────────────────────────────────┘
```

**Visual: Option A (Sidebar terminal section)**
```
┌─────────────────────┐
│ Sidebar             │
├─────────────────────┤
│ ▼ Changes       [⟳] │
│   file1.ts          │
│   file2.ts          │
├─────────────────────┤
│ ▶ Pinned        [+] │
├─────────────────────┤
│ ▼ Terminals         │  ← Collapsible section
│   ● npm run dev     │
│     [dev-server]    │
│   ○ claude --chat   │
│     [review]        │
│   ○ npm run build   │
│     [review]        │
├─────────────────────┤
│ ▶ Ports             │
└─────────────────────┘
```

**Recommendation**: **Option E (Combined B + C)** - Show terminal name/command in Mosaic pane headers (always visible for current Group), plus a quick-switch overlay for cross-Group navigation. MVP: Start with C (pane headers), add B (quick-switch) as fast follow.

---

### 6. Workbench ↔ Review transition behavior

When switching between Workbench and Review modes, what state is preserved?

**Behavior:**
- **Workbench → Review**: Remember which Group was active. Review mode shows the full-screen Changes page.
- **Review → Workbench**: Return to the last active Group. If no Groups exist, create the first Group.
- **Keyboard shortcut**: Consider `Cmd+Shift+R` to toggle between modes (or a single-key shortcut if available).

```
User flow example:

1. User is in Workbench, Group "review" is active
2. User clicks "Review" toggle → switches to Review mode (full-screen Changes)
3. User reviews diffs, stages files
4. User clicks "Workbench" toggle → returns to Group "review" exactly as they left it
```

**State preserved across toggle:**
- Active Group selection
- Pane arrangement within each Group
- Terminal sessions (still running in background during Review mode)
- File Viewer pane contents and lock state

---

## Success Criteria

1. Users understand that `Cmd+T` / “New Terminal” adds a terminal pane to the current Group (not a new Group)
2. Users understand Groups as “named layouts” within a workspace
3. File viewers open as panes alongside terminals naturally
4. Existing workspaces open without a migration step (MVP is UI-first)
5. Keyboard shortcuts feel intuitive

---

## Appendix: Terminology Glossary

| Term | Definition |
|------|------------|
| **Group** | A named layout container (implemented as a Tab today). Rendered in the group switcher above the content area. |
| **Pane** | A single view: terminal, file viewer, or webview. Lives inside a Group and is arranged by Mosaic. |
| **Mosaic** | The layout engine that arranges Panes within a Group. Supports arbitrary split arrangements. |
| **Active Group** | The Group currently visible in the content area. |
| **Active Pane** | The Pane currently focused within the active Group. |
| **Sidebar** | Left panel for file-centric navigation/actions (Changes, Pinned, Ports, etc.). |
