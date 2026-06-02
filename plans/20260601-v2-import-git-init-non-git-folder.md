# v2 "Import folder" — initialize git for a non-git folder

## Problem

When a user imports a folder that is **not yet a git repository**, v2 hard-errors with
`Not a git repository: <path>` instead of offering to initialize one. This is the likely
root cause of issue [#5033](https://github.com/superset-sh/superset/issues/5033) ("why
cannot import local git folder without remote?") — the report is really about a *non-git*
folder, not a remote-less one (remote-less repos already import fine).

### Where it fails today

- Import UI: `apps/desktop/.../AddRepositoryModals/hooks/useFolderFirstImport/useFolderFirstImport.ts`
  - `start()` picks a directory → calls `client.project.findByPath.query({ repoPath })` (line 56).
- `project.findByPath` (`packages/host-service/src/trpc/router/project/project.ts:165`) calls
  `resolveLocalRepo(input.repoPath)` →
- `resolveLocalRepo` (`utils/resolve-repo.ts:116`) → `revParseGitRoot` (`:98`) runs
  `git rev-parse --show-toplevel`; on a non-git folder it **throws**
  `TRPCError BAD_REQUEST: "Not a git repository: <path>"`.
- The UI catches it (`useFolderFirstImport.ts:63-66`) and surfaces it via `onError` as a toast.

So the throw happens at **findByPath**, *before* `project.create importLocal` is ever
reached. The detection/branch point must live at or before findByPath, not only in create.

### Existing pieces we can reuse

`utils/resolve-repo.ts` already has the low-level building blocks:
- `gitInitMainBranch` (`:88`) — `git init --initial-branch=main` with a bare `git init` fallback.
- `asInitialCommitTrpcError` (`:69`) — maps git "empty ident"/`user.email`/`user.name`
  failures to a `PRECONDITION_FAILED` with setup instructions.
- `initEmptyRepo` (`:177`) — the "empty project" mode does mkdir + init + empty commit.

We are NOT reusing `initEmptyRepo` (it *creates* a new dir and fails on `EEXIST`). We need
to initialize git **in place** in the user's existing, populated folder.

## Design

Flow: **detect → confirm → init + import**. Never silently init an arbitrary folder the
user pointed at — `git init` writing into their directory is a side effect that deserves
explicit consent.

Three layers:

1. **Server — in-place init helper** (`utils/resolve-repo.ts`)
2. **Server — detection + opt-in init on the import path** (`project.ts` + `handlers.ts`)
3. **Desktop UI — confirm dialog + create-with-init** (`useFolderFirstImport` + a small dialog)

### 1. Server: `initLocalRepoInPlace`

Add to `utils/resolve-repo.ts`:

```ts
/**
 * Initialize git in an EXISTING, populated folder (in place) and resolve it as a
 * local-only project. Unlike initEmptyRepo, this does not mkdir and does not fail
 * if the directory is non-empty — it adopts the user's folder.
 *
 * Guards:
 *  - path must exist and be a directory (validateDirectoryPath)
 *  - path must NOT already be inside a git work tree — re-checked here to close the
 *    TOCTOU window after the UI's detection call (git init is idempotent, but we want
 *    to avoid re-initializing a nested repo's parent by surprise)
 */
export async function initLocalRepoInPlace(repoPath: string): Promise<ResolvedRepo> {
  validateDirectoryPath(repoPath, "Path");

  // Re-check: if it became a git work tree since detection, just resolve it.
  const existingRoot = await tryRevParseGitRoot(repoPath); // returns null instead of throwing
  if (existingRoot) return resolveLocalRepo(existingRoot);

  await gitInitMainBranch(repoPath);            // reuse existing helper
  try {
    await createUserSimpleGit(repoPath).raw([
      "commit", "--allow-empty", "-m", "Initial commit",
    ]);
  } catch (err) {
    throw asInitialCommitTrpcError(err);        // reuse existing PRECONDITION_FAILED mapping
  }
  return resolveLocalRepo(repoPath);            // resolves to { remoteName: null, parsed: null }
}
```

Supporting change: extract a non-throwing variant of the existing `revParseGitRoot`:

```ts
async function tryRevParseGitRoot(path: string): Promise<string | null> {
  try {
    return (await createUserSimpleGit(path).revparse(["--show-toplevel"])).trim();
  } catch {
    return null;
  }
}
// revParseGitRoot stays as the throwing wrapper around tryRevParseGitRoot.
```

**Initial commit is required**, not cosmetic: `ensureMainWorkspaceStrict` needs a real
branch/HEAD. A bare `git init` leaves an unborn branch; the `--allow-empty` initial commit
(same as `initEmptyRepo`) gives the main workspace something to point at.

**Edge — folder nested inside a parent git repo:** `git rev-parse --show-toplevel` succeeds
and resolves to the *parent* root, so detection reports "already a git repo" and we never
offer init — we import the parent root, which is the current behavior. Leave it unchanged.

### 2. Server: detection via `findByPath` + opt-in init on create

**a) Detection — fold into `findByPath`, no separate query.**

