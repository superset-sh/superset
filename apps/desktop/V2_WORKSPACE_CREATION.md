# V2 Workspace Creation — Design

Umbrella design for the v2 "new workspace" flow: branch discovery, the three creation intents (fork / checkout / adopt), the pending-page dispatch, and the delete counterpart that ships in a follow-up PR. Cross-cutting patterns for git-ref handling live in `packages/host-service/GIT_REFS.md`.

## Scope

The v2 modal at `/_authenticated/.../DashboardNewWorkspaceModal/` lets users pick a branch and turn it into a workspace. Three workspace-creating intents, one branch picker, one pending page, one cloud+host coordination contract. The delete flow is the inverse of the creation path and follows the same coordination model.

Not in scope here: v1 (`NewWorkspaceModal`, deliberately diverged), chat session migration, cross-host cleanup.

---

# 1. Branch discovery

## Data shape

One procedure — `workspaceCreation.searchBranches` — returns everything the picker needs per row:

```ts
input: {
  projectId: string;
  query?: string;                              // server-side substring match
  cursor?: string;                             // opaque (base64-encoded offset)
  limit?: number;                              // default 50, max 200
  refresh?: boolean;                           // triggers `git fetch --prune`, TTL-gated
  filter?: "branch" | "worktree";              // server-side filter; default = "branch"
}

output: {
  defaultBranch: string | null;
  items: BranchRow[];
  nextCursor: string | null;
}

type BranchRow = {
  name: string;
  lastCommitDate: number;
  isLocal: boolean;
  isRemote: boolean;
  recency: number | null;       // reflog ordinal, 0 = most recent
  worktreePath: string | null;  // only Superset worktrees under <repo>/.worktrees/
  hasWorkspace: boolean;        // workspaces row exists for (project, branch) on this host
  isCheckedOut: boolean;        // true if in any git worktree (incl. primary)
};
```

One procedure with rich metadata rather than two (branches + worktrees) because worktrees aren't a separate searchable surface — they're a filter + decoration on the same branch list. Single source of truth, one invalidation trigger, no flicker from two queries arriving out of order.

## Server flow

Executed on every `searchBranches` call:

1. If `refresh` is set and the 30s per-project TTL has elapsed, `git fetch --prune --quiet --no-tags`. The TTL prevents keystroke-level thrash.
2. `git for-each-ref --sort=-committerdate refs/heads/ refs/remotes/origin/` — one call, both namespaces, ~20ms on 10k refs.
3. `git worktree list --porcelain` → two maps: `worktreeMap` (Superset-managed only, under `.worktrees/<branch>/`) and `checkedOutBranches` (every worktree incl. primary).
4. `git log -g --pretty=%gs --grep-reflog=checkout: -n 500` → reflog recency ordinals per branch.
5. Parse refs using the **full** refname prefix (`refs/heads/` vs `refs/remotes/origin/`) — a structural namespace that can't appear inside a branch name. Short-name prefixes like `origin/` are unsafe because a local branch can legitimately be named `origin/foo`. See `GIT_REFS.md`.
6. Collapse local+remote pairs by name; attach worktree + recency + hasWorkspace flags.
7. Apply `filter`: `branch` excludes worktree'd rows (`!worktreeMap.has(name)`), `worktree` includes only them.
8. Apply `query` substring (case-insensitive).
9. Sort: default branch first, then reflog-recent ascending, then everything else by `committerdate` desc.
10. Slice `[offset, offset + limit)`; return `nextCursor` if more.

Cursor is opaque — currently `base64(JSON.stringify({ offset }))`. We don't cache between calls because `for-each-ref` is cheap enough; if profiling ever shows it, memoize per `(projectId, query, generation)`.

## Client flow

`useBranchContext` wraps `useInfiniteQuery` keyed by `(projectId, hostUrl, query, filter)`. First page (`pageParam === undefined`) sends `refresh: true`; subsequent pages don't. Types (`BranchFilter`, `BranchRow`) are derived from the server schema via `inferRouterInputs<AppRouter>` / `inferRouterOutputs<AppRouter>` — single source of truth, no duplicate enums.

