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