`findByPath` is already the single host-service call the import UI makes before create
(`useFolderFirstImport.ts:56`), and it already runs `resolveLocalRepo` (the exact line that
throws on a non-git folder, `project.ts:165`). The idiomatic pattern here is "server returns
a discriminated result, client branches" — exactly how `findByPath` returns `candidates`
today and how the UI's multiple-projects branch (`onMultipleProjects`) works. So make
`findByPath` catch the non-git case and return an additive, optional `needsGitInit` flag
rather than throwing:

```ts
// project.ts findByPath — replace the unconditional resolveLocalRepo(input.repoPath)
const gitRoot = await tryRevParseGitRoot(input.repoPath);
if (gitRoot === null) {
  validateDirectoryPath(input.repoPath, "Path"); // still 400 on missing / not-a-dir
  return { candidates: [], cloudErrors: [], needsGitInit: true as const };
}
const resolved = await resolveLocalRepo(gitRoot); // existing path, now repo-confirmed
```

`needsGitInit` is an optional field defaulting to absent/false — additive to the wire
contract, so existing `walkAllRemotes` callers are unaffected. One round-trip, no new
procedure, and the throw becomes a typed branch.

**b) Opt-in init on create.** Extend the `importLocal` create mode so init only happens
after explicit user consent:

```ts
// project.ts — create input, importLocal variant
z.object({
  kind: z.literal("importLocal"),
  repoPath: z.string().min(1),
  initIfNeeded: z.boolean().optional().default(false),
}),
```

> **Design tension (flag vs. separate mode).** The create modes are a discriminatedUnion
> where each `kind` has fixed init semantics (`empty`/`template` always init,
> `clone`/`importLocal` never), so a behavioral boolean sits slightly against the grain.
> Counter-argument: a separate `initLocal` mode would have an **identical input shape**
> (`{ repoPath }`) to `importLocal`, and discriminated unions are meant to distinguish by
> *shape*, not behavior — two same-shape variants is its own smell. Net: a genuine judgment
> call. **Recommendation: keep the `initIfNeeded` flag** (identical shape ⇒ same mode), but
> this is the one open API-design decision worth a maintainer's sign-off before coding.

```ts
// handlers.ts
export async function createFromImportLocal(
  ctx: HostServiceContext,
  args: { name: string; repoPath: string; initIfNeeded?: boolean },
): Promise<CreateResult> {
  const resolved = args.initIfNeeded
    ? await resolveOrInitLocalRepo(args.repoPath)
    : await resolveLocalRepo(args.repoPath);
  return persistFromResolved(ctx, {
    name: args.name,
    resolved,
    cleanupRepoPathOnFailure: false, // user's folder — never rm it (unchanged)
    repoCloneUrlForCloud: resolved.parsed?.url,
  });
}

// resolveOrInitLocalRepo: resolve if already a repo, else init in place.
async function resolveOrInitLocalRepo(repoPath: string): Promise<ResolvedRepo> {
  const root = await tryRevParseGitRoot(repoPath);
  return root ? resolveLocalRepo(root) : initLocalRepoInPlace(repoPath);
}
```

Cloud side needs **no change**: a freshly-init'd repo has `parsed: null`, so
`repoCloneUrlForCloud` is `undefined` — the cloud `v2Project.create` schema already marks
`repoCloneUrl` optional for "local-only imports have no remote yet" (the path `empty` and
`template` modes already exercise).

**Rollback note:** `persistFromResolved` keeps `cleanupRepoPathOnFailure: false`, so we never
delete the user's folder. We *do* leave behind the `.git` we created if the cloud/workspace
saga later fails — acceptable, and re-running import simply resolves the now-existing repo.
Do not add `.git` teardown (risky).

### 3. Desktop UI: confirm dialog + create-with-init

Branch on the `needsGitInit` flag already returned by `findByPath` (no extra call):

```ts
const response = await client.project.findByPath.query({ repoPath });
if (response.needsGitInit) {
  const confirmed = await options?.onConfirmGitInit?.({ repoPath }); // modal owns the dialog
  if (!confirmed) return null;
  const result = await client.project.create.mutate({
    name: getBaseName(repoPath),
    mode: { kind: "importLocal", repoPath, initIfNeeded: true },
  });
  finalizeSetup(activeHostUrl, result);
  return result;
}
// else: existing candidates → setup/create flow, unchanged
```

