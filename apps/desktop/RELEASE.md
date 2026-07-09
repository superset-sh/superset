# Desktop App Release Process

## Quick Start

From the monorepo root, use the unified entry point:

```bash
bun run release           # interactive: pick Desktop or CLI hotfix
bun run release desktop   # desktop release directly
```

The release toolchain is TypeScript under `scripts/release/` (run by Bun). For the
full runbook — all flows, release-branch usage, and cleanup — see
[`scripts/release/README.md`](../../scripts/release/README.md). This file covers
desktop-specific details (build output, signing, auto-update, troubleshooting).

The flow will:
1. Show current version and prompt for new version (patch/minor/major/custom)
2. Set desktop, `host-service`, and `cli` all to the new version (unified) and refresh `bun.lock`
3. Create and push a `desktop-v<version>` tag
4. Monitor the GitHub Actions build
5. Create a **draft release** for review

> Desktop, `host-service`, and `cli` share one version, enforced by CI
> (`bun run check:versions`). `pty-daemon` stays on its own `0.x` track. See
> [`plans/20260709-unified-version-bumping.md`](../../plans/20260709-unified-version-bumping.md).

### Options

```bash
# Interactive version selection (recommended)
bun run release desktop

# Explicit version
bun run release desktop 0.0.50

# Auto-publish (skip draft)
bun run release desktop --publish
bun run release desktop 0.0.50 --publish

# Non-interactive (e.g. an agent): pass a version; use --republish to
# recreate an existing tag instead of being prompted.
bun run release desktop 0.0.50 --republish
```

To publish a draft:

```bash
gh release edit desktop-v0.0.50 --draft=false
```

### Requirements

- GitHub CLI (`gh`) installed and authenticated
- Clean git working directory

## Interim CLI releases

To ship a CLI-side fix **between** desktop releases, use the CLI flow (from the
monorepo root):

```bash
bun run release cli            # bumps cli + host-service to <desktop>-N (e.g. 1.14.0-1)
bun run release cli --daemon   # ...and patch-bumps pty-daemon (0.2.5 -> 0.2.6) to ship a daemon fix
```

The `-N` suffix is a prerelease **below** the desktop version, so the CLI never
ships above desktop. It tags `cli-v<version>` to trigger `release-cli.yml`.
`pty-daemon` is only bumped with `--daemon`, and stays on its own `0.x` track —
never the `-N` version (a prerelease daemon would sort below desktop's bundled
one and churn on the shared org socket).

## Manual Release

If you prefer not to use the script:

```bash
git tag desktop-v1.0.0
git push origin desktop-v1.0.0
```

This creates a draft release. Publish it manually at GitHub Releases.

## Auto-update

The app checks for updates at launch and every x hours using:

- **macOS manifest**: `https://github.com/superset-sh/superset/releases/latest/download/latest-mac.yml`
- **Linux manifest**: `https://github.com/superset-sh/superset/releases/latest/download/latest-linux.yml`
- **macOS installer**: `https://github.com/superset-sh/superset/releases/latest/download/Superset-arm64.dmg`
- **Linux installer**: `https://github.com/superset-sh/superset/releases/latest/download/Superset-x64.AppImage`

The workflow creates stable-named copies (without version) so these URLs always point to the latest build.

## Code Signing

macOS code signing uses these repository secrets:

- `MAC_CERTIFICATE` / `MAC_CERTIFICATE_PASSWORD`
- `APPLE_ID` / `APPLE_ID_PASSWORD` / `APPLE_TEAM_ID`

## Local Testing

```bash
cd apps/desktop
bun run clean:dev
bun run compile:app
bun run package
```

Output: `apps/desktop/release/`

Linux output should include:

- `*.AppImage`
- `*-linux.yml` (auto-update manifest)

## Troubleshooting

- **Linux auto-update not working**: Verify `release/*-linux.yml` is uploaded to the GitHub release
- **Build icon warnings/failures**: Add icons under `src/resources/build/icons/` (`icon.icns`, `icon.ico`, optional Linux `.png`)
- **Native module errors**: Ensure `node-pty` is in externals in both `electron.vite.config.ts` and `electron-builder.ts`
