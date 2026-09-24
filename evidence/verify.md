# P1-A — host-service filesystem path-confinement: verification

Repo: superset-sh/superset · branch `superset/p1-a-host-service-fs-confinement-4b124699`
Base commit: `65da26d` · Date: 2026-09-24 · Read-only pass, quotes are verbatim from that tree.

## Blocker: advisory bodies unavailable

The prescribed command failed for all three IDs — the session token is the
`superset-app[bot]` installation, which lacks the repository-security-advisories scope:

```
$ gh api repos/superset-sh/superset/security-advisories/GHSA-6223-9p9j-gwf2 --jq .description
{"message":"Resource not accessible by integration", ... "status":"403"}
$ gh api repos/superset-sh/superset/security-advisories
[]
```

Consequence: I could not read the reporters' own PoCs, affected-version ranges, or the
rg8v/9v86 duplicate determination from the advisory text. Everything below is verified
against the **claims as stated in the task** plus the code. The duplicate call in §3 is
therefore an inference from code, not a reading of the two advisory bodies.

Secondary limitation: this checkout has a squashed single-commit history
(`git log --oneline | wc -l` → `1`), so `git log -S` / blame cannot date the code
comments quoted below.

## Call chain (established first, so the "real code path" is not in doubt)

`filesystem.*` tRPC procedure
→ `packages/host-service/src/trpc/router/filesystem/filesystem.ts` `getFilesystemService(ctx, workspaceId)`
→ `packages/host-service/src/runtime/filesystem/filesystem.ts:67` `getServiceForWorkspace`
→ `:103` `getServiceForRootPath` → `createFsHostService({ rootPath })` where `rootPath = workspace.worktreePath` (`:52`)
→ `packages/workspace-fs/src/host/service.ts` → `packages/workspace-fs/src/fs.ts`

`apps/desktop/src/lib/trpc/routers/workspace-fs-service.ts:56-64` builds the same
`createFsHostService` for the desktop-local path, so both surfaces share `fs.ts`.
`fs.ts`'s exported ops have no consumer outside `host/service.ts` — blast radius is contained.

---

## 1. GHSA-6223-9p9j-gwf2 (High) — readFile / listDirectory / getMetadata read arbitrary absolute paths

**CONFIRMED.**

The exemption is explicit and deliberate in-code — `packages/workspace-fs/src/fs.ts:390-395`:

```ts
// Read-only operations (listDirectory, readFile, getMetadata) are not
// confined to the workspace root: terminals and agents routinely reference
// files anywhere on the host, and viewing them is within the caller's trust
// model (statPath/browseHost already expose arbitrary host paths). Mutations
// remain strictly confined to the root.
```

`listDirectory` (`fs.ts:396-403`) takes no `rootPath` parameter at all:

```ts
export async function listDirectory({
	absolutePath,
	signal,
}: {
	absolutePath: string;
	signal?: AbortSignal;
}): Promise<FsEntry[]> {
	const targetPath = normalizeAbsolutePath(absolutePath);
```

`getMetadata` (`fs.ts:509-515`) likewise:

```ts
export async function getMetadata({
	absolutePath,
}: {
	absolutePath: string;
}): Promise<FsMetadata | null> {
	const targetPath = normalizeAbsolutePath(absolutePath);
```

`readFile` (`fs.ts:459-465`) receives `rootPath` but gates the only guard behind a
conditional, so an explicitly out-of-root path skips validation entirely:

```ts
	const targetPath = normalizeAbsolutePath(absolutePath);
	// Explicit outside-root paths are readable, but a path that lexically sits
	// inside the workspace must also physically resolve there — ...
	if (isPathWithinRoot(rootPath, targetPath)) {
		await assertRealpathWithinRoot(rootPath, targetPath);
	}
```

The wiring matches: `host/service.ts:171-193` forwards `rootPath` to `readFile` but omits
it for `listDirectory` and `getMetadata` (it is not in their signatures).

