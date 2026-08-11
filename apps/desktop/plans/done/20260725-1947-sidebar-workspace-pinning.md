# Add user-controlled workspace pinning to the v2 dashboard sidebar

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from AGENTS.md and the ExecPlan template in `.agents/skills/create-plan/SKILL.md`.

## Purpose / Big Picture

Users with many workspaces across several projects have no way to keep the handful they care about within one glance and one click. After this change, a user can right-click any workspace row in the v2 dashboard sidebar and choose "Pin". The workspace then appears in a "Pinned" section at the very top of the sidebar, above all project groups, and disappears from its project group. Unpinning (same context menu) returns it to exactly where it was — same project, same section, same manual order position. Pins survive app restarts. To see it working: run `bun dev`, open the desktop app, right-click a workspace in the sidebar, choose "Pin", and observe it move to a new "Pinned" section at the top.

The design is modeled on a task-pinning implementation reviewed (2026-07-25) in another agent-workspace desktop app — "the reference app" below — (a `pinnedAt` nullable timestamp, a partitioned "Pinned" section rendered above the recency list, unpin-on-archive), while deliberately fixing its two weaknesses: their API is toggle-only (their `unpin` is a racy "toggle, then toggle again if the result was wrong" hack), and they store `pinnedAt` but never use it for ordering, so their pinned section reorders itself by activity. We use an idempotent `setWorkspacePinned(workspaceId, projectId, pinned)` mutation and order the pinned section by `pinnedAt` ascending (new pins append at the bottom, like pinned browser tabs — stable, predictable).

## Assumptions

- Pinning is a v2-sidebar-only feature. The v1 sidebar (`apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/`) is not touched.
- Pin state is per-device, per-organization local UI state, like every other sidebar-placement concern (order, sections, hidden). It does not sync across devices. This matches where `tabOrder`, `sectionId`, and `isHidden` already live and requires no Postgres migration, no Electric shape change, and no host-service change.
- A "main" workspace (the always-present local checkout of a project, `type === "main"`) can be pinned like any other workspace. The existing behavior that main workspaces sort first *within their project group* is unrelated and unchanged.

## Open Questions

- Should the pinned section support manual drag reordering in v1 of this feature? Plan says no (order by `pinnedAt`); dnd-kit is already in the sidebar so it is a mechanical follow-up if wanted. → Decision Log placeholder D6.
- Should pinned rows also get entries in the keyboard shortcut map (`useDashboardSidebarShortcuts`) ahead of project workspaces? Plan says defer. → Decision Log placeholder D7.
- Should the row get a hover push-pin button in addition to the context-menu item? the reference app offers both (a `group-hover` pin button on every row plus the right-click menu). Superset rows already show hover chips (agents, ports), so v1 is context-menu-only to avoid hover-affordance crowding; revisit after use. → Decision Log placeholder D8.

## Progress

- [x] (2026-07-25 19:47Z) Reviewed the reference app's pinning implementation end-to-end (see Purpose for takeaways).
- [x] (2026-07-25 19:47Z) Mapped the Superset v2 sidebar data flow (see Context and Orientation).
- [x] (2026-07-25 19:47Z) Drafted this plan.
- [x] (2026-07-25 19:55Z) Cross-checked the draft against two independent full-repo explorations (the reference app and Superset); no contradictions found. Folded in: single tombstone site for `isHidden`, collapsed-rail rendering constraint, hover-button open question (D8), analytics note.
- [x] (2026-07-25 20:05Z) Plan approved by Avi ("ok can you implement the pinning system").
- [x] (2026-07-25 20:25Z) Milestone 1: `pinnedAt` schema field + heal defaults + tests; `setWorkspacePinned` in `useDashboardSidebarState`; tombstone clears `pinnedAt`; `isPinned`→`isLocalMainWorkspace` and `normalizePinnedFirst`→`normalizeMainFirst` renames.
- [x] (2026-07-25 20:35Z) Milestone 2: `partitionSidebarWorkspacesByPinned` + `buildDashboardSidebarPinnedWorkspaces` (sharing a new `decorateSidebarWorkspace` helper with the projects builder) + tests; `useDashboardSidebarData` returns `pinnedWorkspaces`; `DashboardSidebarWorkspace` gained `isPinned`.
- [x] (2026-07-25 20:45Z) Milestone 3: `DashboardSidebarPinnedSection` component (expanded + collapsed icon-stack modes), Pin/Unpin context-menu item at first position, `pinnedContext` project avatar on pinned rows, `activeV2Project` lookup covers pinned rows.
- [x] (2026-07-25 20:50Z) Milestone 4 (automated): `bun run typecheck` clean, `bun run lint` clean, schema + builder tests pass (23/23), full `_authenticated` route suite green except one pre-existing unrelated failure (`paneScrollStateCache`, fails on a clean tree too).
- [ ] Milestone 4 (manual): CDP walkthrough in the running dev app per Validation and Acceptance.

