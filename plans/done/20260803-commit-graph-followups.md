# Commit Graph — Pending Work

Follow-up to `plans/` sibling work on the sidebar commit graph. The graph ships and renders live;
this document covers what is left. Every item states the files, the acceptance bar, and why the
decision went the way it did.

Predecessor plan: `plans/20260801-commit-graph-sidebar.md` (phases 0–6). Phases 0–4 are landed;
phase 5 is **superseded** by §2 below; phase 6 is partially landed.

## Current state (verified, do not redo)

| Thing | Where | State |
|---|---|---|
| `listGraph` procedure | `packages/host-service/src/trpc/router/git/git.ts:296` | landed, `local` scope only; other scopes throw `NOT_IMPLEMENTED` |
| `gitGraphLogTask` | `packages/host-service/src/workers/tasks/git.ts` | landed |
| Integration test | `packages/host-service/test/integration/git-graph.integration.test.ts` | landed |
| Large-repo bench | `packages/host-service/scripts/git-graph-large-repo-profile.ts` | ran once, results in §5.1 below; script removed before merge |
| `assignLanes` | `.../useGraphTab/utils/assignLanes/` | landed, **one defect open** (§1.2) |
| Graph tab registration | `WorkspaceSidebar.tsx:28,33` | landed |
| `graphRefScope` persistence | `CollectionsProvider/dashboardSidebarLocal/schema.ts:16-20` | landed, **no UI reads it** beyond the fetch input |
| Lane colours | `apps/desktop/src/shared/themes/graph-lanes.ts` | landed, verified live |
| Row tint + hover | `.../GraphRow/GraphRow.tsx` | landed (`f51b2161b`) |

**Do not edit** (design layer, landed and verified): `shared/themes/graph-lanes.ts`,
`graph-lanes.test.ts`, `.../components/GraphRow/`, `.../components/GraphLanes/`,
`.../components/RefBadge/`, the `--graph-lane-*` blocks in
`apps/desktop/src/renderer/globals.css`, and `stores/theme/utils/css-variables.ts`. A gap in the
visual layer comes back as a question, not a local fix.

Topology was checked end-to-end against `git log --graph --oneline --branches` on a real
repository: 16/16 sampled rows matched on order, lane assignment, and merge/fork elbows.

---

## 1. Confirmed defects — do these first

Both corrupt what everything downstream renders. Cheap.

### 1.1 `--topo-order` is silently discarded

`packages/host-service/src/workers/tasks/git.ts:211-212`:

```
"--topo-order",
"--date-order",
```

The two are mutually exclusive in git; the last one wins. The log therefore comes back in date
order, while `assignLanes` assumes topological input. Delete line 212.

**Acceptance:** the integration test gains a case with a branch whose commits are authored out of
chronological order relative to the trunk; lane assignment stays stable.

### 1.2 Lane colour collision

Two lanes drawn side by side in the same row get the same colour. Measured live: **15 of 42
rendered rows**, e.g. `--graph-lane-7` painted at both `x=7` and `x=21` within one row.

Not a palette problem — eight distinct lane colours exist and resolve correctly in the renderer
(verified via computed styles). The colour assignment in `assignLanes` is the cause.

Fix is a rotating counter that advances when a **new lane opens**, skipping any colour currently
live in another open lane. Not `laneIndex % 8` — lane indices are
reused as lanes close, so two live lanes collide as soon as the graph is wider than the reuse
window.

**Acceptance:** a unit test asserting no two concurrently-open lanes share a colour, over a fixture
with more open lanes than palette entries (forces the wrap-around case). Note the honest ceiling:
with 8 colours and 9+ simultaneous lanes, collision is unavoidable — the test asserts collisions
only appear past `GRAPH_LANE_COUNT`, not never.

### 1.3 Phantom tip edge — verify only

An inbound stroke above the newest commit. Appears already fixed in the working tree (graph tip
renders `["M7,14 V28"]`, no inbound stroke). Confirm with a test rather than re-fixing.

---

## 2. Commit panes — replaces phase 5

