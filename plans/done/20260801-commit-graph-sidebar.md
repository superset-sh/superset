# Visual Commit Graph in the Workspace Sidebar

## Context

Superset's v2 workspace sidebar has three tabs (Files / Changes / Review). Commit history exists only
as a flat `base..HEAD` dropdown (`CommitFilterDropdown`) — no topology, no ref decorations, no view of
the branches and worktrees agents create outside the currently-open workspaces. Upstream asks for this
in #4935 and #5594 (#3849 folded in); no PR has ever attempted graph rendering.

The deliverable is a fourth `Graph` tab rendering a lane-based commit graph. The **primary value is ref
classification, not lanes**: surfacing branches and worktrees that exist in git but have no open
Superset workspace (`detached-worktree`, `orphan-branch`, `prunable`, `merged`). Lanes are the frame;
the state badges are the feature.

Read-only in phase 1. Commit selection reuses the existing diff surface via `changesFilter` — no new
diff pipeline.

Repo rule: on implementation, copy this doc to `plans/` (cross-cutting) per `AGENTS.md`, never
`*_PLAN.md` at an app root.

## Verified against HEAD `2d1a792ac`

| Fact | Location |
|---|---|
| Tab registry, `SidebarTabId` union, `VALID_TAB_IDS`, `isSidebarTabId` | `WorkspaceSidebar.tsx:23-29,148` |
| `compact` breakpoint (280/260 hysteresis) | `WorkspaceSidebar.tsx:86-99` |
| Persisted `activeTab` enum | `dashboardSidebarLocal/schema.ts:131`, defaults `:172` |
| Per-project persisted row (keyed by projectId) | `dashboardSidebarProjectSchema` `schema.ts:10`, collection `collections.ts:777` |
| `changesFilter` → `DiffRef` → diff surface | `schema.ts:~90`, `useSidebarDiffRef.ts` |
| `listCommits` is `base..HEAD`, flat, no parents/refs; consumed by desktop + mobile | `git/git.ts:197` |
| Worker task pattern + registration array | `workers/tasks/git.ts:22-81` |
| `resolveBaseComparison` | `git/utils/git-helpers.ts:157` |
| `ResolvedRef`, `asLocalRef`, `asRemoteRef`, `resolveUpstream` | `runtime/git/refs.ts` |
| Guardrails: no `origin/` string prefixes, no raw `simpleGit()` | `scripts/check-git-ref-strings.sh`, `scripts/check-simple-git-usage.sh` |
| Integration harness `createBasicScenario` | `test/helpers/scenarios`, used by `git-history.integration.test.ts` |
| Worker purity: no `../db`, `../events`, `../daemon`, no native addons | `test/integration/no-native-worker-imports.test.ts` |

**Three corrections to earlier assumptions:**

1. Worktree parsing precedent is **not** `readWorkspaceRefs` (that reads one workspace's
   branch/head/upstream). It is `parseWorktreeList` / `listGitWorktrees` / `normalizeWorktreePath` in
   `trpc/router/workspace-creation/shared/worktree-list.ts` — declared single source of truth for
   `git worktree list --porcelain`. Reuse it; do not re-parse inline.
2. `git:changed` invalidation for v2 lives in `renderer/hooks/host-service/useGitStatus/useGitStatus.ts:83`,
   not `useChangesTab.tsx` (which invalidates only on manual refresh / base-branch change).
3. No healing migration is needed for the new tab id. `WorkspaceSidebar.tsx:72` already guards
   `activeTab` through `isSidebarTabId` and falls back to `"changes"`; `healWorkspaceLocalState`
   spreads unknown values through untouched. Adding `"graph"` to the zod enum + the union suffices.

Also worth stating: no 500-commit cap exists in host-service today (the #5890 precedent is not in this
tree). The cap below is new.

## Contract — `git.listGraph`

```ts
// input
{
  workspaceId: z.string(),
  baseBranch: z.string().optional(),                                  // same shape as listCommits
  refScope: z.enum(["local", "open-workspaces", "all", "head"]).default("local"),
  limit: z.number().int().min(1).max(2000).default(500),
  cursor: z.string().optional(),
}
```

