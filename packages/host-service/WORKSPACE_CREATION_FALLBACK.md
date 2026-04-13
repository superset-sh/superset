# V2 Workspace Creation: Prefer `origin/main` with Fallback

## Problem

V2 workspace creation uses whatever `baseBranch` the UI provides, defaulting to `HEAD`:

```ts
// workspace-creation.ts:381
const baseBranch = input.composer.baseBranch || "HEAD";
```

New workspaces often branch off a stale local `main` instead of the latest `origin/main`. The v1 path already prefers `origin/<branch>`, but v2 has no equivalent.

---

## How Others Solve This

### VS Code (Copilot worktree creation)

**`chatSessionWorktreeServiceImpl.ts:79-92`**

Resolves the branch's **upstream tracking ref** via `getBranch()`:

```ts
if (isAgentSessionsWorkspace && baseBranch) {
    const branchDetails = await gitService.getBranch(repo, baseBranch);
    if (branchDetails?.upstream?.remote && branchDetails.upstream?.name) {
        baseBranch = `${branchDetails.upstream.remote}/${branchDetails.upstream.name}`;
    }
}
// Then: git worktree add -b <newBranch> --no-track <path> <baseBranch>
```

- Uses git's tracking config — works with non-`origin` remotes automatically
- No-op if tracking isn't configured (freshly cloned repos)
- No fetch before creation — relies on last background fetch
- Passes `--no-track` so the new branch doesn't inherit upstream tracking

### T3Code (worktree creation)

**`GitCore.ts:1896-1917`**

No fallback in `createWorktree` itself — passes baseBranch straight through. But `resolveBaseBranchForNoUpstream` (line 1068) has a chain for other flows:

```
1. git config: branch.<name>.gh-merge-base
2. git symbolic-ref refs/remotes/<remote>/HEAD  (remote default branch)
3. Candidates ["main", "master"] — check local refs/heads/ then remote refs/remotes/
```

- Has a **15-second cache-based upstream refresh** (`git fetch --quiet --no-tags`) for status checks (not worktree creation)
- Returns `origin/main` when only the remote branch exists
- Resolves primary remote dynamically (`origin` -> first remote -> error)

### GitHub Desktop (branch creation)

**`create-branch.ts:1-49`, `find-default-branch.ts:21-68`, `git/branch.ts:21-38`**

Multi-layered approach with a `StartPoint` enum and explicit priority chain:

**Default branch resolution** (`findDefaultBranch`):
```
1. git symbolic-ref refs/remotes/<remote>/HEAD    (what remote considers default)
2. git config init.defaultBranch                   (local git config)
3. Hardcoded "main"
```

Then finds the best local representation in priority order:
```
1. Local branch that TRACKS the remote default  (e.g., local main tracking origin/main)
2. Local branch with same NAME as remote default (e.g., local main)
3. Remote tracking branch itself                 (e.g., origin/main)
```

**Branch creation itself:**
- `StartPoint.UpstreamDefaultBranch` -> uses `upstream/main`, passes `--no-track`
- `StartPoint.DefaultBranch` -> uses `main` (local branch name)
- `StartPoint.CurrentBranch` / `Head` -> uses current HEAD
- Fallback chain: `UpstreamDefaultBranch` -> `DefaultBranch` -> `CurrentBranch` -> `Head`

**Freshness:** Background fetcher runs every ~1 hour (min 5 min). After each fetch, runs `git remote set-head -a <remote>` to refresh the remote HEAD symref. No fetch at branch creation time.

### Superset v1

**`workspace-init.ts:217-273`**

`resolveLocalStartPoint`:
```
1. origin/<branch>        (git rev-parse --verify --quiet)
2. <branch> locally
3. Scan common branches: main, master, develop, trunk (both origin/ and local)
```

- Fast: `rev-parse` is local I/O only (<5ms)
- No network calls

---

## Comparison

