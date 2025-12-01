# Desktop App Release Process

## Quick Start

From the monorepo root:

```bash
./apps/desktop/create-release.sh <version>
# Example: ./apps/desktop/create-release.sh desktop-v0.0.1
```

The script will:
1. Update `package.json` version
2. Create and push a `desktop-v<version>` tag
3. Monitor the GitHub Actions build
4. Create a **draft release** for review

To auto-publish instead of creating a draft:

```bash
./apps/desktop/create-release.sh desktop-v0.0.1 --publish
```

To publish a draft:

```bash
gh release edit desktop-v0.0.1 --draft=false
```

### Requirements

- GitHub CLI (`gh`) installed and authenticated
- Clean git working directory

## Manual Release

If you prefer not to use the script:

```bash
git tag desktop-v1.0.0
git push origin desktop-v1.0.0
```

This creates a draft release. Publish it manually at GitHub Releases.

## Auto-update

The app checks for updates at launch and every x hours using:

- **Manifest**: `https://github.com/superset-sh/superset/releases/latest/download/latest-mac.yml`
- **Installer**: `https://github.com/superset-sh/superset/releases/latest/download/Superset-arm64.dmg`

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

## Troubleshooting

- **Build fails**: Check `src/resources/build/icons/icon.icns` exists
- **Native module errors**: Ensure `node-pty` is in externals in both `electron.vite.config.ts` and `electron-builder.ts`