Phase 1 implements `local` only. `open-workspaces` / `all` / `head` throw
`TRPCError({ code: "NOT_IMPLEMENTED" })` — the enum ships now so the contract does not reopen.

**`local` tip set** (deduped before `git log`), seeded from git's own refs, never from workspace records:

- `HEAD`
- resolved base ref (`resolveBaseComparison(git, baseBranch)` → `baseRef`; do not re-derive)
- upstream tracking refs of HEAD and of base (`resolveUpstream`)
- every local branch (`for-each-ref refs/heads/`)
- every worktree head (`git worktree list --porcelain`), including worktrees with no Superset workspace

Excluded as tips: all other remote refs, and tags. Tags still decorate commits inside the window.
In git terms: `--branches` plus explicit tips, not `--all`.

```ts
// output
{
  commits: Array<{
    hash: string; shortHash: string; message: string;
    author: string; authorEmail: string; date: string;
    parents: string[];
    refs: Array<{
      name: string;
      type: "head" | "branch" | "remote" | "tag";
      state: "open" | "detached-worktree" | "orphan-branch" | "prunable" | "merged" | null;
      worktreePath?: string;
      worktreeWorkspaceId?: string;   // absent when the worktree has no open workspace
      pruneReason?: string;           // from worktree list --porcelain
    }>;
  }>;
  nextCursor: string | null;
  totalCommits: number | null;        // true count for the truncation banner
}
```

State rules (local-branch refs only; remote/tag/HEAD entries carry `state: null`):

| Condition | `state` |
|---|---|
| worktree registered, path missing from disk | `prunable` (+ `pruneReason`) |
| worktree registered, `workspaces` row matches path | `open` (+ `worktreeWorkspaceId`, `worktreePath`) |
| worktree registered, no `workspaces` row | `detached-worktree` (+ `worktreePath`) |
| no worktree, contained in base | `merged` |
| no worktree, not contained | `orphan-branch` |

A detached (branch-less) worktree emits a ref entry named after its directory basename with
`type: "head"` and the same `detached-worktree` / `prunable` state.

**Containment comes from `git branch --merged <baseRef> --format=%(refname)`, not from graph
topology** — a branch merged 800 commits back sits outside the window and would misclassify as
`orphan-branch`.

`cursor` is opaque (`skip:<n>`), applied as `--skip`. Fetch `limit + 1` to detect more; `nextCursor`
null when exhausted. Documented as best-effort: pages re-anchor when refs move between fetches.

Persistence: `refScope` goes on `dashboardSidebarProjectSchema` (per project, keyed by projectId),
**not** per workspace and not global.

## Architecture

### (a) Host-service — data

New pure util `packages/host-service/src/trpc/router/git/utils/graph-log.ts`:
`buildTipSet`, `parseGraphLog`, `classifyRefs` — no tRPC, no DB, unit-testable.

New worker task in `workers/tasks/git.ts` (register in the exported `gitTasks` array):

```ts
gitGraphLogTask: defineWorkerTask<
  { worktreePath: string; baseBranch?: string; refScope: "local"; limit: number; skip: number; gitEnv: GitTaskEnv },
  { commits: RawGraphCommit[]; refs: GraphRefRecord[]; worktrees: WorktreeRecord[]; mergedBranches: string[]; totalCommits: number | null }
>
```

