# V2 configurable branch prefixes — retrospective design doc

**Ticket:** SUPER-835 · **Branch:** `configurable-branch-prefi` ·
**Footprint:** +1412 / −15 across 22 files

## Why the diff stat looked huge

`git diff main..HEAD --stat` reports ~2200 added / ~1979 deleted across 79
files, but that is comparing two diverged tips. Against the merge-base
(`59a2a341a`), the actual branch footprint is **+1412 / −15 across 22
files**. The deletions in the misleading stat (`full-disk-access.test.ts`,
`argv.test.ts`, `focusTerminalPane/`, `setup-script-prompt.md`, etc.) are
work landed on `main` *after* this branch was cut and are not part of this
change. Of the real 1412 added lines, ~640 are the auto-generated drizzle
snapshot (`0005_snapshot.json`) and ~140 are tests — the hand-written
feature surface is ~600 lines.

## Goal

Bring v1's "branch prefix" feature to the v2 (host-service) workspace flow.
Requested by Censys for an org-wide v2 trial: new workspace branches should
be namespaced under a configurable segment (e.g. `censys/my-feature`,
`kho/my-feature`) so multi-user remotes stay tidy.

## Behaviour (v1 parity)

| Mode     | Resolves to                       |
|----------|-----------------------------------|
| `none`   | no prefix                         |
| `github` | the authed `gh` user's login      |
| `author` | git `user.name`                   |
| `custom` | a user-typed string (sanitized)   |

- **Two levels of configuration**: a host-wide global default plus an
  optional per-project override. Project override wins when its mode is set;
  otherwise the global default applies; otherwise `none`.
- **Applied to new branches only.** Auto-generated names (AI / friendly
  random) and typed branch names that don't already exist get prefixed.
  Existing branches and PR checkouts are never re-prefixed.
- **Collision guard.** If the resolved prefix equals an existing branch
  name, it's dropped — git cannot hold both `censys` and `censys/foo`.
- **Dedupe survives prefixing.** `deduplicateBranchName` runs *after* the
  prefix is applied, so `censys/login` colliding with an existing branch
  becomes `censys/login-2` rather than `censys/login` being abandoned.

## Storage

v1 stored both settings in the desktop's local SQLite (per-user, per
machine). v2 runs workspace creation inside `packages/host-service`, which
has its own SQLite DB — so v2 storage is **host-local**, mirroring the v1
locality decision but on a different physical store.

Two new columns and one new table (`drizzle/0005_branch_prefix_settings.sql`):

```sql
CREATE TABLE host_settings (
    id integer PRIMARY KEY DEFAULT 1 NOT NULL,
    branch_prefix_mode text,
    branch_prefix_custom text
);
ALTER TABLE projects ADD branch_prefix_mode text;
ALTER TABLE projects ADD branch_prefix_custom text;
```

- `host_settings` is a single-row table (`id = 1`, upserted on
  `onConflictDoUpdate`). The host-service has no generic settings store
  today; this is the minimum-viable shape for the one global setting v2
  needs. If a second host-level setting appears, this generalizes to a
  proper key/value or wider columns then.
- `projects.branch_prefix_mode = NULL` means "inherit the host default."
  Any non-null value (including `'none'`) is an explicit override.

## Module map

```
packages/shared/src/workspace-launch/branch.ts
  • BRANCH_PREFIX_MODES (single source of truth) + BranchPrefixMode
  • resolveBranchPrefix({ mode, customPrefix, authorPrefix, githubUsername })
    — already existed; now consumes the shared type

packages/local-db/src/schema/zod.ts
  • Re-exports BRANCH_PREFIX_MODES / BranchPrefixMode from shared
    (host-service cannot depend on local-db)

packages/host-service/src/db/schema.ts
  • projects.branchPrefixMode / branchPrefixCustom
  • hostSettings table

packages/host-service/src/trpc/router/
  ├ settings/branch-prefix.ts           — { get, set, gitInfo } host-wide
  ├ project/project.ts → setBranchPrefix — per-project override
  └ workspaces/workspaces.ts             — invokes prefix during create
     └ workspace-creation/utils/branch-prefix.ts
        • getGitAuthorName  (git user.name, null on failure)
        • getGitHubUsername (gh api user --jq .login, null on failure)
        • resolveGitInfo    (parallel, for the settings preview)
        • resolveProjectBranchPrefix (cascade + collision guard)

apps/desktop/src/renderer/routes/_authenticated/settings/
  ├ components/BranchPrefixControl/      — shared select+input
  ├ git/components/V2GitSettings/        — host-wide default UI
  └ v2-project/$projectId/.../BranchPrefixSection/ — per-project override UI
```

## tRPC surface