| | VS Code | T3Code | GitHub Desktop | Superset v1 | **Superset v2 (this PR)** |
|--|---------|--------|----------------|-------------|--------------------------|
| **Strategy** | Upstream tracking lookup | Config -> symbolic-ref -> candidates | Symbolic-ref -> config -> "main" + local/remote search | `origin/<branch>` prefix -> local -> scan | `symbolic-ref` default + `origin/<branch>` -> local -> HEAD |
| **Prefers remote ref?** | Yes (via upstream) | Yes (when only remote exists) | Prefers local that tracks remote | Yes (`origin/` first) | Yes (`origin/` first) |
| **Handles non-origin remotes?** | Yes (reads tracking config) | Yes (resolves primary remote) | Yes (contribution target remote) | No (hardcodes `origin/`) | No (hardcodes `origin/`) |
| **Default branch detection** | N/A (baseBranch always provided) | `symbolic-ref refs/remotes/<remote>/HEAD` | `symbolic-ref` + `init.defaultBranch` + `"main"` | Hardcoded `"main"` | `symbolic-ref refs/remotes/origin/HEAD` -> `"main"` |
| **Fetches before creation?** | No | No (separate 15s cache for status) | No (background hourly fetch) | No | **Yes — targeted single-ref fetch** |
| **`--no-track`?** | Yes (always) | No | Only for upstream default branch | No (`^{commit}` instead) | Yes (always) |
| **Git ops at creation time** | 1 getBranch | 0 (resolution is separate) | 0 (pre-resolved) | 1-2 rev-parse | 1 symbolic-ref + 1-2 rev-parse + 1 fetch |
| **Complexity** | Low | High (Effect services, caches) | Medium (enum + multi-layer resolution) | Low | Low |

---

## Proposed Approach

Combine **Superset v1's simplicity** with **T3Code/GitHub Desktop's dynamic default branch detection**.

### Resolution order

Given `baseBranch` from UI:

```
If baseBranch provided (e.g., "develop"):
  1. origin/<baseBranch>     — freshest remote-tracking ref
  2. <baseBranch> locally    — fallback if origin not fetched
  3. HEAD                    — ultimate fallback

If baseBranch NOT provided:
  1. Resolve repo default via: git symbolic-ref refs/remotes/origin/HEAD --short
     (strips "origin/" prefix to get e.g. "main")
     Falls back to "main" if symbolic-ref fails
  2. Then same chain: origin/<default> -> <default> -> HEAD
```

Each check uses `git rev-parse --verify --quiet` — local only, <5ms.

**Why this over the alternatives:**
- **Over VS Code's approach**: Upstream tracking lookup is elegant but silently no-ops when tracking isn't configured. Direct `origin/<branch>` check is more reliable.
- **Over T3Code's approach**: `gh-merge-base` config and GitHub CLI API calls are too heavy for a hot path.
- **Over GitHub Desktop's approach**: Pre-resolved state + background fetcher is great for a long-running GUI app, but host-service is request-driven — we need to resolve at call time.
- **Over v1's common-branch scan**: Unnecessary when we can detect the actual default branch name via `symbolic-ref`. Scanning `master`/`develop`/`trunk` is a guess; `symbolic-ref` is authoritative.

### New file: `utils/resolve-start-point.ts`

```ts
import type { SimpleGit } from "simple-git";

export async function resolveStartPoint(
  git: SimpleGit,
  baseBranch: string | undefined,
): Promise<{ ref: string; resolvedFrom: string }> {
  const branch = baseBranch?.trim() || (await resolveDefaultBranchName(git));

  const originRef = `origin/${branch}`;
  if (await refExists(git, originRef)) {
    return { ref: originRef, resolvedFrom: `remote-tracking (${originRef})` };
  }

  if (await refExists(git, branch)) {
    return { ref: branch, resolvedFrom: `local (${branch})` };
  }

  return { ref: "HEAD", resolvedFrom: `fallback (HEAD), "${branch}" not found` };
}

async function resolveDefaultBranchName(git: SimpleGit): Promise<string> {
  try {
    const ref = await git.raw([
      "symbolic-ref",
      "refs/remotes/origin/HEAD",
      "--short",
    ]);
    return ref.trim().replace(/^origin\//, "");
  } catch {
    return "main";
  }
}

async function refExists(git: SimpleGit, ref: string): Promise<boolean> {
  try {
    await git.raw(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}
```

### Change in `workspace-creation.ts` (lines 380-392)

```diff
  const git = await ctx.git(localProject.repoPath);
- const baseBranch = input.composer.baseBranch || "HEAD";
+ const { ref: startPoint, resolvedFrom } = await resolveStartPoint(
+   git,
+   input.composer.baseBranch,
+ );
+ console.log(
+   `[workspaceCreation.create] start point resolved: ${startPoint} (${resolvedFrom})`,
+ );

  await git.raw([
    "worktree", "add",
    "-b", branchName,
    worktreePath,
-   baseBranch,
+   startPoint,
  ]);
```