Every git spawn happens in the worker (base resolution included — `resolveBaseComparison` is already in
the worker's import graph via `getGitStatusSnapshot`), so both stdout draining and parsing stay off the
host event loop. Spawns per call: `for-each-ref` (heads+remotes+tags, one call), `worktree list
--porcelain`, `branch --merged`, `log`, `rev-list --count`, plus base resolution.

Log format — subject last so embedded tabs can't shift fields:

```sh
git log --topo-order --date-order --max-count=<limit+1> --skip=<n> <tips...> \
  --format=%H%x09%h%x09%P%x09%an%x09%ae%x09%aI%x09%s
```

**Do not use `%D` for decorations.** Build the sha→refs map from
`for-each-ref refs/heads/ refs/remotes/ refs/tags/ --format=%(objectname)\t%(refname)\t%(upstream)`
and classify from the **full refname** into `ResolvedRef` (`runtime/git/refs.ts`). Never infer kind from
a shortname prefix — `check-git-ref-strings.sh` fails CI on it, and a local branch may legitimately be
named `origin/foo`.

New procedure `listGraph` in `trpc/router/git/git.ts` (leave `listCommits` untouched — desktop and
`apps/mobile/.../useWorkspaceCommits` consume its output type). Coordinator responsibilities only:
`resolveWorktreePath`, `resolveGitTaskEnv`, run the worker, then join worktree paths against
`ctx.db.query.workspaces` (compare through `normalizeWorktreePath` on both sides — git canonicalizes,
DB rows may hold symlinked paths) and stamp `state` / `worktreeWorkspaceId`. Workers cannot import
`../db`; the join must live here.

Output types go in `trpc/router/git/types.ts` beside `Commit`.

### (b) Lane assignment — pure, renderer-side

`.../WorkspaceSidebar/hooks/useGraphTab/utils/assignLanes/{assignLanes.ts,assignLanes.test.ts,index.ts}`

`RawGraphCommit[] → GraphRow[]` where `GraphRow = { commit, lane, edges: Array<{fromLane, toLane, kind}>, laneCount }`.
As built, `kind` is `"pass" | "in-straight" | "in-merge" | "out-straight" | "out-fork" | "out-stub"` —
each row paints its own half-edges, so incoming and outgoing are separate kinds.

Active-lane sweep over topo-ordered input: lanes keyed by expected-next-hash; a commit takes the
leftmost lane awaiting it or opens a new one; first parent inherits the lane; extra parents open/close
lanes and emit merge edges. Lane color = stable hash of the lane's originating branch name (fallback:
lane index) so colors don't reshuffle on refetch. No React, no tRPC types in this file.

Tests: linear; simple merge; octopus (3+ parents); criss-cross; orphan/root; lane freed then reused;
parent outside the window (renders a stub edge, must not throw); determinism when commits are appended.

### (c) Renderer — the tab

```text
.../WorkspaceSidebar/hooks/useGraphTab/
  useGraphTab.tsx          # returns SidebarTabDefinition, mirrors useChangesTab
  types.ts  index.ts
  components/
    GraphTabContent/       # virtualizer + loading/empty/error + truncation banner
    GraphRow/              # lanes + refs + subject + author + date
    GraphLanes/            # per-row inline SVG painter
    RefBadge/              # branch / tag / HEAD / worktree pill, state-colored
    CommitDetailPanel/     # author, date, full message, changed files (getCommitFiles)
```

