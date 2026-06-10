# Development

Run the dev server without env validation or auth:

```bash
SKIP_ENV_VALIDATION=1 bun run dev
```

This skips environment variable validation and the sign-in screen. Desktop chat also falls back to local-only session bootstrap in this mode, so you can test chat/streaming without the cloud API as long as you have local model credentials configured.

# Release

When building for release, make sure native modules are built for the correct Electron architecture with `bun run install:deps`, then run `bun run release`.

On Windows, `bun run install:deps`, `bun run build -- --win --x64`, `bun run package`, and `bun run release` require:

- Visual Studio Build Tools 2022
- MSVC v143 C++ x64/x86 Spectre-mitigated libraries
- Windows 10 or Windows 11 SDK

Install those from Visual Studio Installer > Build Tools 2022 > Individual components. The desktop scripts preflight these components before invoking Electron native rebuilds.

# Linux (AppImage) local build

From `apps/desktop`:

```bash
bun run clean:dev
bun run compile:app
bun run package -- --publish never --config electron-builder.ts
```

Expected outputs in `apps/desktop/release/`:

- `*.AppImage`
- `*-linux.yml` (Linux auto-update manifest)

# Linux auto-update verification (local)

From `apps/desktop` after packaging:

```bash
ls -la release/*.AppImage
ls -la release/*-linux.yml
```

If both files exist, packaging produced the Linux artifact + updater metadata that `electron-updater` expects.
