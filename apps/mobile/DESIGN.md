# Mobile UX Redesign — Laws of UX Pass

Branch: `ux/mobile-flow-laws-of-ux`
Scope: `apps/mobile/` only. No upstream package changes. No new routes.

## 1. Current Flow (as of branch base `7f6876f`)

```
RootLayout
└── (authenticated)             Stack + native TabBar (SwiftUI)
    ├── (home)                  Stack
    │   ├── index               WorkspacesScreen   (placeholder card)
    │   └── workspaces/[id]     WorkspaceDetailScreen (3 hard-coded cards)
    ├── (tasks)                 Stack
    │   ├── index               TasksScreen         (placeholder)
    │   └── [id]                TaskDetailScreen    (placeholder)
    └── (more)                  Stack
        ├── index               MoreMenuScreen      (org switch + nav)
        └── settings            SettingsScreen      (3 placeholder cards)
```

Tab bar: native SwiftUI view (`@superset/tab-bar`) with 3 visible items
(Home / Tasks / More-menu). Org switcher lives both in More and as a header
button on the Workspaces screen (sheet).

Note: the brief mentions `panes/[paneId]`, but that route does not exist on
mobile yet. Within this branch it is reinterpreted as "the cards (panes)
shown inside `workspaces/[id]`" — we improve their structure without
adding new routes.

## 2. Identified Violations

| Law                    | Violation                                                                                  |
|------------------------|--------------------------------------------------------------------------------------------|
| Hick's Law             | Tab count is fine (3). But Workspaces screen has zero scaffolding to filter when populated.|
| Fitts's Law            | Custom back chevrons (`<Pressable className="p-1">`) on Workspace/Task/Settings ~24x24 pt — far below 44pt target. |
| Jakob's Law            | Workspace and Task detail screens pad with `insets.top` instead of using the Stack header → no swipe-back affordance, no native large-title behavior. RefreshControl exists on home but is a no-op. |
| Miller's Law           | No grouping in Workspaces list. Once data arrives we'd dump N items in one viewport.        |
| Tesler's Law           | Org switching is duplicated (header sheet + More tab). Two affordances for one action.      |
| Aesthetic-Usability    | Hard-coded `hsl()` color in `OrganizationHeaderButton` chevron instead of token.            |
| Doherty Threshold      | No skeletons; on first paint the screen is blank text "will appear here". No optimistic UI. |
| Goal-Gradient          | No progress indicator while collections sync.                                               |
| Peak-End               | Pane (workspace card) "open" moment is unstyled — straight to a generic ScrollView.         |
| Serial Position        | Action lists in More are unranked; "Sign out" sits at end (good) but "Settings" is buried alone. |

## 3. Proposed Flow (same routes, new structure)

```
(home) WorkspacesScreen
├── Sticky header (Stack header — Jakob)
│   └── OrgHeaderButton (pressable 44pt, opens switcher sheet — Tesler dedupe)
├── ScrollView (RefreshControl wired to collection.refetch — Doherty)
│   ├── Section "Active"     (Miller — projects with non-archived status)
│   │   └── ProjectGroup
│   │       └── WorkspaceCard[] (≤7 visible, "see more" expander)
│   ├── Section "Recent"     (Serial Position — middle de-emphasised)
│   └── Section "Archived"   (collapsed by default — Tesler)
└── Loading: SkeletonList (Goal-Gradient + Aesthetic-Usability)

(home) workspaces/[id]  WorkspaceDetailScreen
├── Stack header (title from data, native back swipe — Jakob/Fitts)
└── ScrollView
    └── PaneCard[]   (Peak-End: subtle scale-in + spacing rhythm)

(tasks) TasksScreen
├── Stack header
└── ScrollView with same Active/Recent grouping pattern

(more) MoreMenuScreen
└── Order anchored: Org → primary actions → Sign out (Serial Position)
```

## 4. Concrete Changes (one commit each)

1. **fix(mobile/nav): native back + 44pt targets on detail screens** — drop manual `Pressable` back chevrons; rely on Stack header. Where a custom button is kept (e.g. settings deep-link), bump to `min-h-[44px] min-w-[44px]`. Removes Fitts/Jakob violations on `WorkspaceDetailScreen`, `TaskDetailScreen`, `SettingsScreen`.
2. **feat(mobile/workspaces): chunk projects with skeleton + sections** — render Active / Archived sections from `collections.projects`. Reusable `<SectionHeader>` and `<WorkspaceCard>` components in the screen folder. `<SkeletonList>` while data is loading. Caps each section to 7 visible items with "Show all" reveal (Miller). Wires RefreshControl to refetch the collection.
3. **fix(mobile/workspaces): use token color in OrgHeaderButton chevron** — replace `hsl(240 5% 64.9%)` with `useTheme().mutedForeground` (Aesthetic-Usability).
4. **feat(mobile/workspace-detail): real header + pane cards** — drive `Stack.Screen` title from project name via `Stack.Screen options`. Add `PaneCard` component grouping the three info sections with consistent spacing (Peak-End). Skeletons while project loads.
5. **feat(mobile/more): re-order and tighten More menu** — anchor Org at top, Settings + Help row in middle, Sign out at bottom (Serial Position). Single tap targets at 44pt.

Each commit is independently typecheckable and reversible. No deletes
without `bun run typecheck` clean.

## 5. Tradeoffs

- **No new dependencies.** Animations stay in `react-native-reanimated`
  (already a dep). No haptics lib (would be a nice Peak-End boost but
  out-of-scope under "no new deps").
- **Sections are component-local**, not a generic primitive. Promoting
  to `components/ui/section.tsx` would be premature abstraction for
  two consumers.
- **`panes/[paneId]` route not introduced.** Brief mentioned it, but
  creating it would conflict with "no new routes". The "pane" concept
  is realised as `<PaneCard>` within `workspaces/[id]`.
- **Native TabBar untouched.** It's already at 3 items (Hick OK) and
  changing the SwiftUI module is out of scope for this branch.
- **Org-switcher duplication is reduced** by collapsing the per-screen
  header sheet *only* when the user has a single org; multi-org users
  still get the quick header switch (this is a smaller change than
  removing it outright and avoids a regression for power users).

## 6. Out of Scope (honest)

- Real data wiring beyond what `useLiveQuery` already gives us.
- Search, command-palette, or filters beyond section chunking.
- iPad/web layout. Mobile portrait only.
- Tests — there is no test harness in `apps/mobile` today; adding one
  is its own PR.