The picker is a popover with:
- Search input (server-side, substring).
- 2-tab strip (Branch / Worktree) bound to the `filter` input.
- Infinite-scroll list with an IntersectionObserver sentinel; the callback has an `inFlight` guard so a small page on a tall viewport can't cascade-load all remaining pages.
- Per-row hover-reveal action buttons (see §2).

---

# 2. Actions per row

The picker dispatches one of four actions based on which tab and what the row's state is:

| Tab      | Row state | Click row body | Hover-reveal action |
|----------|-----------|----------------|---------------------|
| Branch   | (no worktree) | Set as base branch → submit prompt → **Fork** | **Check out** (disabled if `isCheckedOut`) |
| Worktree | Has cloud workspace row | Set as base branch → Fork from this worktree's branch | **Open** — navigate to existing workspace |
| Worktree | Orphan (worktree on disk, no cloud row) | Set as base branch → Fork | **Create** — adopt the orphan |

**Why click ≠ action button.** Click preserves today's prompt-driven fork flow; the user types and submits. Action buttons commit immediately — one click, skip the prompt dance — when the user's intent is clear.

**Why "Check out" instead of "Create" on Branch tab.** Both paths create a workspace; the distinguishing axis is branch-level: Check out reuses the existing branch; Fork forks a new one from it. The labels signal the right distinction.

**Authority for `hasWorkspace`**: the picker calls `hasWorkspaceForBranch(name)` which queries the cloud-synced `v2Workspaces` collection, NOT the server's `hasWorkspace` field. The server field is a host-side snapshot that stays `true` after a cloud delete until host cleanup catches up; the client collection reflects real-time cloud state. Side benefit: orphan worktrees (disk dir without cloud row) correctly get "Create" and clicking it resurrects them.

**Disabled "Check out" state**: `aria-disabled="true"` only, never the native `disabled` attribute. Native `disabled` blocks pointer events, which makes the Radix Tooltip explaining "already checked out" unreachable. Click handler `stopPropagation()`s to prevent action.

---

# 3. Workspace creation flow

Three intents (`fork` / `checkout` / `adopt`), one unified path.

## The path

Modal inserts a `pendingWorkspaces` row tagged with `intent` and navigates to `/pending/<id>`. The pending page owns the mutation, loading/error UX, and retry. Three buttons in the UI (Submit / Check out / Create), one code path.

Previously only fork went through this; checkout and adopt were fire-and-forget (silent failures, no recovery). Now all three share:
- Pending-row persistence (localStorage via the `pendingWorkspaces` collection).
- Progress UI (either host-service `getProgress` steps or a generic spinner for adopt).
- Retry on failure.
- Warning surfacing (`result.warnings[]`).

## Pending row schema

`pendingWorkspaceSchema` in `providers/CollectionsProvider/dashboardSidebarLocal/schema.ts`:

```ts
{
  // Shared
  id, projectId, hostTarget, intent, name, branchName, status, error,
  workspaceId, warnings, terminals, createdAt;

  // Fork-only (default-empty for checkout/adopt)
  prompt, baseBranch, baseBranchSource, linkedIssues, linkedPR, attachmentCount;

  // fork + checkout (irrelevant for adopt)
  runSetupScript;
}
```

`hostTarget`, `linkedIssues`, `linkedPR` are structured zod shapes (discriminatedUnion, typed objects) — not `z.unknown()`. Malformed rows fail zod parse at the collection boundary instead of crashing a downstream consumer.

## Pending page dispatch

`useFireIntent` in `_dashboard/pending/$pendingId/page.tsx`:

```ts
switch (pending.intent) {
  case "fork":     result = await createWorkspace(buildForkPayload(pendingId, pending, attachments));
  case "checkout": result = await checkoutWorkspace(buildCheckoutPayload(pendingId, pending));
  case "adopt":    result = await adoptWorktree(buildAdoptPayload(pending));
}
```

Payload builders live in `buildIntentPayload.ts` — pure functions, no React, no IO. Contract-tested in `buildIntentPayload.test.ts` (11 cases covering every input shape + edge cases: empty prompts, orphan hostTarget kinds, linkedIssue filtering).

Guards on the page:
- **`firedRef`** ensures the mutation fires once per pending page. Resets when `pendingId` changes under a mounted component (user navigates from one pending page to another).
- **`workspaceSynced`** is a live-query against `v2Workspaces` — the page waits for the newly-created cloud row to arrive via Electric before navigating to `/v2-workspace/<id>`, with a 3s timeout fallback. Fast intents (adopt) would otherwise beat sync and land on "workspace not found."
- **`navigatedRef`** prevents double-navigation; also reset on `pendingId` change.