Phase 5 as originally written ("reuse `changesFilter` so the main diff surface follows without a
tab switch") is **cancelled**. It was the cheap version and it conflicts with the decision below.

### Decisions taken

1. **A graph click no longer writes `changesFilter`.** The graph owns its own pane. The Changes tab
   keeps showing whatever it was showing. Rationale: with one shared piece of state, clicking
   around the graph silently retargets the Changes tab — two surfaces fighting over one selection.
2. **Scope for this pass:** preview + pin + range + row context menu. Write actions (checkout,
   revert, cherry-pick) stay deferred.

### 2.1 Graph-owned selection state

`GraphRow`'s `selected` / `inRange` props are currently derived from `changesFilter`
(`useGraphTab.tsx:76-86`), and the shift-click anchor is read out of the same field
(`useGraphTab.tsx:95-110`). Stop writing `changesFilter` and the graph stops highlighting itself.

Add a `graphSelection` field to `sidebarState`
(`CollectionsProvider/dashboardSidebarLocal/schema.ts:132`), same discriminated shape as
`changesFilterSchema` minus the `all` case:

```ts
{ kind: "commit"; hash: string } | { kind: "range"; fromHash: string; toHash: string } | undefined
```

Selection highlight and the shift-click anchor both read from it. Persisted per workspace, so a
selection survives a tab switch and an app restart.

This is the first thing the change hits; it is not optional.

### 2.2 Extend the `diff` pane — do **not** add a `commit` pane type

Earlier discussion floated a new `commit` member on `PaneType`. Extending the existing `diff` kind
is the better call, for two concrete reasons:

- `PaneType` (`apps/desktop/src/shared/tabs-types.ts:11`) is shared between main and renderer and
  is **persisted inside pane layouts**. A new member is a forward-compat liability someone has to
  verify against older builds. Extending an existing kind has no such surface.
- Everything the new kind was going to buy is reachable from the registry context: `getTitle`,
  `getIcon` and `renderPane` all receive the pane, so a ref-carrying diff pane can title itself
  with a short hash and render a metadata header.

Today `diff` is a **follower, not a document**: `usePaneRegistry.tsx:285-301` hardcodes
`getTitle: () => "Changes"`, and `DiffPane` reads `useSidebarDiffRef()` off persisted sidebar state
rather than off its own pane data. Two diff panes are two views of the same filter.

Changes:

- Pane data gains `ref?: { kind: "commit"; hash } | { kind: "range"; fromHash; toHash }` and
  `isPinned?: boolean`.
- `DiffPane` takes an optional ref prop, falling back to `useSidebarDiffRef()` when absent. The
  Changes tab passes nothing and behaves **identically** — that fallback is what keeps the follower
  semantics intact.
- `getTitle`: short hash for a commit ref, `abc1234..def5678` for a range, `"Changes"` when the ref
  is absent. `getIcon`: `GitCommitHorizontal` when a ref is present, existing `GitCompareArrows`
  otherwise.

**The discriminator that makes this safe:** `ref === undefined` marks the follower pane. Preview
reuse (§2.3) must only ever reuse panes that already carry a ref, or a commit click would recycle
the Changes tab's own pane — exactly what decision 1 forbids.

### 2.3 Preview / pin / open semantics

The convention already exists for files: `isPinned` on `FileViewerState`
(`stores/tabs/types.ts:94`), preview reuse at `stores/tabs/store.ts:~820-845`, `pinPane` at
`store.ts:1388`. Commit clicks obey the identical rule — no new concept for the user to learn.

| Input | Behaviour |
|---|---|
| single click | reuse the unpinned, ref-carrying diff pane in the active tab; replace its ref. Create one if none. |
| double click | pin the pane already opened by the first click |
| shift-click | range from the anchor; same pane, title `abc1234..def5678` |
| cmd/ctrl-click | new pane regardless of reuse |

`pinPane` currently early-returns unless `pane.fileViewer` exists (`store.ts:1390`); generalise it
to the diff pane's `isPinned` as well.

**Do not debounce single-click waiting for a double.** Single click opens the preview immediately;
double-click flips `isPinned` on the pane the first click already opened. A 250ms wait puts dead
feel on every click in the graph.

**Acceptance:** clicking fifteen rows in a row leaves one pane, not fifteen. Pinning one and
clicking again leaves two.

### 2.4 Commit metadata header

Rendered inside `DiffPane` when a commit ref is present: full message body, author, date, parents,
ref badges (reuse the landed `RefBadge`). This absorbs the original plan's `CommitDetailPanel` /
`CommitDetailStrip` — as a pane header it gets real width, instead of being crammed into a 280px
sidebar strip. That item is now closed by this one.

**Contract gap:** `listGraph` returns `message` from `%s` — subject only. The header wants the
body. Two options:

- add `%b` to the log format → body for all 500 rows, most never opened, payload inflates
- fetch on open → one extra spawn, lazy

**Take the second.** Piggyback the existing `getCommitFiles` call the pane already makes on mount.
Costs nothing until someone opens a commit.

Opening a file from the commit pane is already supported: `createFileViewerPane` accepts
`commitHash` (`stores/tabs/utils.ts:198`). No new work there.

### 2.5 Row context menu

Read-only: **Copy Hash**, **Copy Short Hash**, **Copy Subject**, **Open in New Tab**.

Note `contextMenuActions` in the pane registry is the *pane header* menu — a different surface. The
row menu needs whatever the file tree rows use.

---

## 3. Robustness

### 3.1 `dedupeKey` on `gitGraphLogTask`

Roughly nine git spawns per `listGraph` call, all in the worker. A `git:changed` storm during a
rebase fans that out badly. Coalesce by `dedupeKey` the way `gitCommitFilesTask` already does.
Carried over from the original plan's risk 3, still unassigned.

**Acceptance:** the bench script (`scripts/git-graph-large-repo-profile.ts`) shows a flat spawn
count under a burst of overlapping invalidations.

---

## 4. Header controls

The graph header currently holds only a truncation banner
(`GraphTabContent.tsx:118-125`). Three chips are queued for that slot. All are optional relative to
§1–§3; land them in this order.

### 4.1 Ref-scope toggle

The persistence already exists (`graphRefScope`, `schema.ts:16-20`, read at
`useGraphTab.tsx:45-49`, passed at `:62`) and the enum already ships on the procedure. Only `local`
is implemented; `open-workspaces` / `all` / `head` throw `NOT_IMPLEMENTED`
(`git.ts:311-316`). So the toggle needs at least one more scope implemented before it has anything
to switch to.

**Name the axis correctly in the UI.** This is not local-vs-remote: remote refs are already excluded
as *tips* while still *decorating* commits inside the window. What the scope changes is **which
tips seed the log**. Labelling it "Local / Remote" will mislead — the remote branches are visible
either way.

### 4.2 Two-line ref rows

Toggle that moves ref badges onto their own untrimmed line with the commit subject below it, left
aligned; hash and relative time stay on the subject's line.

This is the strongest of the three — it fixes real badge truncation at sidebar widths, visible today
(`fix/tm–…`, `origin/…`).

The obvious objection — "variable row height breaks `estimateSize`" — does not hold.
`@tanstack/react-virtual` takes an index-based `estimateSize(i)`, and whether a row carries refs is
known before render, so `estimateSize(i) => rows[i].commit.refs.length ? 44 : 28` needs no
measurement pass. Roughly 15% of rows carry badges, so the added scroll height is small.

### 4.3 "Unreferenced only" chip

Branches and worktrees with no open Superset workspace. Carried over from the original plan's queued
follow-up; same header slot as 4.1/4.2.

---

## 5. Verification debt

Things believed correct but never actually checked. Each is a place a regression can hide today.

### 5.1 Phase 6 perf pass never ran

`packages/host-service/scripts/git-graph-large-repo-profile.ts` is landed but has not been run.
Original acceptance bar, unchanged: initial paint < 300ms warm, no dropped frames scrolling 500
rows, host-service event loop unblocked during a graph fetch. Run it after §3, since `dedupeKey`
changes the spawn profile the bench measures.

### 5.2 Missing component tests

Tests exist for `assignLanes`, `GraphRow` and `GraphTabContent`. There are none for `GraphLanes`
(the SVG painter — elbow geometry, lane cap, merge/fork edge kinds) or `RefBadge` (the five ref
states × compact). Both are pure props-in/markup-out, so they are cheap to cover and they are
exactly where a silent visual regression would land.

### 5.3 Light theme is entirely unverified

Every live check so far ran on one dark theme. Two specific consequences:

- Lane slots 7 and 8 are `color-mix(… 62%, black)` in light and `… 62%, white)` in dark
  (`shared/themes/graph-lanes.ts`). The darkening path has never been rendered.
- The row tint alphas (9% normal, 16% in-range) were tuned against a **dark** ground measured at
  L\* 8.04, with `--accent` contributing ≈ 8.6 ΔL\* as the ceiling. On a light ground both the
  ground lightness and the accent delta are different, so the same alphas may read as too strong,
  too weak, or may collide with the selected-row band.

Check both themes at 260px, 400px and full width before calling the visual layer done. If the light
tint needs different alphas, that is a `GraphRow` change and comes back rather than being patched
locally.

### 5.4 Topology check was narrow

The 16/16 match was one repository, one sidebar width, dark theme. Unexercised on real data: the
compact breakpoint (< 260px), the 8-lane cap and its `+N` overflow chip, and a repository with more
concurrent lanes than the palette has entries — which is also the fixture §1.2 needs.

### 5.5 A cosmetic gap closes for free

The original plan accepted that a graph-selected commit outside `base..HEAD` shows a sliced hash in
`CommitFilterDropdown`, because the graph wrote into the same `changesFilter` the dropdown labels.
§2.1 stops that write, so the dropdown never sees a hash it cannot label. No work — just do not
re-introduce the coupling.

### 5.6 Verification results

Re-checked against the live app over CDP (renderer matched to this worktree's `DESKTOP_VITE_PORT`,
graph driven to render real history). Split by method so a regression can't hide behind a label:

- **§5.2 — covered.** `GraphLanes` and `RefBadge` now have markup tests; the light-theme lane
  overflow darkening path (`color-mix(… 62%, black)`, never rendered before) is pinned by a unit
  test beside `graph-lanes.test.ts`.
- **§5.3 dark — end-to-end.** Live graph rows: `--graph-lane-7/8` resolve to the `62%, white`
  lightening path, the row tint paints as a `linear-gradient(color-mix(in oklch … 9% …))`, edge
  strokes and node fills resolve. Verified on the running app, not a fixture.
- **§5.3 light — synthetic (CSS-toggled; the store's `Theme → UIColors → getGraphLanes` route is
  still unexercised in light, because `useThemeStore` re-imports `electronTrpcClient` and throws on
  fresh module eval, so the switch was applied via the pure `applyUIColors`/
  `applyGraphLaneColors` helpers + globals.css's `:root.light` ramp).** Perceptual lightness (oklch
  L, ≈ CIELAB L*) on a light ground: ground 98.5, 9% tint 94.2 (Δ 4.3), 16% range 90.8 (Δ 7.7),
  selected row (accent + 9% tint) 92.8 (Δ 5.7). Both bars hold — the 9% tint is visible (Δ ≥ 3) and
  a tinted row never reads as prominent as a selected one (Δ tint < Δ selected). **§5.3 closes with
  no `GraphRow` change.** Caveat noted for a future pass: the 16% range rows read slightly darker
  (Δ 7.7) than the selected endpoints (Δ 5.7) — not a violation of either bar, but the range/selected
  prominence ordering is worth an eyeball check once the store's light path renders for real.
- **§5.4 — partial.** Real history renders with non-degenerate topology (rows carry lane SVGs,
  lanes assign). The narrow cases still unexercised on live data are the compact breakpoint
  (< 260px), the 8-lane cap and its `+N` overflow chip, and a window wider than the palette — the
  same topology-heavy fixture §1.2's test builds synthetically. A topology-heavy repo (or the §1.2
  fixture rendered live) would close it.
