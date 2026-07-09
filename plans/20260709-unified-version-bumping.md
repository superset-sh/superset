# Unified Version Bumping

Make **desktop, host-service, and cli** ship one shared version, enforced in CI.
`pty-daemon` is **deliberately excluded** — it keeps its own monotonic `0.x`
track (see "Why the daemon stays separate").

## One way to run it

`bun run release` (`scripts/release.sh`) is the single entry point:

- `bun run release` — interactive menu (Desktop / CLI hotfix)
- `bun run release desktop [version] [--publish] [--merge]`
- `bun run release cli [suffix] [--daemon] [--no-tag]`
- `bun run release check` — verify versions are unified

All flows and the CI guard read **one** source of truth,
`scripts/lib/release-lib.sh` (`UNIFIED_PACKAGES` + the version primitives), so
the desktop flow, CLI flow, and `check-versions` can't drift.

## Rules

- **Desktop is the ceiling.** It is always a plain `MAJOR.MINOR.PATCH` release.
- `host-service` and `cli` **base** (strip any `-N` suffix) must equal desktop.
- `host-service` **must equal** `cli` (they ship as one bundle).
- Interim CLI releases add a prerelease suffix: `1.14.0-1`, `1.14.0-2`, … These
  sort **below** `1.14.0` in semver, so the CLI never ships above desktop.

## One-time snap

`host-service 0.8.26 → 1.14.0`, `cli 0.2.24 → 1.14.0` (desktop already 1.14.0).
`bun.lock` refreshed. From here on all three move together.

## Desktop release (`apps/desktop/create-release.sh`)

Every desktop bump now sets **desktop + host-service + cli** to the same new
version (was: desktop + host-service patch-bump). Both the normal and
commit/worktree paths refresh `bun.lock` and commit all three package.jsons.

Commit: `chore(desktop): bump version to X (host-service a -> X, cli b -> X)`.

## Interim CLI release (`scripts/bump-cli.sh`, `bun run release:cli`)

Between desktop releases, ship a CLI-side fix without a desktop release:

- Base = current desktop version `D`.
- Suffix auto-increments: if cli is `D-N` → `D-(N+1)`, else `D-1`.
- Sets `cli` + `host-service` to `D-N`, refreshes lock, commits.
- `--daemon` also **patch-bumps `pty-daemon`** on its own track (e.g. `0.2.5 →
  0.2.6`) so the release can carry a daemon fix. The daemon never takes the
  `D-N` version (see below).
- Tags `cli-v D-N` → triggers `release-cli.yml` (bundles host-service).

`./scripts/bump-cli.sh [suffix] [--daemon] [--no-tag]`.

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
excluded from `check-versions.sh`.

## Enforcement (`scripts/check-versions.sh`, CI `Version Sync` job)

Fails if base(host-service) ≠ desktop, base(cli) ≠ desktop, or host-service ≠ cli.
Runs as its own `pull_request` job in `.github/workflows/ci.yml`.

## Risks / notes

- **Homebrew:** `bump-homebrew.yml` already accepts `-<prerelease>` tags
  (regex `(-[A-Za-z0-9.]+)?`). First interim release should be spot-checked —
  Homebrew's `version "1.14.0-1"` parsing is untested here.
- **Shared daemon socket:** handled by keeping pty-daemon on its own track — see
  "Why the daemon stays separate".
- `bun.lock` stores workspace `version` fields; scripts refresh it with
  `bun install --lockfile-only` so `--frozen` CI installs stay consistent.