## Intent-specific UI

- **Fork / Checkout**: polls `workspaceCreation.getProgress` for step labels (`ensuring_repo` → `creating_worktree` → `registering`) at 500ms.
- **Adopt**: server doesn't instrument progress (it's DB ops only, typically <100ms), so the page renders a generic spinner. The `workspaceSynced` gate adds enough wait for the cloud row to arrive — no "workspace not found" flash.

## The three mutations

The router entrypoint is `packages/host-service/src/trpc/router/workspace-creation/workspace-creation.ts`; the mutation implementations live under `packages/host-service/src/trpc/router/workspace-creation/procedures/`:

**`create`** (fork from a base branch):
1. Ensure local project (clone if missing).
2. Resolve start point — either `buildStartPointFromHint(baseBranch, baseBranchSource)` when the picker supplied a hint, or `resolveStartPoint(git, baseBranch)` probing full refnames. Both return a `ResolvedRef`.
3. If remote-tracking, `git fetch origin <branch>` for freshness.
4. `git worktree add --no-track -b <newBranch> <path> <startPoint>` — `--no-track` since the new branch is intentionally untethered.
5. `ensureV2Host` → cloud `v2Workspace.create` → rollback worktree on cloud failure.
6. Insert local `workspaces` row.
7. Optionally spawn setup terminal (`.superset/setup.sh`).

**`checkout`** (reuse an existing branch):
1. Same project-ensure prelude.
2. `resolveRef(git, branch)` → switch on `kind`. Tags rejected.
3. For remote-tracking: `git fetch origin <branch>` then `git worktree add --track -b <branch> <path> origin/<branch>`. The `--track -b` is essential — bare `git worktree add <path> origin/<branch>` produces a detached HEAD.
4. Same cloud + local registration as `create`.

**`adopt`** (register an existing worktree as a workspace):
1. Project-ensure.
2. `listWorktreeBranches` → find the existing `.worktrees/<branch>/` directory.
3. `ensureV2Host` → cloud `v2Workspace.create`. Always creates a fresh cloud row — **no local-idempotency shortcut**: previously we returned the existing `workspaces.id` without calling cloud, which echoed a phantom id when the original cloud row had been hard-deleted.
4. Replace any stale local `workspaces` row for this (project, branch) with the new cloud id.
5. No git ops, no setup script (worktree already exists).

All three return `{ workspace, terminals, warnings }`.

## The `baseBranchSource` hint

The picker already knows whether each row is local or remote-only (`isLocal` / `isRemote`). It passes that knowledge through the whole chain:

```
picker row (isLocal: true)
  → onSelectCompareBaseBranch(name, "local")
  → draft.baseBranchSource = "local"
  → pendingWorkspaces row carries baseBranchSource
  → createWorkspace composer includes baseBranchSource
  → server buildStartPointFromHint → { kind: "local", ... }
  → git worktree add ... <shortName>
```

Server falls back to `resolveStartPoint` only when no hint is given (legacy pending rows, non-picker callers). Benefit: the server never has to re-resolve, so stale cached remote refs can't silently win and produce `git worktree add` failures like `fatal: invalid reference: origin/<branch>`.

This is the "classify at the boundary, carry the tag" principle applied at the API layer. Same shape as `ResolvedRef` — but for the API contract instead of the ref type.

## UX per row

Default state (no hover):
```
⎇ feature-foo  [remote]   3d ago   [✓ when selected]
```

On hover/focus (keyboard users get this via `group-focus-within`):
```
⎇ feature-foo  [remote]             3d ago   [Check out]     ← Branch tab
⎇ feature-bar                       1h ago   [Open]          ← Worktree tab, hasWorkspace
⎇ feature-baz                       2h ago   [Create]        ← Worktree tab, orphan
```

---

# 4. Workspace delete (follow-up PR)

**Not implemented here.** The creation flow left host-side state leaking on cloud delete — the picker handles this defensively today via the client-collection `hasWorkspace` check and Create-adopts-orphans. Full cleanup lives in a follow-up PR with the design below.

