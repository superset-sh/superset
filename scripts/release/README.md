# Releasing

The release toolchain is `scripts/release/*.ts` (TypeScript, run by Bun — no build
step). One entry point: **`bun run release`**. Design/rationale lives in
[`plans/20260709-unified-version-bumping.md`](../../plans/20260709-unified-version-bumping.md).

## Model

- **desktop == host-service == cli** at each desktop release — one unified plain
  version, enforced by `bun run check:versions` (CI-gated). A desktop release also
  publishes a matching plain `cli-v<version>`, so the standalone CLI ships in lockstep.
- **CLI hotfixes lead by a patch.** Between desktop releases, a CLI-only fix bumps
  a plain patch above the current CLI (`1.14.1 → 1.14.2`), within desktop's minor
  line, until the next desktop release catches up.
- **No prerelease suffixes.** A suffix sorts *below* the release (so `superset
  update` won't deliver it) and fails the host-service min-version floor
  (`semver.satisfies` excludes prereleases). Everything stays plain.
- **pty-daemon** is on its own `0.x` track, bumped only with `--daemon`.

## Commands

| Command | When |
| --- | --- |
| `bun run release` | Interactive menu (TTY only). |
| `bun run release desktop [version]` | New app release. Moves desktop + host-service + cli together + publishes matching `cli-v`. Draft by default. |
| `bun run release cli [version]` | CLI-only hotfix **between** desktop releases → plain patch above the current CLI. |
| `… --daemon` | Also ship a pty-daemon fix (patch-bumps it on `0.x`). |
| `bun run release check` | Verify versions are unified (exit 1 on drift). |

`version` for a desktop release is `MAJOR.MINOR.PATCH` (or omit for the
patch/minor/major menu). See `bun run release desktop --help`.

## Cut from a release branch (not `main`)

Releases are cut on a **dedicated release branch**, not on `main` and not on your
feature branch. Two ways:

**A — release a specific commit (canary-style).** Provisions an ephemeral release
branch from the commit in a worktree, applies the version bump there, tags, and
pushes; your working tree is untouched:

```bash
bun run release desktop 1.15.0 <commit-sha>   # commit to release (e.g. a main SHA)
```

**B — from a release branch you're on.** Bumps the version, pushes the branch,
opens a PR, and tags:

```bash
git switch -c release-1.15.0
bun run release desktop 1.15.0
```

Either way, the `desktop-v<version>` tag triggers `release-desktop.yml`. The
version-bump commit lives on the release branch/tag; merge it however you
normally do.

## Desktop: draft → publish

Draft by default — nothing reaches users until you publish. Review the draft, then:

```bash
gh release edit desktop-v1.15.0 --draft=false      # publish
# or in one shot:
bun run release desktop 1.15.0 --publish [--merge] # auto-publish (+ merge the PR)
```

Once published (non-draft), it becomes `/releases/latest`, which the desktop
auto-updater reads.

## When the daemon guard blocks

```
✗ pty-daemon/src changed since its last version bump … but this release
  doesn't bump the daemon.
```

The daemon changed but you're not bumping it → old daemons won't update. Re-run
with `--daemon` (for a desktop release you can instead ship the daemon fix via
`bun run release cli --daemon`).

## Re-cut / clean up a release

```bash
gh release delete cli-v1.14.0-2 --yes --cleanup-tag   # delete release + remote tag
git tag -d cli-v1.14.0-2                               # delete local tag
# then re-run the release, or pass --republish (desktop) to recreate the same version
```

## Agent / non-interactive

Every action is reachable via flags; prompts only fire on a TTY. Pass a version
explicitly and add `--republish` to skip the tag-exists prompt. Flows also export
`runDesktop(args)` / `runCli(args)` for programmatic use.

## Prerequisites

- Run from the monorepo root.
- `gh` installed and authenticated (`gh auth status`).