| Procedure                              | Shape                                                                                          |
|----------------------------------------|------------------------------------------------------------------------------------------------|
| `settings.branchPrefix.get`            | `→ { mode: BranchPrefixMode, customPrefix: string \| null }`                                   |
| `settings.branchPrefix.set`            | `{ mode, customPrefix? } →`                                                                    |
| `settings.branchPrefix.gitInfo`        | `→ { githubUsername, authorName }` — drives the preview chip                                   |
| `project.get`                          | now also returns `branchPrefixMode`, `branchPrefixCustom`                                       |
| `project.setBranchPrefix`              | `{ projectId, mode: BranchPrefixMode \| null, customPrefix? } →` — `null` mode clears override |

## Resolution at workspace-create time

`workspaces.create` calls `resolveProjectBranchPrefix` along both branches
of the existing typed-vs-auto-generated split:

```
typed branch path:
    plan = planBranchSource(...)
    if (!plan.usedExistingBranch):
        prefix = resolveProjectBranchPrefix(...)
        if (prefix):
            resolvedBranch = deduplicateBranchName(`${prefix}/${typed}`, existing)
            plan.branch = resolvedBranch

auto-generated path:
    prefix    = resolveProjectBranchPrefix(...)
    candidate = aiNames?.branchName || generateFriendlyBranchName()
    prefixed  = prefix ? `${prefix}/${candidate}` : candidate
    resolvedBranch = deduplicateBranchName(prefixed, existing)
```

Three properties this gets right that are easy to get wrong:
1. **Existing-branch checkouts skip prefixing** (`plan.usedExistingBranch`
   gate). PR checkouts and `git checkout existing-name` workflows are
   untouched.
2. **`listBranchNames` is fetched in the same `Promise.all`** that already
   loads the AI title — no extra serial git call.
3. **Dedupe runs after prefixing**, so the collision guard handles "prefix
   equals an existing branch name," and `deduplicateBranchName` handles
   "full prefixed name collides."

## Renderer

`BranchPrefixControl` is the shared select+(conditional custom input) used
by both surfaces. The two consumers differ only in whether the dropdown
includes a `"Use global default"` entry (`showDefault` prop) — the
host-wide setting cannot itself defer to a default, so it omits it.

Custom-prefix behavior worth calling out:
- The text input is locally controlled and syncs from props via `useEffect`,
  so optimistic edits don't fight the query.
- `onBlur` sanitizes with `sanitizeSegment` from `@superset/shared`.
- An empty sanitized prefix on blur is treated as "still typing": the input
  clears but no mutation fires. This avoids persisting
  `{ mode: 'custom', customPrefix: null }`, which would lie about user
  intent — the only way to leave `custom` mode is via the dropdown.

## Decisions / tradeoffs

- **Why a `host_settings` table and not a key/value store?** YAGNI. One
  global setting today; a real settings store can be introduced when the
  second one appears. The `id = 1` upsert keeps the call site simple.
- **Why not put `BRANCH_PREFIX_MODES` in `@superset/local-db`?**
  `host-service` can't depend on `local-db`. The constants moved to
  `@superset/shared/workspace-launch` (next to `resolveBranchPrefix`); the
  old `local-db` export is a re-export so existing v1 callers don't churn.
- **Why drop the `gh` username cache from the original draft (the refactor
  commit)?** `gh api user --jq .login` is cheap and the call only happens
  on workspace-create / settings open. The cache added complexity (state,
  invalidation when the user re-auths) without measurable wins. Both the
  settings preview and the per-create resolution call it directly.
- **Why prefix only "new" branches?** Re-prefixing existing branches or PR
  checkouts would rename other people's work and break remotes. v1's rule
  was the right one; we kept it.
- **Why per-project override at all?** A user working in monorepo-A and
  open-source-B may want `kho/` in one and no prefix in the other. The
  cascade (project → host → `none`) lets the global default stay useful
  even when one project opts out.

## Tests

`workspace-creation/utils/branch-prefix.test.ts` covers the resolver:
- mode cascading (project beats global; null project falls back to global;
  both empty → `undefined`)
- per-mode resolution (`author`, `github`, `custom`)
- the collision guard (prefix equals existing branch name → undefined)
- `gh` / `git user.name` lookup failure paths (return `null`, don't throw)

## Out of scope / follow-ups

See `.spec/improvements/SUPER-794/follow-ups.md`. Not addressed here:
- Migration path for v1 users who already had a configured prefix in the
  desktop local DB. Currently they reconfigure once in v2.
- Org-level / team-level defaults (cloud-pushed). Host-local was the
  product decision for the ticket; org defaults would layer on top of the
  same cascade.
- Prefix display in the workspace list (currently only visible when you
  expand a workspace and see the branch).