## Principle

**The side that owns harder-to-reverse state orchestrates.** Host-service owns the git worktree, PTYs, and local sqlite. The cloud row is bookkeeping *about* the workspace. If host-service commits to the delete, the cloud follows. If cloud delete fails after disk is gone, the user has a consistent view (nothing to open) and the cloud row reconciles on next sync.

Delete inverts the same order as create: host does `git worktree remove` → calls `v2Workspace.delete` → deletes host row.

## Procedure shape

```ts
workspaceCleanup.destroy: protectedProcedure
  .input(z.object({
    workspaceId: z.string(),
    deleteBranch: z.boolean().default(false),
    force: z.boolean().default(false),
  }))
  .mutation(async ({ ctx, input }) => {
    // 1. Kill PTYs for this workspaceId.
    // 2. Run .superset/teardown.sh if it exists, 60s timeout, SIGKILL on timeout,
    //    capture stdout/stderr tail. On failure (and no `force`), throw TEARDOWN_FAILED
    //    typed so renderer can prompt "delete anyway" → re-call with force: true.
    // 3. `git worktree remove <path>` (add --force if input.force). Throws CONFLICT
    //    if dirty without force — renderer prompts.
    // 4. If deleteBranch: `git branch -d <branch>` (or -D with force).
    // 5. Cloud delete (`v2Workspace.delete`). Failures logged + warned; disk is
    //    already clean, cloud self-heals.
    // 6. Delete host-sqlite `workspaces` row.
    return { warnings };
  });
```

## Renderer flow

```ts
try {
  await destroy({ workspaceId, deleteBranch: false, force: false });
} catch (err) {
  if (err.code === "CONFLICT" || err.code === "TEARDOWN_FAILED") {
    const confirmed = await showDeleteConfirm({ ... });
    if (confirmed.deleteAnyway) {
      await destroy({ workspaceId, deleteBranch: confirmed.deleteBranch, force: true });
    }
  }
}
```

Fast path: one click for clean worktree, no branch delete. Confirm only on dirty / teardown-fail / deleteBranch: true.

## What this replaces

- Direct calls to `v2Workspace.delete.mutate` from the renderer. Cloud endpoint locks down to require a host-service service token after cutover.
- The picker's "stale hasWorkspace" defensive fix stays — belt-and-suspenders against partial-failure modes.
- Host-side `workspaces` table leak fixed by step 6.

## Open decisions for the delete PR

- **Soft-delete vs hard-delete** of the cloud row. Hard-delete is today's behavior and orphans chat sessions (`chatSessions.v2WorkspaceId` is `onDelete: "set null"`). Soft-delete (add `deletedAt`, filter in Electric subscription) would preserve chat continuity on re-adopt. Decision owned by the delete PR.
- **Remote-host cleanup** (workspace on remote host deleted from this device). Same pattern, separate PR.
- **Bulk delete / trash bin**: future composition over `destroy`.

---

# 5. Invariants + enforcement

## Authority decisions

| Question | Authoritative source | Why |
|----------|---------------------|-----|
| "Does a git ref exist?" / "Is it local or remote?" | `resolveRef` probe against full refnames | Full refname prefixes are structural; short forms are ambiguous (see GIT_REFS.md). |
| "Does a workspace row exist right now?" | Cloud-synced `v2Workspaces` collection | Electric reflects cloud state; host-side cache can be stale after delete. |
| "What branches are on disk?" | `git for-each-ref` + `git worktree list --porcelain` | Git is the source of truth for repo state. |
| "What was the user's picker intent?" | `baseBranchSource` hint + `intent` discriminator | Picker already knows; carry the tag through the API boundary. |
| "Is the worktree deletion safe?" | Host-service checks git state directly | Host owns disk; cloud can't verify. |

## Git ref handling

See `packages/host-service/GIT_REFS.md` for the pattern. Key rules:
- Never `.startsWith("origin/")`. Always probe full refnames.
- `ResolvedRef` discriminated union with template-literal `fullRef` types; `switch` on `kind` with `never` exhaustiveness default.
- Fields that belong to one variant only (e.g., `remote` on `remote-tracking`) live in that variant, not as `?: string`.

## Tests

