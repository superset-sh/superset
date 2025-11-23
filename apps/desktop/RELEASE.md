# Desktop App Release Process

This document describes how to create a release for the Superset Desktop application.

## Prerequisites

- Ensure all changes are committed and pushed to the repository
- Ensure the build works locally: `bun run package`
- Update version in `package.json` if needed

## Release Methods

### Method 1: Tag-Based Release (Recommended)

Create and push a git tag with the format `desktop-v*.*.*`:

```bash
# Create a tag (e.g., desktop-v1.0.0)
git tag desktop-v1.0.0

# Push the tag to trigger the release workflow
git push origin desktop-v1.0.0
```

This will automatically:
1. Build the app for macOS (arm64), Windows (x64), and Linux (x64)
2. Create artifacts for each platform
3. Create a draft GitHub release with all binaries attached

### Method 2: Manual Workflow Dispatch

You can also trigger a release manually from GitHub Actions:

1. Go to Actions → Release Desktop App
2. Click "Run workflow"
3. Enter the version number (e.g., `1.0.0`)
4. Click "Run workflow"

This method is useful for testing the workflow or creating builds without creating a tag.

## Workflow Overview

The release workflow (`.github/workflows/release-desktop.yml`) performs the following:

### Build Matrix

Builds are created for:
- **macOS**: arm64 (Apple Silicon) - produces `.dmg` and `.zip`
- **Windows**: x64 - produces `.exe` and `.msi` (NSIS installer)
- **Linux**: x64 - produces `.AppImage` and `.deb`

### Build Steps

For each platform:
1. Checkout code
2. Setup Bun
3. Install dependencies
4. Clean dev folder (`bun run clean:dev`)
5. Compile app with electron-vite (`bun run compile:app`)
6. Package with electron-builder (`bun run package`)
7. Upload artifacts

### Release Creation

After all builds complete (tag-based releases only):
1. Downloads all platform artifacts
2. Creates a draft GitHub release
3. Attaches all binaries to the release
4. Generates release notes from commits

## Code Signing (Optional)

To enable code signing, add the following secrets to your GitHub repository:

### macOS Code Signing

```yaml
CSC_LINK: ${{ secrets.MAC_CERTIFICATE }}
CSC_KEY_PASSWORD: ${{ secrets.MAC_CERTIFICATE_PASSWORD }}
APPLEID: ${{ secrets.APPLE_ID }}
APPLEIDPASS: ${{ secrets.APPLE_ID_PASSWORD }}
```

Uncomment the environment variables in the workflow under "Build Electron app (macOS)".

### Windows Code Signing

```yaml
CSC_LINK: ${{ secrets.WIN_CERTIFICATE }}
CSC_KEY_PASSWORD: ${{ secrets.WIN_CERTIFICATE_PASSWORD }}
```

Uncomment the environment variables in the workflow under "Build Electron app (Windows)".

## Publishing the Release

1. After the workflow completes, go to GitHub Releases
2. Find the draft release
3. Review the release notes and binaries
4. Edit the release description if needed
5. Click "Publish release" to make it public

## Build Outputs

### macOS
- `Superset-<version>-arm64.dmg` - DMG installer
- `Superset-<version>-arm64-mac.zip` - Zipped app bundle

### Windows
- `Superset Setup <version>.exe` - NSIS installer
- `Superset-<version>.msi` - MSI installer (if configured)

### Linux
- `Superset-<version>.AppImage` - Universal Linux binary
- `superset_<version>_amd64.deb` - Debian package

## Troubleshooting

### Build fails on macOS

- Ensure you're building for the correct architecture (arm64 is configured by default)
- Check that icon files exist at `src/resources/build/icons/icon.icns`

### Build fails on Windows

- Check that icon files exist at `src/resources/build/icons/icon.ico`
- Ensure NSIS configuration is correct in `electron-builder.ts`

### Build fails on Linux

- Check that icon files exist at `src/resources/build/icons/`
- Ensure required Linux build tools are available

### Native module errors

- `node-pty` is configured as a native module in both `electron.vite.config.ts` and `electron-builder.ts`
- It's externalized during build and unpacked from ASAR
- If you add more native modules, update both configuration files

## Local Testing

To test the build locally before releasing:

```bash
cd apps/desktop

# Clean and compile
bun run clean:dev
bun run compile:app

# Package the app
bun run package
```

The output will be in `apps/desktop/release/`.

## Multi-Architecture Builds

To build for multiple architectures, update `electron-builder.ts`:

```typescript
mac: {
  target: [
    {
      target: "default",
      arch: ["arm64", "x64"], // Add x64 for Intel Macs
    },
  ],
}
```

Note: This will increase build time significantly.
