# Unified Version Bumping

Make **desktop, host-service, and cli** ship one shared version, enforced in CI.
`pty-daemon` is **deliberately excluded** — it keeps its own monotonic `0.x`
track (see "Why the daemon stays separate").

## One way to run it

The toolchain is TypeScript (run by Bun, no build step) under `scripts/release/`.
`bun run release` (`scripts/release/release.ts`) is the single entry point:

- `bun run release` — interactive menu (Desktop / CLI hotfix), TTY only
- `bun run release desktop [version] [commit] [--publish] [--merge] [--daemon] [--republish]`
- `bun run release cli [version] [--daemon] [--no-tag]`
- `bun run release check` — verify versions are unified (exit 1 on drift)

All flows and the CI guard read **one** source of truth, `scripts/release/lib.ts`
(`UNIFIED_PACKAGES` + the version primitives), so the desktop flow, CLI flow, and
`check-versions` can't drift. Pure logic is unit-tested (`bun run test:release`)
and everything typechecks (`bun run typecheck:release`).

**Agent-runnable:** every action is reachable non-interactively via subcommands +
flags. Prompts only fire on a TTY; without one (e.g. an agent), the flow fails
with guidance (pass a version, `--republish`) instead of hanging. Flows also
export `runDesktop` / `runCli` for programmatic use.

## Rules — everything plain, CLI leads by a patch

**No prerelease suffixes anywhere.** A suffix (`1.14.1-N`) sorts *below* the
release, so `superset update` won't deliver it, **and** it fails the host-service
min-version floor (`semver.satisfies` excludes prereleases —
`satisfies("1.14.1-1", ">=0.8.0") === false`). So:

- **Desktop** is always a plain `MAJOR.MINOR.PATCH` release.
- A desktop release sets `cli == host-service == desktop` **and** publishes a
  matching plain `cli-v<version>` — the standalone CLI ships in lockstep.
- **CLI hotfixes** between desktop releases bump a plain **patch** above the
  current CLI (`1.14.1 → 1.14.2 → 1.14.3`), so the CLI *leads* desktop by a patch
  within the same minor line until the next desktop release catches up.
- `check:versions` enforces: `cli == host-service`, both plain, `cli >= desktop`,
  same major.minor as desktop.

## One-time snap

`host-service 0.8.26 → 1.14.0`, `cli 0.2.24 → 1.14.0` (desktop already 1.14.0).
`bun.lock` refreshed. From here on all three move together.

## Desktop release (`scripts/release/desktop.ts`)

Sets **desktop + host-service + cli** to the new version, commits, tags
`desktop-v<version>`, builds, and leaves a **draft**. **With `--publish`** it also
cuts a matching plain **`cli-v<version>`** so the standalone CLI ships with
desktop. Draft mode ships nothing until you publish, and cutting the tag is *not*
automatic on a manual `gh release edit --draft=false` — the script has already
exited, so it prints the `cli-v` command for you to run then.

## CLI hotfix (`scripts/release/cli.ts`, `bun run release cli`)

Ship a CLI-side fix between desktop releases:

- Current CLI = highest of `packages/cli` version, latest `cli-v` tag, and desktop.
- New version = plain patch above that (`1.14.2`), or an explicit `bun run release
  cli <version>` (must be plain, `> current`, same minor as desktop).
- Sets `cli` + `host-service` to it, refreshes lock, commits, tags `cli-v<version>`.
- `--daemon` also patch-bumps `pty-daemon` on its own `0.x` track.

`bun run release cli [version] [--daemon] [--no-tag]`.

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