## Surprises & Discoveries

- Observation: The sidebar codebase already uses the word "pinned" for an unrelated concept — main workspaces are forced to the top of their project group, and `DashboardSidebarWorkspaceContextMenu` takes an `isPinned` prop that actually means "is a local main workspace" (it hides remove/hide items). `useSidebarDnd.ts:245-267` has a `normalizePinnedFirst` helper for the same thing.
  Evidence: `DashboardSidebarWorkspaceItem.tsx:158` passes `isPinned={isMainWorkspace && hostType === "local-device"}`.
  Consequence: Milestone 1 renames that prop/concept to `isMainWorkspace` before introducing real pinning, so the two never collide.

- Observation: A full independent exploration of the reference app (2026-07-25) confirmed the review this plan is based on, and added: the reference app has no keyboard shortcut for pin, no max pin count, and fires analytics events on pin/unpin (`pin`/`unpin` in their `analytics-events.ts`). It also exposes pinning through both a hover button and the context menu (see Open Question / D8).
  Consequence: If the desktop app has an analytics surface for sidebar actions, Milestone 3 should emit pin/unpin events through it; check analytics usage near the existing context-menu actions during implementation and mirror whatever the sibling actions (hide, toggle-unread) do.

- Observation: A full independent exploration of the Superset repo (2026-07-25) confirmed the plan's approach and pinned down three details. First, `sidebarState.isHidden` is set to `true` in exactly one place — `tombstoneSidebarWorkspaceRecord` in `useDashboardSidebarState/sidebarMutations.ts` (insert at line ~49, update at line ~60) — so Milestone 1's lifecycle cleanup is a single edit there (the separate hard-delete path deletes the whole row, nothing to clean). Second, the collapsed sidebar rail renders no section chrome at all — `DashboardSidebarCollapsedProjectContent.tsx` filters to workspace icons only — so the collapsed Pinned section is a plain icon list at the top of the rail, no header. Third, `isHidden` is also read outside the sidebar by the v2-workspaces list route (`useAccessibleV2Workspaces.ts`, `V2WorkspaceRow.tsx`); pinning deliberately does not surface there in v1. Also for future grep hygiene: `packages/panes` has its own unrelated `pinned` (pane/tab pinning) and `shared/tabs-types.ts` an `isPinned` (file-tab preview state); neither collides with this work.
  Evidence: superset-explorer agent report, 2026-07-25.

- Observation: Merging `origin/main` (2026-07-25, after implementation) brought in #5956 "filter and sort projects in the dashboard sidebar", which touches the same files. One compile fix was needed (its new `testProjectFixtures.ts` constructs `DashboardSidebarWorkspace` and needed `isPinned: false`). Two deliberate semantic interactions to know about: the sidebar's project **filter** does not filter the Pinned section (pins are quick access and stay visible), and the "last updated" project **sort** ranks projects by the workspaces inside their group — a pinned workspace no longer contributes to its project's activity ranking because it is partitioned out. Both acceptable for v1; revisit if either surprises users.
  Evidence: merge commit `1c4cd970d`, fix commit `48e12bcec`; `sortDashboardSidebarProjects.ts` reads `project.children` only.

