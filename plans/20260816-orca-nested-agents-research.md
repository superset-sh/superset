# Orca nested agents/workspaces: reception, architecture, and how Superset could model it

Research date: 2026-08-16. Orca clone refreshed to `stablyai/orca` main @ `71bbab72e` (v1.4.178-rc.2).
Superset refs are against this worktree (post-#6514/#6519).

## TL;DR

- Orca's nested feature is **two separate trees rendered in one sidebar card**: persisted
  workspace lineage (child = full worktree) and derived agent/pane lineage (child = agent
  sharing the parent's checkout). They deliberately never conflate the two.
- Lineage is **metadata only** — it never changes the git base branch, and there is **no
  merge-back**. That's the open differentiator for us.
- X reception is qualitatively strong ("nested agents managing agents is the dream") but the
  announcement itself was modest (61 likes / 3.6K views). The recurring asks in replies:
  how do layers share state, and can you actually walk away. One reply-guy churn story lists
  leaving Superset for Orca.
- Superset has **zero hierarchy anywhere** today (no parentId in any table). The cheapest
  credible path: nested agent rows first (no schema change), then a `parentWorkspaceId`
  column on host `workspaces` + CLI/MCP inference, then sidebar tree rendering.

---

## 1. How people like it (X)

Announcement: [@orca_build, Jun 13](https://x.com/orca_build/status/2065922550467830261) —
"Orca = orchestration for agents. You can spin up nested worktrees + nested agents directly
inside Orca … Enable it under Settings → Orchestration." 61 likes, 30 bookmarks, 5 RTs,
3.6K views. Feature ships behind a settings toggle.

Reception themes (replies + adjacent threads):

| Theme | Evidence |
|---|---|
| "The dream" — orchestrator + visible children | @ApplyWiseAi: "nested agents managing agents is the dream lol"; @mathieuhq (23 likes): main agent orchestrates grok subagents in parallel; @alexhvnsen: grok-in-cursor orchestrator spawning opencode subagents in Orca |
| Visibility/steerability is the selling point | @elok_lam: "letting Hermes spawn a new terminal inside Orca … I can see the terminal myself and steer it directly" |
| State-sharing questions | @ApplyWiseAi: "how are you passing state between the layers though?" → Orca's answer: "via our orca cli. a claude agent can chat with a codex agent to share context" |
| Skepticism about autonomy claims | @mylifcc (377 views): "`pretend to relax` and `nested agents` should never be in the same sentence"; @nickventuri: "soon the agents will start complaining about their managers too" |
| Wants it productized, not DIY | @nutscape001: "why are we spending our time building orchestration / subagents / counter review ourselves and this is not included in the tool as a library? every people i see are building harness around" |
| Competitive churn | @techpoto (228 views): "went from conductor to superset to emdash to paseo to openchamber to cmux to finally settling with @orca_build which is underrated"; @JinjingLiang (16 likes, 1.3K views, replying to a Superset thread): "What you're describing is just @orca_build … Even has nested worktrees & worktree-manager" |
| "Which orchestrator?" confusion | @Stephmiles_: "Are the nested agents part of Orca's orchestrator or would the same UI run Hermes orchestrator?" |

Read: the *sidebar tree* is the visible hook people share screenshots of; the *orchestration
CLI* is what power users actually praise. The complaint surface is babysitting overhead and
DIY harness fatigue — an argument for opinionated built-in patterns (review loops, gates),
which maps to our automations strength.

## 2. How Orca architected it

All paths below are in `~/workplace/orca-ade`.

### Two hierarchies, one card

| | Workspace lineage | Agent (pane) lineage |
|---|---|---|
| Node | git worktree (own checkout + branch) | terminal pane running an agent |
| Parent key | `WorktreeLineage.parentWorktreeId` | `orchestration.parentPaneKey` |
| Storage | persisted JSON side-map keyed by child id | derived at runtime (orchestration SQLite + agent hooks) |
| Depth | unbounded, cycle-guarded | unbounded in sidebar; capped at 1 in dashboard |
| Third tier | — | in-process subagents from Claude `SubagentStart/Stop` hooks, max 32/pane, no PTY of their own |

`skill-guides/orchestration.md:362` is explicit that sidebar lineage ≠ orchestration
lifecycle: a same-worktree worker shows as a peer agent row while being a child dispatch.

### Data model (`src/shared/worktree/lineage-types.ts:19`)

- Edge stored **beside** the worktree, not on it: `worktreeLineageById: Record<childId, WorktreeLineage>`
  in the persisted JSON blob. Worktrees are re-derived from `git worktree list` each scan.
- `WorktreeLineage` carries `parentWorktreeId`, **instance UUIDs for both endpoints**
  (path-derived ids get recycled; edges are valid only if both instance ids still match —
  `src/shared/resolved-worktree-lineage.ts:20`), `origin` ('orchestration'|'cli'|'manual'),
  and `capture: {source, confidence: 'explicit'|'inferred'}`.
- Boundary rule: parent and child must share repoId + hostId + projectId. No cross-repo/host nesting.
- Cycles are dropped at **projection time** by one pure function every consumer goes through,
  not prevented at write time only.

### Spawning (`src/cli/handlers/worktree.ts:198`, `orca-runtime.ts:30279`)

- `orca worktree create --parent-worktree <sel> | --no-parent`; orchestration path is
  `orca orchestration worker-start --task <id> --worktree new-child --agent codex`.
- Parent is resolved by an **evidence-ranking resolver**: explicit flag > `ORCA_WORKSPACE_ID`
  env > orchestration dispatch context > caller terminal handle > cwd. If candidates
  disagree → record **no** lineage + typed `LINEAGE_PARENT_CONTEXT_CONFLICT` warning.
- Lineage never affects git: child branches from `--base-branch` or repo default, **not**
  the parent's branch. "--no-parent only affects Orca lineage."
- Child→parent comms are the orchestration mailbox, not lineage: injected preamble teaches
  workers `worker_done` (required once), 5-min heartbeats, `ask` (blocking), escalation/gates.
  Parent steers via `send --to dispatch:<id>` and `worker-read`.

### Sidebar rendering (`src/renderer/src/components/sidebar/`)

- Flatten tree → rows with `depth`, `lineageTrail`, then **re-collapse each subtree into ONE
  virtual row** (`lineage-group`) so the TanStack virtualizer measures/scrolls it as a unit;
  children mount *inside the parent card's DOM* (needs stopPropagation guards on every
  nested-row event).
- Expand/collapse chip on the parent card: `Workflow` icon + "N children" + chevron, state in
  the same persisted `collapsedGroups` set as section headers, key `lineage:${worktreeId}`.
- Indent = 18px/level; **no connector lines** on workspace cards (computed but unused);
  agent rows use chevron + indent + left border, connectors deliberately removed.
- A parent paints active when a descendant is active. A visible child force-renders its
  filtered-out ancestors ("lineage is structural"). Pinned section never nests.
- Agent rows: `role="tree"`/`treeitem"` + `aria-level`, `+N` badge when collapsed, default
  expanded ("spawned child agents are actionable work"). Subagent rows have no pane —
  clicking activates the parent's pane. Per-worktree pre-indexed store slices to avoid
  O(worktrees²) re-render.

### Lifecycle

- Delete parent ⇒ delete subtree **children-first** (child dirs may nest physically inside
  parent dirs), confirm dialog forced even if user disabled confirms, button reads
  "Delete N Workspaces".
- Archive does NOT cascade — children re-root silently.
- Edge GC: pruned when child path vanishes; proven-missing parent gets its instanceId
  rotated so a future checkout at the same path can't inherit stale children.
- `worker-stop/-release` clean up terminals only, never worktrees.
- **No merge-back, no stacked-diff awareness, no base tracking.** `merge_ready` is just a
  mailbox message type.

### Misc

- Always on — no feature flag (only the announcement's Settings → Orchestration toggle for
  the orchestration layer; sidebar nesting itself has none).
- No lineage telemetry dimension (their gap; we should add one).
- UI vocabulary: "child workspaces", "parent worktree", nest/unnest, `Workflow` icon;
  agents: "subagent", "dispatched N agents". Context menu: Set/Change/Open Parent Worktree,
  Remove from Parent. Re-parenting via drag-onto-card-middle (40% band) or a parent picker.
- ~25 dedicated test files. Marketing feature-wall page storyboards the exact sidebar tree.

## 3. Superset before this work (baseline as of 2026-08-16, pre-#6562)

Everything in this section describes the codebase BEFORE the lineage PR landed —
it is the gap analysis that motivated the work, not the post-merge contract.

- **No hierarchy anywhere.** Host `workspaces` (packages/host-service/src/db/schema.ts:202)
  has projectId/branch/type/taskId/archivedAt — no parent column. Cloud `v2Workspaces` is
  vestigial. Tasks have no subtasks. Only provenance edges in the system:
  `automationRuns.v2WorkspaceId` (cloud) and `terminalAgentBindings.workspaceId` (host).
- **Agents = terminal bindings** (`terminalAgentBindings`), status derived from hook events.
  Multi-agent workspaces already collapse into one chip behind the `workspace-agents-row`
  experiment (DashboardSidebarAgentsChip.tsx:32) — the seed of nested agent rows.
- **Sidebar is flat by construction**: `DashboardSidebarProjectChild` is a 2-case union
  (workspace | section, no recursion), sections are documented "flat and project-scoped,
  one level", DnD membership is a one-level `workspaceId → sectionId` map
  (useSidebarDnd.ts), indent is hardcoded (`pl-8` vs `pl-3`), ordering is a single
  `tabOrder` per container, pinned rows reparent out of their project. Good news: **no
  virtualization** in the sidebar and rows already animate collapse via CSS grid — easier
  than Orca's lineage-group virtual-row contortion.
- **Spawn surface exists, provenance doesn't**: `superset ws create`, `agents create`, MCP
  `workspaces_create`/`agents_create`; every PTY already gets `SUPERSET_WORKSPACE_ID` +
  `SUPERSET_TERMINAL_ID` env (terminal/env.ts:249) — so a spawning agent knows who it is,
  but no create input accepts a parent pointer.
- **Placement trap**: CLI/automation-created workspaces land in the sidebar via
  `usePlaceLocalWorktreesInSidebar`, which can't write renderer-local state richly — so the
  parent pointer MUST live in the host `workspaces` table, not localStorage sidebar state,
  or externally-spawned children will always land flat.

## 4. Proposed modeling for Superset

### Phase 1 — nested agent rows (no schema change)

Ship the `workspace-agents-row` experiment as indented agent rows under the workspace row
(Orca's most-screenshotted surface), instead of the current single chip:

- Rows from `terminalAgents.listByWorkspace` (already fetched per visible workspace by
  DashboardSidebarWorkspaceStatusProvider); status dot from existing derived status.
- Claude subagent detection already exists (hooks; see memory: agent_id only in subagents) —
  optional third tier later, Orca-style synthetic rows that activate the parent pane.
- `role="tree"`/`treeitem`, default expanded, `+N` badge when collapsed, click focuses that
  agent's pane in the workspace.

### Phase 2 — workspace lineage (host schema + CLI/MCP)

- Column `parent_workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL`
  (surfaced as `parentWorkspaceId` in tRPC/TypeScript — snake_case is the
  persisted name, camelCase the API field) +
  `spawnOrigin TEXT` ('ui'|'cli'|'mcp'|'automation') on host `workspaces`. Unlike Orca we
  don't need instance-id fencing or a side map: our ids are UUIDs that never get recycled,
  and the table (not git) is authoritative. Keep Orca's projection-time validation: one
  pure `resolveWorkspaceTree()` that drops cycles/cross-project edges before any consumer.
- Accept `parentWorkspaceId` in `workspaces.create`/`createEnqueued`/`createSession` input;
  CLI `--parent <id|current>` / `--no-parent`; MCP `workspaces_create` param. Inference
  ladder (steal Orca's): explicit flag > `SUPERSET_WORKSPACE_ID` env > cwd-inside-a-known-
  worktree. On conflict: record nothing + warning line. Automations set it from the
  triggering workspace when one exists (also fixes the dangling-workspace-pin class of bugs
  by making the run→workspace edge visible).
- Keep lineage metadata-only at first (branch base unchanged), matching Orca — but see the
  differentiator below.

### Phase 3 — sidebar tree

- Build `childrenByParentId` inside `buildDashboardSidebarProjects`, emit depth-first with
  `depth` on `DashboardSidebarWorkspace`; children render under the parent row (we don't
  need Orca's inside-the-card DOM nesting or its event guards — our rows are siblings).
- Depth-driven indent replacing the `pl-8`/`pl-3` hardcodes; collapse keyed
  `lineage:${workspaceId}` in the existing localStorage collections; parent shows
  "N children" chip + rolled-up status (highest-priority child status wins, like the
  existing agents chip logic).
- Rules to copy: visible child force-renders filtered ancestors; pinned rows don't nest;
  archived children re-root; a parent with an active descendant paints active.
- DnD: nesting via drop-on-row-middle band + context-menu "Set parent workspace…";
  membership map becomes `workspaceId → (sectionId | parentWorkspaceId)`. This is the
  riskiest file (useSidebarDnd.ts, 1106 lines) — fine to land tree rendering first with
  context-menu-only reparenting.
- Delete cascade: children-first, forced confirm listing children (copy Orca verbatim —
  it's correct because our worktrees can also physically nest).

### Future differentiator — close the integration loop (NOT in these PRs)

Deliberately out of scope for #6562/#6564, where lineage stays metadata-only
and never touches git branches:

Orca children are sibling branches with a metadata pointer; integration is manual. We can:
- Offer "branch child from parent's branch" at spawn (opt-in), track the base, and show
  drift ("parent moved, child is N behind").
- "Merge into parent" action on a child row (merge child branch → parent branch in the
  parent's worktree), turning the tree into a real stacked workflow, feeding the existing
  Changes panel.
- Roll child diff stats up to the parent row.

Plus our standing advantage per competitor notes: wire this into **automations** (scheduled
orchestrators that spawn child workspaces) — the "make it a library, stop making me build
harnesses" ask from the announcement replies, and the gap we use against Orca in comparisons.

### Telemetry (their gap, our habit)

`workspace_created` gains `parent_present`, `spawn_origin`, `depth`; sidebar events for
expand/collapse and reparent. Lets us verify whether nesting drives the multi-agent
retention story before Phase 3 polish.

## Sources

- Announcement + replies: x.com/orca_build/status/2065922550467830261
- Docs: onorca.dev/docs/model/agents-sessions, onorca.dev/docs/cli/orchestration
- Code: ~/workplace/orca-ade @ 71bbab72e (paths inline above); Superset paths inline above.
