# Sidebar/header reorg — change log (branch `reorganize-sidebar-header`)

Revert guide: each item is independent; revert by undoing the listed file(s).

## Workspace content area (v2)

- **Presets bar: no border, taller, more chip spacing** — `h-8 gap-0.5 border-b` → `h-10 gap-1.5`, borderless. `v2-workspace/$workspaceId/components/V2PresetsBar/V2PresetsBar.tsx`
- **Run button moved presets bar → tab bar trailing slot** (next to BackgroundTerminalsButton; presets bar `trailing` prop deleted, TopBar portal slot `workspace-topbar-run-slot` deleted). `v2-workspace/$workspaceId/page.tsx`, `V2PresetsBar.tsx`, `_dashboard/components/TopBar/TopBar.tsx`
- **Inverted tab styling** — inactive tabs carry the shaded block/bottom border, active tab blends into pane; bar itself borderless. `packages/panes/.../TabBar/TabBar.tsx`, `TabItem.tsx`

## Workspace right sidebar (v2)

- **Tab strip (Files/Changes/Review) border-b removed**; inverted tab button styles. `WorkspaceSidebar/components/SidebarHeader/SidebarHeader.tsx`, `screens/main/.../RightSidebar/headerTabStyles.ts`
- **PR action header: border-b removed; open-in button moved here from TopBar** (renders next to Create PR). `WorkspaceSidebar/components/PRActionHeader/PRActionHeader.tsx`, `TopBar.tsx`
- **Open-in chevron size-3.5 → size-3** to match PR chevron. `TopBar/components/V2OpenInMenuButton/V2OpenInMenuButton.tsx`
- **Files tab: search button moved from tab strip into explorer toolbar** (before New File); "EXPLORER" title deleted. `WorkspaceSidebar/components/FilesTab/FilesTab.tsx`, `WorkspaceSidebar.tsx`

## Dashboard sidebar

- **New Workspace moved to top** (above Search/Automations/Tasks; also first in collapsed rail). `DashboardSidebar/components/DashboardSidebarHeader/DashboardSidebarHeader.tsx`
- **Recently-viewed (history) button hidden, not deleted** — two commented lines. `_dashboard/components/NavigationControls/NavigationControls.tsx:7,69`
- **Help menu moved into org dropdown.** `TopBar/components/OrganizationDropdown/components/HelpSubMenu/` (was `DashboardSidebarHelpMenu`)
- **New collapsible "Workspaces" header** above the project list; hover chevron right of label; hosts the Add repository dropdown (moved out of the New Workspace row). Collapse persists via zustand `sidebar-workspaces-collapse`. New: `DashboardSidebar/components/DashboardSidebarWorkspacesHeader/`, `stores/sidebar-workspaces-collapse.ts`; wired in `DashboardSidebar.tsx`, `DashboardSidebarHeader.tsx`
- **Header block border-b removed** (expanded variant only). `DashboardSidebarHeader.tsx`
- **Project header indented** `pl-3` → `pl-5`. `DashboardSidebarProjectSection/components/DashboardSidebarProjectRow/DashboardSidebarProjectRow.tsx`
- **Workspace diff stats (+N −N) only render on the active row.** `DashboardSidebarWorkspaceItem/components/DashboardSidebarExpandedWorkspaceRow/DashboardSidebarExpandedWorkspaceRow.tsx`
- **Workspace-count badges removed** from custom section headers and project rows (`totalWorkspaceCount` prop dropped from ProjectRow; collapsed-rail popover count kept). `DashboardSidebarSection/components/DashboardSidebarSectionHeader/DashboardSidebarSectionHeader.tsx`, `DashboardSidebarProjectRow.tsx`

---

# Session 2 additions (same branch, parallel session)

## Dashboard sidebar

- **User/org dropdown moved header → footer**; footer is now `[user dropdown | UpdatesPill | ⚙ | ?]` → later `?` removed (help lives in the org dropdown). `DashboardSidebarHeader.tsx`, `DashboardSidebar.tsx`
- **Settings is an icon-only gear** in the footer (was a full-width labeled row); tooltip carries the hotkey. `DashboardSidebar.tsx`
- **Org dropdown (expanded trigger): chevron removed** (topbar variant keeps it); **Settings item removed** from the menu (was the v1 TODO item); **"Switch organization" got an icon** (`HiOutlineArrowsRightLeft`). `TopBar/components/OrganizationDropdown/OrganizationDropdown.tsx`
- **`SubmitPromptDialog` moved** to `OrganizationDropdown/components/`; old `DashboardSidebarHelpMenu/` deleted (git-tracked, restorable).
- **Workspaces tab hidden, not deleted** — `SHOW_WORKSPACES_TAB = false` flag; flip to true to restore. `DashboardSidebarHeader.tsx` *(Update 2026-07-23: tab restored unconditionally; flag removed.)*
- **New Search row/icon** opens the command palette; clicking while open closes it (state captured on pointerdown because the palette dismisses on outside pointerdown before click). `DashboardSidebarHeader.tsx`
- **Looking-glass button deleted** from `NavigationControls.tsx` (`⌘K` hotkey unaffected).
- **ResourceConsumption moved** from right edge (`ml-auto`) to after back/forward in the top row. `DashboardSidebarHeader.tsx`
- **Section-header hover drag-grip removed** — chevron stays visible; drag still works via row listeners. `DashboardSidebarSectionHeader.tsx`
- **Workspaces under a section: indent `pl-7` → `pl-10`.** `DashboardSidebarExpandedWorkspaceRow.tsx`

## Terminal pane / changes panel

- **Pane-title chevron removed** (fetch spinner kept). `v2-workspace/.../TerminalPane/components/TerminalSessionDropdown/TerminalSessionDropdown.tsx`
- **Divider after rich-input ✎ button removed.** `TerminalPane/components/TerminalPaneHeaderExtras/TerminalPaneHeaderExtras.tsx`
- **Duplicate refresh spinner removed** (the refresh icon itself spins). `useChangesTab/components/ChangesToolbar/ChangesToolbar.tsx`
- **Changes header block: `py-1.5` wrapper** around header+toolbar; toolbar `border-b` removed. `useChangesTab/components/ChangesTabContent/ChangesTabContent.tsx`, `ChangesToolbar.tsx`

## Tabs / top bar (shared surfaces)

- **`headerTabStyles.ts` gained `inverted` option** used only by v2 `SidebarHeader.tsx` (`inverted: true`) — v1 RightSidebar styling unchanged; active tab framed by l/r/t borders, transparent sides keep 1px stability.
- **`packages/panes` TabItem/TabBar**: inverted colors, active-tab l/r/t frame, close-button hover bgs swapped; ALL `border-b` removed (tabbed + empty-state variants) and inactive-tab `border-r` separators removed; `+` button got `ml-1.5`. Affects every `Workspace` consumer.
- **`TopBar.tsx` `border-b` removed** — NOTE: dashboard-wide; every route loses the line under the top bar, not just the workspace view.
- **TopBar merged into the pane tab bar** (v2 workspace route, expanded sidebar only): `layout.tsx` skips `<TopBar />` when `onV2WorkspaceRoute && !versionMismatch && sidebarOutsideColumn`; the tab bar is now the Electron drag region (`drag` on the bar root, `no-drag` on tabs track / add button / trailing — `packages/panes` `TabBar.tsx`); `RightSidebarToggle` + non-Mac `WindowControls` moved into the tab-bar trailing slot (`v2-workspace/$workspaceId/page.tsx`). Collapsed/closed sidebar still shows the TopBar (its inset keeps content clear of macOS traffic lights). Workspace title breadcrumb no longer renders on this route.
