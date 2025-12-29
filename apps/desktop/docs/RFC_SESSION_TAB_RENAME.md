# RFC: Group/Panes UX Refactor

> **Status**: Draft
> **Author**: Claude + Andreas
> **Date**: 2025-12-29
> **Related**: FILE_VIEWER_PANE_SPEC.md

## Summary

Rename the core UI hierarchy to match user mental models:
- **Tab** (layout container) → **Group** (a named Mosaic layout)
- **Pane** → **Pane** (a terminal, file viewer, or webview)
- **“New Terminal”** → Creates a **Terminal Pane** within the active Group (auto-splits if needed)

UI follow-up:
- Move Group switching from the left sidebar to a small tab strip above the content area
- Make the left sidebar primarily file-centric (Changes/Pinned/etc.), not a “terminal list”

This fixes a fundamental UX confusion where "New Terminal" creates a whole new layout instead of adding a terminal.

### Goals

- Make “New Terminal” add a terminal to the current layout by default
- Align user-facing language with how people expect “tabs” to work
- Keep migration seamless for existing users

### Non-goals (for the initial rollout)

- Changing the workspace (top bar) model or terminology
- Reworking terminal lifecycle/persistence beyond what’s required to support the rename/migration

### Terminology Note

This RFC uses **Group** as the user-facing term for the layout container (currently called a Tab). We explicitly avoid **Session** because it’s already used for other concepts (terminal sessions, auth sessions, etc.). If “Group” feels too generic, “Layout” is the main alternative.

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

- Sidebar becomes stacked sections (Changes, Pinned, Ports, …) per `FILE_VIEWER_PANE_SPEC.md`.
- No “Terminals” list in the sidebar for MVP (terminal panes are navigated in-place via the Mosaic layout + existing pane focus shortcuts).
- Content area always renders the Mosaic layout (no Tabs/Changes content swap).

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
2. Load the file view mode (Rendered/Raw/Diff) per `FILE_VIEWER_PANE_SPEC.md`.

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
- [ ] Make `Cmd+T` / “New Terminal” create a terminal pane in the active Group (fallback: create first Group)
- [ ] Update UI copy + hotkey labels: “Tab” → “Group” where we mean the layout container

### Phase 1: File-centric Sidebar (pairs with `FILE_VIEWER_PANE_SPEC.md`)

- [ ] Refactor sidebar into stacked sections (Changes, Pinned, Ports, …)
- [ ] Clicking a file opens/reuses a file viewer pane in the active Group
- [ ] Remove the content-area mode swap (content always renders the Mosaic layout)

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
│ Groups: [● review] [dev-server] [+]        (Cmd+T = New Terminal Pane)    │
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
  Cmd+T = New Terminal Pane in active Group
```

---

## Open Questions

1. **Group persistence**: Should groups persist across app restarts?
   - **Recommendation**: Yes, with terminal reconnection where possible.

2. **Empty groups**: What happens when the last Pane in a Group is closed?
   - **Recommendation**: Keep the Group with an empty state + “New Terminal” prompt.

3. **Group limits**: Maximum groups per workspace?
   - **Recommendation**: No hard limit, but warn above 10.

4. **Cross-group pane movement**: Allow moving panes between groups?
   - **Recommendation**: Yes, via context menu (drag/drop optional follow-up).

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