---

### `--no-track` on worktree creation

When branching from `origin/main`, git auto-sets tracking so `git push` targets `origin/main` — not what users want. We need to prevent this.

- **VS Code**: `--no-track` flag
- **GitHub Desktop**: `--no-track` for upstream fork branches
- **Superset v1**: `^{commit}` suffix (dereferences to raw SHA, same effect)

We'll use `--no-track` (more readable than `^{commit}`) and rely on `push.autoSetupRemote` for first-push tracking (already set by v1's worktree init).

```diff
  await git.raw([
    "worktree", "add",
+   "--no-track",
    "-b", branchName,
    worktreePath,
    startPoint,
  ]);
```

---

## Targeted fetch at create time

`resolveStartPoint` reads local `origin/*` refs, which are only as fresh as the last `git fetch`. Rather than fetching everything or guessing staleness, we **fetch only the single ref we resolved to, right before creating the worktree**.

### Flow

```
resolveStartPoint(git, baseBranch)
  -> resolves to e.g. "origin/develop"

If resolved ref starts with "origin/":
  -> extract branch name ("develop")
  -> git fetch origin develop --quiet --no-tags
  -> (refreshes only that one ref)

git worktree add --no-track -b <newBranch> <path> <startPoint>
```

If `resolveStartPoint` fell back to a local branch or HEAD, no fetch happens — there's nothing remote to refresh.

### Why this approach

- **Fetches only what we use**: `git fetch origin <branch>` fetches a single ref + its objects. Fast (~100-300ms for a single branch) vs full `git fetch origin` (can be seconds on large repos).
- **No wasted work**: If the user picked a local branch or HEAD, zero network cost.
- **Right place, right time**: Freshness matters at worktree creation, not at branch listing. No renderer changes needed.
- **Credentials already handled**: `ctx.git(repoPath)` returns a credentialed simple-git instance via `GitCredentialProvider` — fetch just works.
- **Graceful failure**: If fetch fails (offline, auth expired), `resolveStartPoint` already resolved to the best available local ref. We log a warning and proceed.

### Implementation in `workspace-creation.ts`

After `resolveStartPoint`, before `git worktree add`:

```ts
const { ref: startPoint, resolvedFrom } = await resolveStartPoint(
  git,
  input.composer.baseBranch,
);

// If we resolved to a remote-tracking ref, fetch just that branch
// to ensure we're branching from the latest remote state.
if (startPoint.startsWith("origin/")) {
  const remoteBranch = startPoint.replace(/^origin\//, "");
  try {
    await git.fetch(["origin", remoteBranch, "--quiet", "--no-tags"]);
  } catch (err) {
    console.warn(
      `[workspaceCreation.create] fetch origin ${remoteBranch} failed, proceeding with local ref:`,
      err,
    );
  }
}

await git.raw([
  "worktree", "add", "--no-track",
  "-b", branchName, worktreePath, startPoint,
]);
```

### Future: periodic background fetch

Host-service is long-running, so a T3Code/GitHub Desktop-style **background fetch** could keep `origin/*` refs fresh without any per-request cost. Options:

- **Periodic fetch**: e.g., `git fetch --quiet --no-tags origin` every N minutes per repo (T3Code uses 15s for status, GitHub Desktop uses ~1hr)
- **Cache with TTL**: track last-fetch time per repo, only fetch if stale (like T3Code's `StatusUpstreamRefreshCache`)

This would make branch listing fresh too (not just worktree creation) but requires more infrastructure (fetch scheduling, concurrency control).

---

## Performance

| | Git ops | Latency |
|--|---------|---------|
| Current | 0 | 0ms |
| New (baseBranch provided, happy path) | 1 rev-parse | ~3ms |
| New (baseBranch provided, worst case) | 2 rev-parse | ~8ms |
| New (no baseBranch, happy path) | 1 symbolic-ref + 1 rev-parse | ~6ms |
| New (no baseBranch, worst case) | 1 symbolic-ref + 2 rev-parse | ~11ms |
| `git worktree add` itself | — | 100-500ms |

---

## Files

| File | Action |
|------|--------|
| `src/trpc/router/workspace-creation/utils/resolve-start-point.ts` | Create |
| `src/trpc/router/workspace-creation/workspace-creation.ts` | Modify (lines 380-392) |
| `test/resolve-start-point.test.ts` | Create |
