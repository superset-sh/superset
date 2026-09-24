# P1-C — the fix

## Shape

One chokepoint already existed: every lifecycle sink (setup, teardown, run, cwd) resolves its
commands through `loadSetupConfig()`. The guard goes there, so all nine-plus call sites — and any
future one — are safe without being touched.

New module `apps/desktop/src/lib/trpc/routers/workspaces/utils/lifecycle-trust/` holds the rule:

- `LifecycleConfigSource` — `user-config` | `local-config` | `main-repo` | `worktree`.
- `isTrustedLifecycleSource()` — trusts the first three; **`worktree` is never trusted**, because it
  is the content of whatever branch the workspace is on.
- `applyLifecycleTrustBoundary()` — deletes `setup`/`teardown`/`run`/`cwd` from an untrusted
  `config.json`, recording each drop. It *deletes* rather than empties so the resolver's
  `override.x ?? base.x` merge falls back to the trusted config underneath instead of silently
  disabling a project's real setup script.
- `applyLocalLifecycleTrustBoundary()` — same rule for the `config.local.json` overlay, discarding
  an untrusted one whole (returning `null`) so it cannot shadow the main repo's overlay with
  nothing.

`setup.ts` threads a source tag through `readConfigFromPath`/`readLocalConfigFromPath`, and
`loadSetupConfig()` is now a thin wrapper over `resolveLifecycleConfig()`, which additionally
returns `rejected[]` and logs a `[lifecycle-trust]` warning per dropped field — the signal a future
consent UI needs.

## Why trust is path-based, not filename-based

`.gitignore` lists `.superset/config.local.json`, and the first draft of this fix leaned on that to
treat the overlay as user-controlled. That is wrong: a branch can `git add -f` the file, and once
tracked, gitignore is irrelevant — a full bypass of the boundary. Trust therefore follows **where
the file was read from**, and the worktree's overlay is untrusted regardless of its name. Covered by
`teardown.test.ts` › "a branch cannot smuggle teardown via a force-added config.local.json", which
fails on pre-fix code.

## Why not escaping

See `verify.md` §5 — the entries are shell command lines by design, so there is nothing to escape;
the defect is provenance.

## Behaviour change

A branch can no longer set its own lifecycle commands or `cwd`. Land them on the default branch, or
use the main repo's gitignored `config.local.json`. Five pre-existing tests asserted the old
worktree-wins precedence (two in `teardown.test.ts`, three in `setup.test.ts`) and were rewritten to
assert the boundary.

## Checks

| Check | Before fix | After fix |
|---|---|---|
| `evidence/exploit-poc.test.ts` | 0 pass / 2 fail (both exploits succeed; teardown PoC really creates its marker) | 2 pass / 0 fail |
| `teardown.test.ts` + `setup.test.ts` + `lifecycle-trust/` | 59 pass / **9 fail** | **68 pass / 0 fail** |
| `bun test` (apps/desktop, 453 files) | — | **7635 pass, 1 skip, 0 fail** |
| `bun run typecheck` (apps/desktop) | — | clean |
| `biome check` on changed dir | — | clean |