## Decision Log

- Decision (D1): Pin workspaces (the v2 sidebar's row entity), not projects or tasks.
  Rationale: Matches what the sidebar lists and what the reference app pins (their "task" is the analogous unit of work).
  Date/Author: 2026-07-25 / Claude (planning session with Avi).

- Decision (D2): Store pin state as `pinnedAt: number | null` (epoch milliseconds) inside `sidebarState` in the existing `v2WorkspaceLocalState` localStorage collection, not in Postgres.
  Rationale: All sibling placement state (`tabOrder`, `sectionId`, `isHidden`) lives there; the collection already has read-time healing for added fields, so old persisted rows need no migration. A timestamp (not a boolean) gives us stable ordering for free — the thing the reference app stored but forgot to use.
  Date/Author: 2026-07-25 / Claude.

- Decision (D3): Idempotent `setWorkspacePinned(workspaceId, pinned: boolean)` instead of a toggle. (Signature later widened to three args by D9.)
  Rationale: the reference app's toggle-only API forced a racy double-toggle `unpin` implementation, duplicated in two files. An idempotent setter cannot land in the wrong state when called twice.
  Date/Author: 2026-07-25 / Claude.

- Decision (D4): Global "Pinned" section at the top of the sidebar, above all project groups; pinned workspaces are partitioned out of (not mirrored in) their project group.
  Rationale: A cross-project section is what makes pinning more useful than the existing per-project manual ordering the sidebar already has. Partitioning (the reference app's model) avoids double rows, double active-highlight, and double-counting in the keyboard-shortcut map. Because unpinning only clears `pinnedAt` and never touches `projectId`/`sectionId`/`tabOrder`, the workspace returns to its exact prior spot. Pinned rows render a small project avatar so cross-project context isn't lost.
  Date/Author: 2026-07-25 / Claude.

- Decision (D5): Pin ordering is `pinnedAt` ascending — new pins append at the bottom of the Pinned section.
  Rationale: Stable and predictable (pins never reorder themselves), matches pinned-tab conventions, and fixes the reference app's self-reordering pinned section.
  Date/Author: 2026-07-25 / Claude.

- Decision (D9): `setWorkspacePinned(workspaceId, projectId, pinned)` — three positional args, not the two the plan drafted.
  Rationale: pinning an auto-included local main workspace (which has no `v2WorkspaceLocalState` row) must create the row first via `ensureSidebarWorkspaceRecord`, and that needs the projectId. Without it, pinning a main workspace — the user's primary checkout — would silently no-op. Positional args match the sibling mutations in the same hook (`moveWorkspaceToSection(workspaceId, projectId, sectionId)`).
  Date/Author: 2026-07-25 / Claude (implementation).

- D6 (placeholder): drag reordering of pins — pending answer to Open Question 1.
- D7 (placeholder): shortcut-map treatment of pins — pending answer to Open Question 2.
- D8 (placeholder): hover pin button on rows — pending answer to Open Question 3.

## Outcomes & Retrospective

Shipped as planned, in one pass, with one small API deviation (D9: `setWorkspacePinned` gained a `projectId` arg so pinning an auto-included main workspace can create its local-state row). The localStorage-collection storage choice did what it promised: zero migrations, zero server surface, and live-query reactivity meant no optimistic-update machinery at all. The pre-implementation renames (`isLocalMainWorkspace`, `normalizeMainFirst`) kept the overloaded "pinned" vocabulary from colliding. Mid-flight, `main` landed project filter/sort (#5956) in the same files; the merge cost one fixture fix and surfaced two accepted interactions (pins ignore the project filter; pinned rows don't count toward a project's activity sort). Header styling converged on the sidebar's 10px uppercase micro-label convention, text-only, with extra padding below the section. Open questions D6-D8 (pin drag-reorder, shortcut-map entries, hover pin button) remain deliberate v1 exclusions. Remaining validation: the manual CDP walkthrough.

## Context and Orientation

Affected app: `apps/desktop` only (the Electron desktop app's renderer process — browser environment, no Node imports). No packages change; no IPC (inter-process communication between Electron's main and renderer processes) is added, because pin state never leaves the renderer.

How the v2 sidebar works today, from storage to pixels:

The renderer keeps per-organization client-side collections in TanStack DB (an in-memory reactive database whose collections components query with `useLiveQuery`). They are created in `apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/collections.ts`. Some collections sync from Postgres via Electric; the three that describe *sidebar placement* are plain localStorage-backed collections, created around lines 747–803:

- `v2SidebarProjects` — which projects show in the sidebar and their order (`tabOrder`) and collapse state.
- `v2WorkspaceLocalState` — one row per workspace, keyed by `workspaceId`. Its `sidebarState` object holds `projectId`, `tabOrder`, `sectionId`, `isHidden`, plus per-workspace view prefs. This is where pinning will live.
- `v2SidebarSections` — user-created named groupings inside a project.

The Zod schemas for these rows live in `apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema.ts`. `workspaceLocalStateSchema` (line ~122) defines `sidebarState`; `SIDEBAR_STATE_DEFAULTS` (line ~164) plus `healWorkspaceLocalState` (line ~363) fill in defaults when a stored row predates a field — this is why adding a field needs no migration. Ordering helpers `getPrependTabOrder`/`getNextTabOrder` live in `dashboardSidebarLocal/tabOrder.ts` ("lower tabOrder = earlier; queries sort ASC").

Mutations to these collections are plain synchronous `collection.update(key, (draft) => { ... })` calls, centralized in `apps/desktop/src/renderer/routes/_authenticated/hooks/useDashboardSidebarState/useDashboardSidebarState.ts` (e.g. `writeProjectTopLevelOrder` at line ~88 rewrites `sidebarState` fields) with lower-level helpers in the sibling `sidebarMutations.ts` (e.g. `tombstoneSidebarWorkspaceRecord`, used when a workspace is deleted).

Rendering: `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/DashboardSidebar.tsx` composes the sidebar. Its data comes from `hooks/useDashboardSidebarData/useDashboardSidebarData.ts`, which live-queries the three collections, joins them with host-provided workspace/project identity (`useHostWorkspaces`, `useHostProjects`), decorates rows with PR status, and calls `buildDashboardSidebarProjects` (same folder) to produce `DashboardSidebarProject[]` — each with `children` that are either bare workspaces or sections of workspaces (types in `DashboardSidebar/types.ts`). `DashboardSidebar.tsx` renders those groups inside a dnd-kit `DndContext`/`SortableContext` (project reordering), with `DashboardSidebarProjectSection` → `DashboardSidebarWorkspaceItem` (one row; has expanded and collapsed variants) → `DashboardSidebarWorkspaceContextMenu` (right-click menu). Within-project workspace/section drag lives in `hooks/useSidebarDnd/useSidebarDnd.ts`.

Terminology guard: throughout the existing sidebar code, "pinned" currently means "local main workspace forced to the top of its project group" (see Surprises & Discoveries). This plan renames that to `isMainWorkspace` and reserves "pinned" for the new user-controlled feature.

## Plan of Work

### Milestone 1 — Schema field, mutation API, lifecycle cleanup

In `dashboardSidebarLocal/schema.ts`, add `pinnedAt: z.number().int().nullable().default(null)` to the `sidebarState` object of `workspaceLocalStateSchema`, and `pinnedAt: null` to `SIDEBAR_STATE_DEFAULTS` so `healWorkspaceLocalState` backfills old rows. Extend `dashboardSidebarLocal/schema.test.ts` with a case proving a stored row without `pinnedAt` heals to `null`.

In `useDashboardSidebarState.ts`, add and export from the hook:

    setWorkspacePinned(workspaceId: string, projectId: string, pinned: boolean): void

Implementation: if the `v2WorkspaceLocalState` row is missing, no-op. Otherwise `collections.v2WorkspaceLocalState.update(workspaceId, (draft) => { ... })`: when pinning, set `sidebarState.pinnedAt = Date.now()` only if currently null (idempotent — repinning must not move the row to the bottom of the pinned list) and set `sidebarState.isHidden = false` (a pin is an explicit "show me this"); when unpinning, set `pinnedAt = null` and touch nothing else, so the row rejoins its project at its old `sectionId`/`tabOrder`.

Lifecycle cleanup (the reference app's unpin-on-archive, applied to our equivalents): in `sidebarMutations.ts`, make `tombstoneSidebarWorkspaceRecord` clear `pinnedAt` in both its insert and update branches. That is the only place in the codebase that sets `isHidden = true` (verified 2026-07-25 — every hide/remove path funnels through it; the hard-delete path removes the row entirely, so it needs nothing). Invariant after this milestone: a row can never be simultaneously hidden and pinned.

Rename the collision: in `DashboardSidebarWorkspaceContextMenu.tsx` and its call sites in `DashboardSidebarWorkspaceItem.tsx`, rename prop `isPinned` → `isMainWorkspace`; in `useSidebarDnd.ts` rename `normalizePinnedFirst` → `normalizeMainFirst` and update its comment. Pure rename, no behavior change.

### Milestone 2 — Data layer: partition pinned workspaces

In `useDashboardSidebarData.ts`, add `pinnedAt` to the fields selected in the `v2WorkspaceLocalState` live query (line ~219) and carry it through `rawSidebarWorkspaces`. After `visibleSidebarWorkspaces` is computed, partition: rows with `pinnedAt != null` become `pinnedWorkspaces` (sorted by `pinnedAt` ascending, decorated with the same PR/host status the project path gets, plus the owning project's `name`/`iconUrl` looked up from `sidebarProjects` for the row's avatar); the remainder feeds `buildDashboardSidebarProjects` unchanged, which is what removes pinned rows from their project group. Return `pinnedWorkspaces` alongside `groups`. Note: pinned workspaces must still be included in `pullRequestQueryTargets` derivation (they are — derive targets from the pre-partition `visibleSidebarWorkspaces`).

Add `pinnedWorkspaces: DashboardSidebarPinnedWorkspace[]` to `DashboardSidebar/types.ts`, where `DashboardSidebarPinnedWorkspace` is `DashboardSidebarWorkspace` plus `projectName: string` and `projectIconUrl: string | null`.

Keep the partition logic as a small pure exported function (per the shared-helpers preference) with a unit test: given rows with mixed `pinnedAt`, it returns pinned-sorted-ascending and the untouched remainder.

### Milestone 3 — UI

New component folder `DashboardSidebar/components/DashboardSidebarPinnedSection/` (standard `ComponentName/ComponentName.tsx` + `index.ts` layout per AGENTS.md). It renders nothing when `pinnedWorkspaces` is empty; otherwise a section header ("Pinned", styled like `DashboardSidebarSectionHeader`'s label treatment) followed by one `DashboardSidebarWorkspaceItem` per pinned workspace. Mount it in `DashboardSidebar.tsx` inside the `OverflowFadeContainer`, above the projects `DndContext` (line ~201), in both collapsed and expanded sidebar modes. In collapsed mode the rail renders no section chrome anywhere (`DashboardSidebarCollapsedProjectContent.tsx` shows workspace icons only), so the collapsed Pinned section is just a stack of `DashboardSidebarCollapsedWorkspaceButton` icons at the top of the rail, separated from the project thumbnails below by a thin divider — no header.

`DashboardSidebarWorkspaceItem` gains an optional `pinnedContext?: { projectName: string; projectIconUrl: string | null }` prop: when present, the row shows a small project avatar before the workspace name and suppresses the within-project drag-handle wiring (pinned rows are not sortable in v1).

Context menu: add to `DashboardSidebarWorkspaceContextMenu` a first-position item — "Pin" (`LuPin` icon) when `pinnedAt == null`, "Unpin" (`LuPinOff`) otherwise — invoking `setWorkspacePinned`. Thread the workspace's pinned state and the callback through `DashboardSidebarWorkspaceItem` the same way `onToggleUnread` already is (via `useDashboardSidebarWorkspaceItemActions`).

Active-workspace handling: `DashboardSidebar.tsx`'s `activeV2Project` lookup (line ~150) scans `groups` to find the active workspace's project for the setup-script card; extend the scan to also cover `pinnedWorkspaces` so pinning the active workspace doesn't lose that affordance.

## Concrete Steps

All commands from the repo root.

    bun run typecheck        # after each milestone; expected: exit 0
    bun run lint:fix         # before any push (CI fails on warnings)
    bun run lint             # must exit 0 — CI treats warnings as errors
    bun test apps/desktop    # expected: all pass, including new schema/partition tests

Manual walkthrough after Milestone 3: `bun dev`, in the desktop app right-click a workspace → "Pin" → row moves to new top "Pinned" section with project avatar; pin a second workspace → it appends below the first; restart the app → pins persist; right-click → "Unpin" → row returns to its original project position; hide a pinned workspace via its menu → it leaves the Pinned section too.

## Validation and Acceptance

Acceptance is the manual walkthrough above, verified over CDP against this worktree's own dev instance per the "CDP UI Verification" rules in the root AGENTS.md and `apps/desktop/AGENTS.md` (match the renderer by this workspace's `DESKTOP_VITE_PORT`; use real UI interactions — actual right-clicks on the row — not DOM property assignment; capture before/after screenshots; include a restart/remount in the lifecycle exercised, since persistence is part of the claim). Localstorage evidence: the org's `v2-workspace-local-state-<orgId>` key shows `sidebarState.pinnedAt` set and cleared as the UI changes.

## Idempotence and Recovery

Every step is additive and re-runnable. `setWorkspacePinned` is idempotent by construction. The schema change is heal-forward: old rows read fine (pinnedAt heals to null), and if the feature is reverted, the stray `pinnedAt` key in localStorage is ignored by the old schema's `.passthrough`-free parse via healing — no data cleanup needed. No Postgres, Electric, or host-service surface changes, so there is nothing to roll back outside the renderer bundle.

## Interfaces and Dependencies

No new dependencies — dnd-kit, TanStack DB, zod, and react-icons (`LuPin`/`LuPinOff` from `react-icons/lu`) are already in use in this exact component tree. Signatures that must exist at the end:

    // useDashboardSidebarState.ts
    setWorkspacePinned: (workspaceId: string, projectId: string, pinned: boolean) => void

    // useDashboardSidebarData.ts return value gains
    pinnedWorkspaces: DashboardSidebarPinnedWorkspace[]

    // DashboardSidebar/types.ts
    export type DashboardSidebarPinnedWorkspace = DashboardSidebarWorkspace & {
      projectName: string;
      projectIconUrl: string | null;
    };

---

Revision note (2026-07-25 19:55Z): After the initial draft, two independent repo explorations (one of the reference app, one of Superset) were completed and cross-checked against the plan. No design changes resulted. Edits: Milestone 1's lifecycle cleanup narrowed from "audit every isHidden write site" to the single `tombstoneSidebarWorkspaceRecord` edit (verified sole `isHidden = true` writer); Milestone 3's collapsed-mode description corrected to an icon-only stack (the collapsed rail renders no section chrome anywhere); added Open Question 3 / D8 (hover pin button — the reference app has one, v1 here is context-menu-only) and an analytics note (the reference app emits pin/unpin events). Reason: keep the plan's instructions matched to verified code reality before the approval gate.
