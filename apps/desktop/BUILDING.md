# Development

Run the dev server without env validation or auth:

```bash
SKIP_ENV_VALIDATION=1 bun run dev
```

This skips environment variable validation and the sign-in screen, useful for local development without credentials.

# Release

When building for release, make sure `node-pty` is built for the correct architecture with `bun run install:deps`, then run `bun run release`.

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