- **§5.1 — run.** `scripts/git-graph-large-repo-profile.ts` against a synthetic repo (600 trunk
  commits, 8 merged branches, 2 worktrees, limit 500): median warm fetch **153ms** (< 300ms bar),
  event-loop delay p99 **1.6ms** / max 1.7ms — and that is with the bench running **inline** (no
  worker bundle in the harness); production's real worker pool isolates further, so these are a
  lower bound on unblocking. **9 git spawns per call** (matches the plan's estimate), max 3 active
  concurrently (the `for-each-ref` / `worktree list` / `rev-parse HEAD` fan-out). Caveat: the bench
  drives sequential iterations, so §3.1's *burst* coalescing (flat spawn count under overlapping
  invalidations) is not directly measured here — the dedupeKey path is covered by the worker-pool's
  own tests; a concurrent-burst variant of the bench would close that last gap.

## Dropped

**Header search bar.** Dropped by decision. For the record, the two traps that killed it: searching
500 rows out of 2891 loaded silently lies about the result set, and filtering commits destroys the
lanes because parents vanish from the window (git's own `--graph --grep` degrades to simplified
history for this reason). If it ever comes back, the shape that works is a server-side
`git log --grep` returning hashes for **find-and-jump**, not filter.

## Deferred

- Combine local + remote ref badges for the same branch into one pill — offered, not taken.
- Write actions from the graph: checkout, cherry-pick, revert, tag, `git worktree prune`.
- `open-workspaces` / `all` / `head` scopes beyond whatever 4.1 needs.
- Graph on the `local` workspace; mobile (iOS-only, out of scope).

## Risks

1. **§2.1 and §2.2 must land together.** Removing the `changesFilter` write without `graphSelection`
   in place leaves the graph unable to highlight its own selection.
2. **Preview reuse must filter on `ref !== undefined`** (§2.2). Getting this wrong makes a graph
   click hijack the Changes tab — the precise failure decision 1 exists to prevent.
3. The files under §"do not edit" ship as a set with the theme plumbing; a change to lane colours
   or row chrome needs the palette derivation in `graph-lanes.ts` re-checked, including the Monokai
   case where the bright and standard ANSI ranks are identical.
4. Every phase ends green on `bun run lint && bun run typecheck && bun test`, separate commit,
   conventional-commit PR title. CI fails on Biome **warnings**, not just errors.
5. **This branch stays on the fork.** `origin` is the only configured remote and `feat/git-graph-sidebar`
   has no upstream tracking branch. Keep it that way — do not add an upstream remote or push this
   branch anywhere but `origin`.
6. The six files this feature edits ship daily on the upstream project. Rebase weekly; the tab
   registration in `WorkspaceSidebar.tsx` and the persisted schema are the likeliest conflicts.