- Fixed row height (~28px) for a cheap `estimateSize`; no per-row measurement.
  `@tanstack/react-virtual` 3.14.3 is already a desktop dep — pattern to copy:
  `renderer/screens/main/.../CommitListVirtualized/CommitListVirtualized.tsx` (v1, from merged #2763).
- Per-row inline SVG of width `laneCount * laneWidth`, not one tall absolutely-positioned canvas —
  keeps virtualization trivial.
- Cap the lane column at ~8 visible lanes with an overflow indicator.
- `compact` (sidebar < 280px): lanes + short hash + subject only; drop author/date.
- Theme tokens only, no hardcoded hex; lane colors must survive a light/dark switch.
- **Cache-first rendering** (`AGENTS.md` rule 11): render existing rows whenever `data` is present;
  `isReady`/`isLoading` only decide the no-data case.

Invalidation: subscribe in `useGraphTab` via
`renderer/hooks/host-service/useWorkspaceEvent` → `useWorkspaceEvent("git:changed", workspaceId, cb)`.
Invalidate `git.listGraph` **only when `payload.paths` is absent** (present = worktree-only edit, which
cannot move refs). No polling — `GitWatcher` is already debounced host-side.

Selection: row click → `collections.v2WorkspaceLocalState.update(workspaceId, draft => { draft.sidebarState.changesFilter = { kind: "commit", hash } })`;
shift-click a second row → `{ kind: "range", fromHash, toHash }`. `useSidebarDiffRef` reads the
persisted filter independently of the active tab, so the main diff surface follows without a tab
switch. Known cosmetic gap: `CommitFilterDropdown`'s label lookup only knows `base..HEAD` commits, so a
graph-selected commit outside that range shows a sliced hash — acceptable in phase 1.

## Files touched

**New:** `git/utils/graph-log.ts` (+ test), `hooks/useGraphTab/**`, `utils/assignLanes/**`,
`test/integration/git-graph.integration.test.ts`.

**Edited (6, keep the diff surface minimal — these ship daily upstream; rebase weekly):**
`apps/desktop/src/renderer/globals.css` (additive `--graph-lane-1..8`, light + dark) ·
`workers/tasks/git.ts` (task + `gitTasks` registration) · `trpc/router/git/git.ts` (`listGraph`) ·
`trpc/router/git/types.ts` (output types) · `WorkspaceSidebar.tsx` (union + `VALID_TAB_IDS` + `graphTab`) ·
`dashboardSidebarLocal/schema.ts` (`activeTab` enum + `graphRefScope` on the project schema).

## Build order

The visual layer ships **first**, as real code, so the data layer never has to guess at geometry or
colour and Phase 4 is not a blocker.

**Visual layer:**

- `hooks/useGraphTab/components/GraphLanes/`, `GraphRow/`, `RefBadge/` — presentational only, pure
  props-in / SVG-and-markup-out, no tRPC, no collections, no data fetching.
- `apps/desktop/plans/git-graph-visual-spec.md` — lane geometry (lane width, node radius, curve radii,
  stroke weights), lane color ramp bound to existing theme tokens, `state` → badge treatment table,
  truncation banner, empty / loading, compact rules, light + dark.
- A self-contained HTML mock for review before the components land.
- Storybook-less visual check: render the components against a hand-written `GraphRow[]` fixture
  (linear, merge, octopus, all five ref states) so they can be eyeballed without the data layer.

**Data layer:** phases 1, 2, 3, 5, 6 — worker task, `listGraph`, `assignLanes`, tab registration,
virtualizer, selection/diff wiring. Imports the three components as-is. No colour or spacing invented
locally; a spec gap gets resolved in the spec rather than improvised at the call site.

**Direction inputs for the spec:**

- Rounded elbows over angular ones; a rotating lane palette rather than a per-branch hash; merge rows
  dimmed by default; local and remote labels for the same branch combined into one badge to cut badge
  density at 280px.
- Perf target: 100k+ commits with no scroll lag. The failure mode to avoid is picking one arbitrary
  branch to straighten in complex trees — a worktree-centric graph cannot do that.
- The narrow-width fix is **merging lanes that share a parent** to cut horizontal size, rather than
  scrolling sideways. Adopt for the >8-lane collapse.
- Collapsing linear runs into a single edge, showing only roots, heads and merge/fork points, is a
  candidate for compact mode below 260px — noted, not committed.

**Taken for the row treatment:**

- **Per-row background tint in the lane's colour** (~6% alpha, full row width). Lane membership stays
  readable without tracing lines — the highest-value trick available, and it degrades gracefully when
  lanes compress at narrow widths.
- **Rounded elbows**, vertical lanes, filled node with a coloured ring.
- **Muted, single-line, ellipsised subjects**; relative date right-aligned.
- **Selected row = full-width lighter band**, not an outline.
- Explicitly *not* taken: badges in a left gutter joined to the node by a leader line (needs a ~700px
  graph column), avatar-on-node (needs an avatar cache and network — deferred), and a ~24px lane pitch
  (too wide for a 280px sidebar).

**Provisional geometry** (fixed in the spec, reviewed via the HTML mock before any TSX lands):
row 28px / compact 24px · lane pitch 14px · node r 3.5px · stroke 1.5px · elbow radius 6px ·
lane cap 6 visible (84px of 280px) then merge lanes sharing a parent, then a `+N` overflow chip.

**Palette needs new tokens.** The desktop renderer's `globals.css` ships only `--chart-1..5`, and their hues
are *not* stable across themes (light `--chart-1` is orange, dark is blue) — a lane would change colour
on a theme switch. The spec adds `--graph-lane-1..8` (light + dark, equal chroma/lightness so lanes read
as one family) to that file. That makes a 6th edited file; it is additive and touches nothing existing.
No hardcoded hex anywhere in the components.

**Seam (frozen before the data layer starts):**

```ts
GraphRow      { row: GraphRowModel; refs: GraphRef[]; compact: boolean; selected: boolean; onSelect: (e) => void }
GraphLanes    { lane: number; edges: GraphEdge[]; laneCount: number; compact: boolean }
RefBadge      { name: string; type: GraphRef["type"]; state: GraphRef["state"]; compact: boolean; pruneReason?: string }
```

`GraphRowModel` / `GraphEdge` are the `assignLanes` output types from §(b) — declared in
`hooks/useGraphTab/types.ts` up front so both layers compile against one definition.

## Phases

Each phase ends green on `bun run lint && bun run typecheck && bun test`, separate commit.
Conventional-commit PR titles (`feat(host-service): add listGraph procedure`).

Phase order changes: **Phase 4 (lane rendering) runs first**, against fixtures. Then 1 → 2 → 3 → 5 → 6
uninterrupted.

- **0 — Setup.** Branch `feat/git-graph-sidebar`, `bun install`, `bun run dev:desktop` boots, tests pass. Record the forked-from commit. No code.
- **4 — Lane rendering (first).** `types.ts` seam + `GraphLanes` / `GraphRow` / `RefBadge` + visual spec + HTML mock, verified against fixtures.
- **1 — Data.** `graph-log.ts` + `gitGraphLogTask` + `listGraph`.
- **2 — Lanes.** `assignLanes` + tests. No UI.
- **3 — Tab shell.** Register `graph`, extend both enums, virtualized list wired to the landed components.
- **5 — Selection & diff wiring.** commit / range filters + `CommitDetailPanel`.
- **6 — Perf pass.** Profile on a large repo; add a bench beside `packages/host-service/scripts/git-status-large-repo-profile.ts` if marginal.

## Verification

**Phase 1 acceptance (the gate that matters).** Integration test beside
`test/integration/git-history.integration.test.ts` using `createBasicScenario`. Fixture repo with:
one open workspace, one worktree with **no** `workspaces` row, one orphan local branch, one prunable
worktree (path deleted from disk), plus a merge commit, a tag, and a branch merged into base. Assert
all five ref states are returned correctly, that parents are populated, and that a branch merged
outside the commit window still reports `merged`. Also assert `bun run lint` passes (it runs both
guardrail scripts).

**Phase 2:** unit tests per §(b), including determinism across appended commits.

**Phase 3:** tab survives app restart; an old row with `activeTab: "changes"` loads; a corrupt value
falls back to `"changes"` rather than throwing.

**Phase 4:** components render a hand-written fixture set (linear, merge, octopus, all five ref states)
at 260px, 400px, full width, in light and dark. HTML mock reviewed before the TSX
lands. Topology check against `git log --graph --oneline --branches` happens once phase 3 wires real
data — the components alone can only be checked against fixtures, and the plan says so rather than
claiming end-to-end proof.

**Phase 5:** a commit selected in the graph shows the same diff as the same commit selected in
`CommitFilterDropdown`.

**Phase 6:** initial paint < 300ms warm; no dropped frames scrolling 500 rows; host-service event loop
unblocked during a graph fetch.

CDP checks follow the six-point protocol in `apps/desktop/AGENTS.md` — match the worktree's renderer
port before testing, capture before/after evidence, and state which checks were end-to-end vs synthetic.

## Deferred

Write actions (checkout, cherry-pick, revert, tag) · author/message filtering · graph on the `local`
workspace · mobile (iOS-only, out of scope) · `open-workspaces` / `all` / `head` scopes ·
`git worktree prune` from the graph (state is read-only, surfaced only).

**Queued follow-up:** an "unreferenced only" filter chip in the graph header — branches and worktrees
with no open workspace. That is the day-to-day view worth opening.

## Risks

1. **Sidebar width.** 280px is tight. If phase 3 already feels cramped, prototype a graph *pane*
   (`packages/panes`) before committing to phase 4.
2. **Lane stability.** Pin lane identity to the originating branch / first-parent chain, never array
   position, or every `git:changed` reshuffles the graph.
3. **Spawn count.** ~6 git spawns per `listGraph` call. All in the worker, but if `git:changed` storms
   during a rebase, coalesce by `dedupeKey` like `gitCommitFilesTask` does.
4. **Divergence.** The 5 edited files are actively developed upstream. Rebase weekly.
