# Unified Version Bumping

Make **desktop, host-service, and cli** ship one shared version, enforced in CI.
`pty-daemon` is **deliberately excluded** — it keeps its own monotonic `0.x`
track (see "Why the daemon stays separate").

## One way to run it

The toolchain is TypeScript (run by Bun, no build step) under `scripts/release/`.
`bun run release` (`scripts/release/release.ts`) is the single entry point:

- `bun run release` — interactive menu (Desktop / CLI hotfix), TTY only
- `bun run release desktop [version] [commit] [--publish] [--merge] [--daemon] [--republish]`
- `bun run release cli [suffix] [--daemon] [--no-tag]`
- `bun run release check` — verify versions are unified (exit 1 on drift)

All flows and the CI guard read **one** source of truth, `scripts/release/lib.ts`
(`UNIFIED_PACKAGES` + the version primitives), so the desktop flow, CLI flow, and
`check-versions` can't drift. Pure logic is unit-tested (`bun run test:release`)
and everything typechecks (`bun run typecheck:release`).

**Agent-runnable:** every action is reachable non-interactively via subcommands +
flags. Prompts only fire on a TTY; without one (e.g. an agent), the flow fails
with guidance (pass a version, `--republish`) instead of hanging. Flows also
export `runDesktop` / `runCli` for programmatic use.

## Rules

- **Desktop is the ceiling.** It is always a plain `MAJOR.MINOR.PATCH` release.
- `host-service` and `cli` **base** (strip any `-N` suffix) must equal desktop.
- `host-service` **must equal** `cli` (they ship as one bundle).
- Interim CLI releases add a prerelease suffix: `1.14.0-1`, `1.14.0-2`, … These
  sort **below** `1.14.0` in semver, so the CLI never ships above desktop.

## One-time snap

`host-service 0.8.26 → 1.14.0`, `cli 0.2.24 → 1.14.0` (desktop already 1.14.0).
`bun.lock` refreshed. From here on all three move together.

## Desktop release (`scripts/release/desktop.ts`)

Every desktop bump now sets **desktop + host-service + cli** to the same new
version (was: desktop + host-service patch-bump). Both the normal and
commit/worktree paths refresh `bun.lock` and commit all three package.jsons.

Commit: `chore(desktop): bump version to X (host-service a -> X, cli b -> X)`.

## Interim CLI release (`scripts/release/cli.ts`, `bun run release cli`)

Between desktop releases, ship a CLI-side fix without a desktop release:

- Base = current desktop version `D`.
- Suffix auto-increments: if cli is `D-N` → `D-(N+1)`, else `D-1`.
- Sets `cli` + `host-service` to `D-N`, refreshes lock, commits.
- `--daemon` also **patch-bumps `pty-daemon`** on its own track (e.g. `0.2.5 →
  0.2.6`) so the release can carry a daemon fix. The daemon never takes the
  `D-N` version (see below).
- Tags `cli-v D-N` → triggers `release-cli.yml` (bundles host-service).

`bun run release cli [suffix] [--daemon] [--no-tag]`.

## Why the daemon stays separate

The daemon version is **load-bearing**: `EXPECTED_DAEMON_VERSION` (from
`pty-daemon/package.json`) drives host-service's adopt/handoff — a bump forces a
live fd-handoff of all sessions. Two problems if it joined the unified scheme:

1. **Semver inversion.** An interim daemon at `1.14.0-1` sorts *below* desktop's
   bundled `1.14.0`. Since the daemon socket is keyed on orgId only, a
   shared-org desktop would see `satisfies("1.14.0-1", ">=1.14.0") == false` and
   re-upgrade it **every launch**. On its own track a fix (`0.2.6`) is *above*
   everyone, so it wins the handoff once and sticks.
2. **Needless churn.** Forcing daemon == desktop would hand off every session on
   every desktop release even when the daemon binary is byte-identical.

So the daemon moves only when it actually changes (`--daemon`), on `0.x`, and is
excluded from `check-versions`.

## Enforcement (`scripts/release/check-versions.ts`, CI `Version Sync` job)

Fails if base(host-service) ≠ desktop, base(cli) ≠ desktop, or host-service ≠ cli.
The `Version Sync` job in `.github/workflows/ci.yml` typechecks the release
scripts, runs their unit tests, and runs the check.

## Release-time diff check (the "ensure future changes bump" guarantee)

Nudges/CI comments are skippable, so enforcement lives at the **release
chokepoint** (`bun run release`, which can't be bypassed). Both flows:

- **Report** what changed since the previous release of the stream
  (`releaseDiffReport`), so you see what's shipping.
- **Hard-block** if `pty-daemon/src` changed since its last version bump but the
  release isn't bumping it (`guardDaemonBump`) — otherwise old daemons never
  go `updatePending` and the fix silently doesn't ship. Detection is
  commit-based (`daemonNeedsBump`), so it's accurate regardless of tags.
- `--daemon` (now on **both** `desktop` and `cli` flows) patch-bumps pty-daemon
  and clears the guard.

For a real guarantee, mark the CI **Version Sync** job as a *required* status
check in branch protection — an advisory check is skippable.

## Risks / notes

- **Homebrew:** `bump-homebrew.yml` already accepts `-<prerelease>` tags
  (regex `(-[A-Za-z0-9.]+)?`). First interim release should be spot-checked —
  Homebrew's `version "1.14.0-1"` parsing is untested here.
- **Shared daemon socket:** handled by keeping pty-daemon on its own track — see
  "Why the daemon stays separate".
- `bun.lock` stores workspace `version` fields; scripts refresh it with
  `bun install --lockfile-only` so `--frozen` CI installs stay consistent.