**Implementation note (as built):** `useFolderFirstImport` has **5 consumers**, not one host
modal, so threading an `onConfirmGitInit` callback through all of them is the wrong shape.
Instead the confirm is encapsulated entirely in the hook via a small v2-owned imperative
zustand store (`renderer/stores/git-init-confirm.ts`, mirroring the `add-repository-modal`
promise-resolve pattern): the hook calls `await requestGitInit(repoPath)`. The dialog
(`GitInitConfirmDialog`) is rendered once via `AddRepositoryModals` (already mounted once in
the dashboard layout). All 5 call sites are untouched.

- Render a **dedicated confirm dialog** (shared `ui` alert-dialog) so the import flow owns its
  own UI. Do not wire into the existing global git-init dialog store — it drives a different
  (v1) project-creation path. Init must go through host-service `project.create` so the result
  is a v2 project.
  > "<folderName> isn't a git repository yet. Initialize git here and import it?"
  > [Cancel] [Initialize & import]
  Per `apps/desktop/AGENTS.md`, rendered error text needs `select-text cursor-text`
  (sonner toasts are exempt).
- Surface the `PRECONDITION_FAILED` "Git user is not configured…" message verbatim if the
  initial commit fails — it's actionable.

## Files to touch

| File | Change |
| --- | --- |
| `packages/host-service/src/trpc/router/project/utils/resolve-repo.ts` | Add `tryRevParseGitRoot`, `initLocalRepoInPlace`; export `validateDirectoryPath`; refactor `revParseGitRoot` to wrap the non-throwing variant |
| `packages/host-service/src/trpc/router/project/handlers.ts` | `createFromImportLocal` accepts `initIfNeeded`; add `resolveOrInitLocalRepo` |
| `packages/host-service/src/trpc/router/project/project.ts` | `findByPath` returns optional `needsGitInit` instead of throwing on non-git; add `initIfNeeded` to `importLocal` create input; thread into handler call |
| `apps/desktop/.../AddRepositoryModals/hooks/useFolderFirstImport/useFolderFirstImport.ts` | Branch on `needsGitInit`; `await requestGitInit(repoPath)`; create with `initIfNeeded: true` |
| `apps/desktop/src/renderer/stores/git-init-confirm.ts` (new) | Imperative confirm store (`request`/`resolve`) |
| `apps/desktop/.../AddRepositoryModals/components/GitInitConfirmDialog/` (new) | Confirm dialog, store-driven |
| `apps/desktop/.../AddRepositoryModals/AddRepositoryModals.tsx` | Mount `<GitInitConfirmDialog />` alongside `NewProjectModal` |

## Tests

Extend `utils/resolve-repo.test.ts` (already covers "no remotes at all" / "gitlab origin"):
- `initLocalRepoInPlace` initializes a non-git temp dir → returns `{ remoteName: null, parsed: null }`, HEAD on `main`, exactly one commit.
- Adopts a folder with existing files (does not error on non-empty, unlike `initEmptyRepo`).
- Idempotent: pointed at an already-initialized repo → resolves it, no second init/commit.
- Nested-folder case: a subdir inside an existing repo resolves to the parent root (no init).
- Missing path / file (not dir) → `BAD_REQUEST`.
- Initial-commit failure with unset `user.email`/`user.name` → `PRECONDITION_FAILED` with setup text.

Handler/router:
- `findByPath` on a non-git dir returns `{ candidates: [], needsGitInit: true }` (no throw); on a repo it behaves exactly as today (no `needsGitInit`).
- `findByPath` still 400s on a missing path / non-directory.
- `createFromImportLocal({ initIfNeeded: true })` on a non-git dir creates a local-only project + main workspace; with `initIfNeeded: false` (default) it still throws `Not a git repository` (back-compat).

## Out of scope / explicitly unchanged

- Remote-less *git* repos already import fine — untouched.
- `resolveGithubRepo` (the "no GitHub remote" throw) stays GitHub-feature-only (PRs/Issues).
- No auto-init without explicit user confirmation.

## Open questions

1. **`initIfNeeded` flag vs. separate `initLocal` mode** — the one API-shape decision worth a
   maintainer's sign-off (see "Design tension" above). Plan recommends the flag because the
   input shape is identical to `importLocal`.
2. **`.git` left behind on saga rollback** — accept (recommended) vs. tear down the `.git` we
   created when the cloud/workspace step fails.