**PARTIAL nuance, recorded honestly:** the *symlink-disguise* half of the read surface is
already defended for `readFile` — an in-root path whose realpath leaves the root is
rejected (`fs.test.ts:155` "rejects in-root symlinks that resolve outside the workspace
root"). What is unguarded is the **direct absolute path** case the advisory names. That
matches the advisory claim, so the item is CONFIRMED, not PARTIAL.

**This behaviour is currently pinned as intended policy by a test** —
`packages/host-service/test/integration/bug-hunt.integration.test.ts:6-10` and `:78`:

```
 * The filesystem section also pins the intended sandbox policy in both
 * directions: reads are host-wide (viewing files a terminal/agent referenced
 * outside the workspace), mutations are confined to the workspace root. An
 * "allows" test failing means the read policy regressed, not that a defense
 * appeared.
```
```ts
	test("readFile allows viewing paths outside the workspace root", async () => {
```

So GHSA-6223 is a **policy reversal**, not a missed guard: the advisory (High) overrules a
documented deliberate decision. Fixing it necessarily rewrites that comment and inverts
that test. Flagged prominently rather than done silently — see "Behaviour change" below.

## 2. GHSA-9v86-rjhr-mqw6 (High) — movePath / copyPath escape the root via symlink ancestors

**CONFIRMED.**

Both ops validate the path *lexically only*. `movePath` (`fs.ts:917-924`):

```ts
	const sourcePath = ensureWithinRoot({
		rootPath,
		absolutePath: sourceAbsolutePath,
	});
	const destinationPath = ensureWithinRoot({
		rootPath,
		absolutePath: destinationAbsolutePath,
	});
```

`copyPath` (`fs.ts:950-957`) is byte-identical in its guard, then `fs.cp(sourcePath,
destinationPath, { recursive: true })` (`:959`).

`ensureWithinRoot` (`fs.ts:78-93`) is purely lexical — `normalizeAbsolutePath` +
`isPathWithinRoot`, no `realpath`:

```ts
	if (!isPathWithinRoot(normalizedRootPath, normalizedAbsolutePath)) {
		throw new WorkspaceFsPathError(
			`Path is outside workspace root: ${normalizedAbsolutePath}`,
			"INVALID_TARGET",
		);
	}
```

Every *other* mutation in the file pairs that lexical check with a physical one —
`writeFile` `fs.ts:561-562`, `createDirectory` `:640-644`, `createUniqueEntry` `:719-722`,
`deletePath` `:903` all call `assertRealpathWithinRoot` / `assertParentWithinRoot`.
`movePath` and `copyPath` are the only two that do not. So a workspace containing
`escape -> /outside` makes `<root>/escape/x` pass `ensureWithinRoot` while physically
landing outside the worktree.

No existing test covers it: `fs.test.ts:695-746` (`describe("movePath")`) has only
rename/ENOENT/destination-exists cases, and there is no `describe("copyPath")` symlink case.

## 3. GHSA-rg8v-v9gh-vwpq (Medium) — duplicate of 9v86?

**CONFIRMED as the same defect — duplicate, with the caveat in the Blocker section.**

I could not read either advisory body, so this is a code-level judgement: there is exactly
one defect class in `movePath`/`copyPath` — the missing physical (realpath/ancestor)
check next to `ensureWithinRoot` — and it is shared by both functions through identical
code. There is no second, distinct escape in those two ops. A single guard closes both
advisories, which is consistent with rg8v being the lower-severity duplicate report of
9v86. Recommend closing rg8v as a duplicate.

---

## Exploit outcomes on the unfixed tree

`evidence/exploit-poc.test.ts` drives the real `createFsHostService` (the exact object the
RPC handler calls). Each test asserts the **secure** outcome, so 6/6 failing = 6/6 exploits
succeeded. Full log: `evidence/before-exploit.txt`.

```
[readFile] threw= false leaked= PRIVATE KEY MATERIAL
[listDirectory] threw= false entries= [ "secret.txt" ]
[getMetadata] threw= false meta= {"absolutePath":".../ghsa-outside-.../id_rsa","kind":"file",...}
[movePath] threw= false escapedFileContent= MOVED OUT OF WORKSPACE
[copyPath] threw= false escapedFileContent= COPIED OUT OF WORKSPACE
[copyPath source] threw= false stolen= PRIVATE KEY MATERIAL
 0 pass
 6 fail
```

The last case is the most severe of the move/copy set: it copies a file from outside the
workspace *into* the workspace through a symlinked ancestor, i.e. exfiltration into a
directory the agent/user can then read over the ordinary (confined) read path.

## Verdict summary

| Advisory | Claim | Verdict |
|---|---|---|
| GHSA-6223-9p9j-gwf2 | readFile/listDirectory/getMetadata read arbitrary absolute paths | **CONFIRMED** (deliberate documented policy, overruled by the advisory) |
| GHSA-9v86-rjhr-mqw6 | movePath/copyPath escape root via symlink ancestors | **CONFIRMED** |
| GHSA-rg8v-v9gh-vwpq | same as above | **CONFIRMED — duplicate of 9v86** |

## Behaviour change the fix introduces (deliberate, flagged)

Confining the read ops means a workspace-scoped `readFile`/`listDirectory`/`getMetadata`
can no longer open a host file outside the worktree. The host-wide surfaces named in the
old comment — `browseHost` (`router/filesystem/filesystem.ts:149`) and `statPath` (`:289`)
— are *separate* procedures with their own documented rationale and are **left as-is**;
they are outside these advisories' scope. The user-visible loss is that clicking a terminal
link pointing outside the worktree (e.g. `/usr/local/bin/node`, a stack frame in a system
path) will no longer open in the file viewer. That is the cost of the advisory's ruling and
is called out here rather than buried.

---

# Fix, and verification of the fix

## Shape

One gate, `resolveConfinedPath` in `packages/workspace-fs/src/fs.ts`, replaces the
scattered per-op guards. Every workspace-scoped op routes its paths through it:

```ts
async function resolveConfinedPath(
	rootPath: string,
	absolutePath: string,
	confinement: PathConfinement,
): Promise<string> {
	const targetPath = ensureWithinRoot({ rootPath, absolutePath });
	const isRoot = targetPath === normalizeAbsolutePath(rootPath);
	if (confinement === "follow-final" || isRoot) {
		await assertRealpathWithinRoot(rootPath, targetPath);
	} else {
		await assertParentWithinRoot(rootPath, targetPath);
	}
	return targetPath;
}
```

Lexical containment first, then physical (realpath) containment — the two halves that
`movePath`/`copyPath` were missing. The `PathConfinement` mode is not a security knob: both
modes confine. It distinguishes ops that read/write *through* the final component
(`open`, `readdir`) from ops that act on the component itself (`lstat`, `rename`), where
only the ancestor chain can escape and where realpath-ing the final component would break
legitimate handling of in-root symlinks. The `isRoot` branch exists because the workspace
root's parent is by definition outside the root.

Call sites now on the gate: `readFile`, `listDirectory` (follow-final); `getMetadata`,
`movePath` (source+dest), `copyPath` (source+dest) (link-itself); plus `writeFile`,
`createDirectory`, `createUniqueEntry` converted from the identical
`ensureWithinRoot` + `assertRealpathWithinRoot` pair — behaviour-identical, but it makes the
gate the one entry point so a newly added op is confined by default.

Plumbing: `listDirectory` and `getMetadata` gained a `rootPath` parameter, and
`packages/workspace-fs/src/host/service.ts` now passes `rootPath` to both (it already did
for every other op). Because `createFsHostService` is shared, the desktop-local RPC router
(`apps/desktop/src/lib/trpc/routers/workspace-fs-service.ts`) is fixed by the same change.

Deliberately **not** touched: `browseHost` and `statPath` in the host-service filesystem
router. Both are separate, explicitly host-wide procedures with their own documented
rationale, and neither is named by these advisories. Narrowing them is a product decision
outside this task's scope.

## Out-of-scope observation (not fixed, not part of any advisory)

`deletePath` (`fs.ts:919-924`) runs `ensureWithinRoot` and then, when a `trashItem` handler
is supplied, calls it **before** any physical check — so it shares the move/copy defect
class for the trash path. host-service supplies no `trashItem`, so the host-service RPC
surface is unaffected. Recorded here rather than silently widening this change.

## Before / after

| Check | Before | After |
|---|---|---|
| `bun test evidence/exploit-poc.test.ts` (6 exploits, asserts the secure outcome) | **0 pass / 6 fail** — all six exploits succeeded (`evidence/before-exploit.txt`) | **6 pass / 0 fail** (`evidence/after-exploit.txt`) |
| `bun test src/path-confinement.test.ts` (regression suite) | **5 pass / 7 fail** (`evidence/before-regression.txt`) | **12 pass / 0 fail** (`evidence/after-regression.txt`) |

The 7 pre-fix failures are exactly the 7 security assertions; the 5 that passed in both
states are the legitimate-flow tests (in-root read/list/metadata, in-root rename, in-root
copy, root-directory metadata, in-root symlink metadata), which is the point — they prove
the fix does not break first-party flows.

## Other checks

- `packages/workspace-fs`: `bun run typecheck` clean; `bun test` **158 pass / 2 skip / 0 fail**.
- `packages/host-service`: `bun run typecheck` clean.
- `apps/desktop`: `bun run typecheck` clean (exit 0) — covers the shared desktop consumer.
- Targeted: workspace-fs `path-confinement` + `fs` + `host/service` → **54 pass / 0 fail**;
  host-service `bug-hunt` + `filesystem` integration → **32 pass / 0 fail**.
- `bunx biome check` clean on all changed files.

### Pre-existing unrelated failure

The full `packages/host-service` suite reports **2093 pass / 8 todo / 1 fail**. The single
failure is:

```
(fail) health.check > serialises the current boot's stamps and the runtime in sandbox mode
```

Verified pre-existing and unrelated: with this change stashed (`git stash push --
packages/workspace-fs/src/fs.ts packages/workspace-fs/src/host/service.ts`), that file
still reports `1 pass / 1 fail` with the identical failing test name. Unstashed, identical
again. It touches boot stamps in sandbox mode, not the filesystem path.

## Tests changed, and why

Two tests pinned the old host-wide read policy and had to be inverted — called out
explicitly because inverting a test is how a real regression gets hidden:

- `packages/workspace-fs/src/fs.test.ts` — `"reads files outside the workspace root"`
  → `"rejects files outside the workspace root"`.
- `packages/host-service/test/integration/bug-hunt.integration.test.ts` —
  `"readFile allows viewing paths outside the workspace root"` → `"…rejects…"`, and
  `"listDirectory allows absolute paths outside workspace root"` → `"…rejects…"`. The
  suite's header comment and describe title, which stated the host-wide read policy as
  intended, were rewritten. A new `"listDirectory still enumerates the workspace root
  itself"` test was added so the inverted pair cannot pass vacuously.
