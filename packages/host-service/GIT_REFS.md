# Git ref handling

Pattern + rules for working with git refs in the host-service. Written after a real bug where `ref.startsWith("origin/")` misclassified a local branch named `origin/foo` as remote-tracking.

## The bug class

Git ref names come in two forms:

- **Full** — `refs/heads/foo`, `refs/remotes/origin/foo`, `refs/tags/v1.0`. The prefix is a structural namespace; it cannot appear inside a name.
- **Short** — `foo`, `origin/foo`, `v1.0`. The prefix here is part of the *user* namespace; it absolutely can appear inside a name.

Inferring ref type from a short string is unsafe:

```ts
// BUG: a local branch named `origin/foo` falls through this check.
if (ref.startsWith("origin/")) { /* treat as remote-tracking */ }
```

Inferring from a full refname is safe:

```ts
// OK: nothing under refs/heads/ can also be in refs/remotes/.
if (refname.startsWith("refs/heads/")) { /* local */ }
```

This pattern repeats: branch names that contain `/` (`origin/foo`, `feature/origin/...`), branches named the same as a tag, branches named `HEAD`. Whenever ref type is decided from short input, ambiguity creeps in.

## The principle

> Classify a ref **once**, at the boundary, against the **full refname**. Carry the type tag with the value forever after. Downstream code reads the tag — never re-derives type from a string.

This is exactly how mature git apps do it.

## Prior art

**GitHub Desktop** (`~/workplace/desktop/app/src/`):

- `models/branch.ts:7-62` — `class Branch { type: BranchType; ref: string; ... }`. `ref` is the full refname; `type` is `BranchType.Local | BranchType.Remote`.
- `lib/git/for-each-ref.ts:53-55` — classification site: `type = ref.fullName.startsWith('refs/heads') ? Local : Remote`. Done once at parse.
- `lib/git/refs.ts:14-26` — `formatAsLocalRef()` normalizes user input to a full refname *before* downstream operations. Worth porting.

**VSCode Git extension** (`~/workplace/vscode/extensions/git/src/`):

- `api/git.d.ts:23-47` — `interface Ref { type: RefType; remote?: string; ... }` with `enum RefType { Head, RemoteHead, Tag }`. Field `remote` is only meaningfully set when `type === RemoteHead`.
- `git.ts:1330-1340` — three mutually exclusive regexes against the full refname assign `type` once.

Both apps converge on the same model. Difference: GitHub Desktop is class-based with an enum; VSCode is interface-based with a flat `Ref` type. Neither uses a TypeScript-discriminated union — partly age, partly API stability.

## Our shape

A discriminated union does it stronger than either reference, because the compiler refuses to let you read remote-only fields without narrowing first.

```ts
// packages/host-service/src/runtime/git/refs.ts (planned location)

export type ResolvedRef =
  | { kind: "local";          fullRef: `refs/heads/${string}`;          shortName: string }
  | { kind: "remote-tracking"; fullRef: `refs/remotes/${string}/${string}`; shortName: string; remote: string }
  | { kind: "tag";            fullRef: `refs/tags/${string}`;           shortName: string }
  | { kind: "head" };

// Probes against full refnames; ambiguity impossible.
export async function resolveRef(
  git: SimpleGit,
  userInput: string,
): Promise<ResolvedRef>;

// Vendored from GitHub Desktop's formatAsLocalRef.
export function asLocalRef(name: string): `refs/heads/${string}`;
```

Callers consume the tag:

```ts
const r = await resolveRef(git, branchInput);
switch (r.kind) {
  case "local":           /* git worktree add <path> <r.shortName> */
  case "remote-tracking": /* git fetch r.remote r.shortName, then --track -b */
  case "tag":             throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot create workspace from a tag" });
  case "head":            /* fallback path */
}
```

There is no place in the consumer that does `.startsWith("origin/")` — the bug class is removed, not avoided.

## What to vendor

If we copy code from these repos, attribute and licence-check first (both MIT). Specific files worth porting or directly translating:

- `~/workplace/desktop/app/src/lib/git/refs.ts` — `formatAsLocalRef`, `formatAsRemoteRef`, refspec helpers.
- `~/workplace/desktop/app/src/lib/git/for-each-ref.ts` — parsing pattern, format string, classification site.
- `~/workplace/desktop/app/src/lib/git/reflog.ts` — already loosely vendored (recency parsing) for the branch picker; same source.

VSCode is harder to vendor (deeply tied to their VS Code API surface), but worth reading for the discriminated approach.

## TypeScript guarantees

The point of the discriminated union is that the compiler does the work, not the reviewer. Five rules to keep that property:

### 1. Always narrow with `switch`, not `if` chains