- `packages/host-service/src/runtime/git/refs.test.ts` — 12 tests, contract suite for every input shape.
- `packages/host-service/src/trpc/router/workspace-creation/utils/resolve-start-point.test.ts` — 11 tests, including regression for local-named-`origin/foo` branches.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/pending/$pendingId/buildIntentPayload.test.ts` — 11 tests, intent payload construction.

## Lint

- `scripts/check-git-ref-strings.sh` bans `.startsWith("origin/")` and `.replace("origin/", ...)` outside `refs.ts`. Exit-code-aware: distinguishes rg-not-found from rg-error so a broken scan fails loudly.
- V1 desktop tRPC routers excluded (they have pre-existing instances; v1 cleanup is a separate concern per GIT_REFS.md).

## Type guarantees

- `ResolvedRef` kind → compiler enforces narrowing before accessing variant-only fields.
- `BranchFilter`, `BranchRow`, `CreateWorkspaceInput`, `CheckoutWorkspaceInput`, `AdoptWorktreeInput` are all inferred from server schemas — renaming a field on either side fails compilation at every call site.
- Pending row's `hostTarget` / `linkedIssues` / `linkedPR` are zod-typed, not `z.unknown()`. No `as` casts at read sites.

---

# Deferred (tracked but not in this design)

- **Prompt carry-over on Open-existing**. Infra design notes captured during PR review; needs a zustand seed store + wiring the v2 ChatPane's `initialLaunchConfig`. Pure UX improvement, not a correctness issue.
- **Recency section headers** ("Recent" / "Other") in the picker. Server already emits in recency order; cosmetic rendering change.
- **V1 migration to ResolvedRef** in `apps/desktop/src/lib/trpc/routers/**`. V1 predates this pattern; excluded from the lint rule. Port during the v1 sunset or leave until v1 dies with v2 launch.
- **Virtualization of branch rows** via `@tanstack/react-virtual`. `useInfiniteQuery` keeps fetched pages in memory; only add windowing if repos with thousands of *shown* branches become a real performance issue.
- **Multi-remote support** in `resolveRef`. Today it's hardcoded to `origin`; the discriminated union already encodes `remote: string` for future enumeration.

## Cross-reference

For the foundational git-ref handling pattern that underpins `create` / `checkout` / `resolveStartPoint`, see [`packages/host-service/GIT_REFS.md`](../../packages/host-service/GIT_REFS.md).

---

# Appendix: prior art for `resolveStartPoint`

Background research that informed the start-point resolution + targeted-fetch approach in §3's `create` mutation. Useful when revisiting whether to keep the current strategy, switch to a background-fetcher model, or add multi-remote support.

## How other apps solve "where do I branch off from?"

### VS Code (Copilot worktree creation)

`chatSessionWorktreeServiceImpl.ts:79-92` — resolves the branch's **upstream tracking ref** via `getBranch()`:

```ts
if (isAgentSessionsWorkspace && baseBranch) {
  const branchDetails = await gitService.getBranch(repo, baseBranch);
  if (branchDetails?.upstream?.remote && branchDetails.upstream?.name) {
    baseBranch = `${branchDetails.upstream.remote}/${branchDetails.upstream.name}`;
  }
}
// Then: git worktree add -b <newBranch> --no-track <path> <baseBranch>
```

Properties: works with non-`origin` remotes via tracking config. No-op when tracking isn't configured (freshly cloned repos). No fetch before creation — relies on last background fetch. Always passes `--no-track`.

### T3Code (worktree creation)

`GitCore.ts:1896-1917` — passes `baseBranch` straight through `createWorktree`. The chain lives in `resolveBaseBranchForNoUpstream` (line 1068):

```
1. git config: branch.<name>.gh-merge-base
2. git symbolic-ref refs/remotes/<remote>/HEAD  (remote default branch)
3. Candidates ["main", "master"] — check local refs/heads/ then remote refs/remotes/
```

Has a **15-second cache-based upstream refresh** (`git fetch --quiet --no-tags`) for status checks, separate from worktree creation. Resolves primary remote dynamically (`origin` → first remote → error).

### GitHub Desktop (branch creation)

Multi-layered resolution with a `StartPoint` enum:

`findDefaultBranch` (`find-default-branch.ts:21-68`):
```
1. git symbolic-ref refs/remotes/<remote>/HEAD    (what remote considers default)
2. git config init.defaultBranch                   (local git config)
3. Hardcoded "main"
```

Then finds the best local representation in priority order:
```
1. Local branch that TRACKS the remote default  (e.g., local main tracking origin/main)
2. Local branch with same NAME as remote default (e.g., local main)
3. Remote-tracking branch itself                 (e.g., origin/main)
```

Branch creation (`create-branch.ts:1-49`):
- `StartPoint.UpstreamDefaultBranch` → `upstream/main`, `--no-track`
- `StartPoint.DefaultBranch` → `main` (local)
- `StartPoint.CurrentBranch` / `Head` → current HEAD
- Fallback chain: Upstream → Default → Current → Head

Freshness: background fetcher every ~1 hour (min 5 min). After each fetch, `git remote set-head -a <remote>` to refresh the remote HEAD symref. No fetch at branch creation time.

### Superset v1

`workspace-init.ts:217-273` — `resolveLocalStartPoint`:
```
1. origin/<branch>        (git rev-parse --verify --quiet)
2. <branch> locally
3. Scan common branches: main, master, develop, trunk (both origin/ and local)
```

Fast: `rev-parse` is local I/O only (<5ms). No network calls.

## Comparison

| | VS Code | T3Code | GitHub Desktop | Superset v1 | **Superset v2** |
|--|---------|--------|----------------|-------------|-----------------|
| **Strategy** | Upstream tracking lookup | Config → symbolic-ref → candidates | Symbolic-ref → config → "main" + local/remote search | `origin/<branch>` prefix → local → scan | **Local-first** + symbolic-ref default + `origin/<branch>` fallback → HEAD |
| **Prefers remote ref?** | Yes (via upstream) | Yes (when only remote exists) | Prefers local that tracks remote | Yes (`origin/` first) | **No — local-first** (avoids stale remote refs) |
| **Handles non-origin remotes?** | Yes | Yes | Yes | No | No (origin hardcoded today) |
| **Default branch detection** | N/A | `symbolic-ref refs/remotes/<remote>/HEAD` | symbolic-ref + `init.defaultBranch` + `"main"` | Hardcoded `"main"` | `symbolic-ref refs/remotes/origin/HEAD` → `"main"` |
| **Fetches before creation?** | No | No (15s cache for status) | No (background hourly) | No | **Yes — targeted single-ref fetch** when remote-tracking |
| **`--no-track`?** | Yes always | No | Only for upstream default | No (`^{commit}` instead) | Yes always |
| **Complexity** | Low | High (Effect services, caches) | Medium (enum + multi-layer) | Low | Low |

## What we picked and why

**Local-first with `symbolic-ref` default detection + targeted single-ref fetch on remote-tracking.**

- **Over VS Code's upstream-tracking lookup**: silently no-ops when tracking isn't configured (freshly cloned repos, branches set up with `--no-track`). Direct probe is more reliable.
- **Over T3Code's `gh-merge-base` config + GitHub CLI calls**: too heavy for a request-driven hot path; T3Code can amortize via long-lived services, host-service can't.
- **Over GitHub Desktop's pre-resolved state + background fetcher**: great for a long-running GUI app; host-service is request-driven and shouldn't carry that infrastructure.
- **Over v1's common-branch scan**: unnecessary when `symbolic-ref` is authoritative for the actual default branch name. Scanning `master`/`develop`/`trunk` is a guess.
- **Over remote-first** (which earlier versions of this PR used): a stale cached `refs/remotes/origin/<branch>` (one-off push, missed prune) silently won and produced `git worktree add` failures like `fatal: invalid reference: origin/<branch>`. Local-first matches user intent — the user picks branches from a list they see locally.

## Future: periodic background fetch

Host-service is long-running, so a T3Code/GitHub Desktop-style background fetch would keep `origin/*` refs fresh without per-request cost:

- **Periodic fetch**: `git fetch --quiet --no-tags origin` every N minutes per repo (T3Code uses 15s for status, GitHub Desktop uses ~1hr).
- **Cache with TTL**: track last-fetch time per repo, only fetch if stale.

The picker's `refresh: true` on modal-open already does a TTL-gated full fetch (30s) — covers the most common freshness need. Move to background-fetch infrastructure only if branch listings start showing visibly stale state in practice.