`switch (r.kind)` lets the compiler enforce exhaustiveness via the `never` trick:

```ts
function handle(r: ResolvedRef): string {
  switch (r.kind) {
    case "local":            return r.shortName;
    case "remote-tracking":  return `${r.remote}/${r.shortName}`;
    case "tag":              return r.shortName;
    case "head":             return "HEAD";
    default: {
      const _exhaustive: never = r;  // compile error if a new kind is added
      throw new Error(`unhandled ref kind: ${_exhaustive}`);
    }
  }
}
```

Add a `default: { const _: never = r }` branch in every consumer. When we add `kind: "stash"` later, every call site fails to compile until updated. Cheaper than test coverage.

### 2. Don't make fields optional that are required for a kind

Bad:
```ts
type Ref = { kind: "local" | "remote-tracking" | "tag" | "head"; remote?: string; ... }
```

Now `ref.remote` is `string | undefined` everywhere — defeats the point. The narrowing only works when `remote` is **only present in the variant where it's required**:

```ts
type ResolvedRef =
  | { kind: "remote-tracking"; remote: string; ... }  // required, not optional
  | { kind: "local"; ... }                            // not present at all
```

After narrowing on `kind === "remote-tracking"`, `ref.remote` is `string`, no `!` needed.

### 3. Template-literal `fullRef` types are worth it on `ResolvedRef`, not on general inputs

```ts
fullRef: `refs/heads/${string}`
```

This doesn't validate at runtime — git could hand us a wrong-shaped string and TS wouldn't notice. The value is at the *caller* boundary: if downstream code tries to assign `someShortName` (typed as plain `string`) into a `` `refs/heads/${string}` `` slot, the compiler catches it. The mistake gets surfaced at the assignment, not three function calls later when something silently mis-resolves.

Use template-literal types for `fullRef` and `asLocalRef`'s return type. Don't use them on user-facing parameters (everyone passes `string` and you'd need brand assertions everywhere — friction without payoff).

### 4. Type-only re-exports across package boundaries

```ts
// runtime/git/refs.ts
export type { ResolvedRef } from "./refs";
export { resolveRef, asLocalRef } from "./refs";
```

Callers can `import type { ResolvedRef }` without dragging the runtime in. Matters when the renderer wants the type for prop shapes but doesn't need (and can't run) the simple-git wrapper.

### 5. Type guards as last resort, not first

If you find yourself writing:

```ts
function isRemoteTracking(r: ResolvedRef): r is Extract<ResolvedRef, { kind: "remote-tracking" }> {
  return r.kind === "remote-tracking";
}
```

you've already lost — `r.kind === "remote-tracking"` already narrows TS-natively. Type guards are only useful when narrowing crosses a function boundary (rare for this module). Skip them by default.

## Enforcement

Two layers:

1. **Type system** (above) — once `ResolvedRef` exists and the helpers consume it, downstream code can't reintroduce the bug for *new* call sites. The compiler narrows correctly. The exhaustive-switch pattern catches breakage when the union grows.

2. **Lint** — Biome rule banning `\.startsWith\(['"]origin/` and `\.startsWith\(['"]refs/remotes/origin/` outside of `runtime/git/refs.ts`. There's no legitimate use of that string check elsewhere — every match is the smoking gun for this bug class. Cheap belt-and-suspenders for grep-style audits.

Add the rule as part of the refactor PR, not after — otherwise it'll never get added.

## V1 cleanup

The v1 desktop tRPC routers (`apps/desktop/src/lib/trpc/routers/**`) still use string-based ref handling and have known instances of the bug class. They're excluded from the lint rule for now (see `scripts/check-git-ref-strings.sh`). The reason: v1 and v2 deliberately diverge during the migration window, and porting v1 to `ResolvedRef` is meaningful work that doesn't belong in the same PR as the v2 refactor. When v1 either migrates or sunsets, drop the exclusion and the rule covers everything.

## Open questions

- **Multi-remote support.** Today `origin` is hardcoded everywhere. The discriminated union encodes `remote: string` so the data model is ready, but `resolveRef` would need to enumerate remotes from `git remote` rather than probing only `refs/remotes/origin/`. Punt until we actually support more than one remote, but make sure the API doesn't bake in `origin`.
- **Tag handling.** Today nothing in the workspace-creation flow accepts tags. The union includes `tag` so we have a clear failure mode (`throw "cannot start workspace from a tag"`) instead of silently mis-resolving.
- **Refnames as template literal types.** `` `refs/heads/${string}` `` looks neat but adds friction at boundaries (anywhere we pull a string from git). Worth it for `ResolvedRef` itself; not worth it for general string parameters.
