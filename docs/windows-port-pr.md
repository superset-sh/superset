# Windows Desktop Port PR Draft

## Suggested Issue Title

Native Windows support for Superset Desktop

## Suggested PR Title

Add native Windows desktop build and runtime support

## Summary

This PR ports the Superset desktop runtime, packaging path, CLI integration, and
host-service/pty-daemon plumbing to work natively on Windows x64 while
preserving the existing macOS/Linux behavior.

The goal is not to fork product behavior or change licensing/entitlements. The
goal is to make the existing desktop app build, install, launch, authenticate,
sync, run terminals, and manage workspaces on Windows using native Windows
primitives where Unix assumptions previously blocked the app.

## What Changed

- Added Windows-aware shell detection and command construction for `cmd.exe`,
  PowerShell, `pwsh.exe`, Git Bash, and POSIX shells.
- Replaced package-script and release-script POSIX assumptions with portable
  Bun/TypeScript entrypoints.
- Added Windows named-pipe support for host-service, terminal-host, and
  pty-daemon control channels where Unix socket paths were previously assumed.
- Routed Windows process cleanup through native process-tree helpers and
  `taskkill.exe`.
- Added Windows ConPTY-safe terminal lifecycle handling.
- Added Windows-native agent wrappers and notification hooks.
- Added Windows CLI build/distribution support and disabled the CLI self-update
  path on Windows so desktop `electron-updater` owns Windows desktop updates.
- Added Windows native-module packaging/materialization checks for Electron
  desktop builds.
- Added a Windows native build prerequisite preflight for Visual Studio Build
  Tools, MSVC compiler tools, Spectre libraries, and Windows SDK.
- Added NSIS installer behavior for Windows, including per-user install and
  optional local data reset during reinstall.
- Hardened packaged desktop builds so local development URLs are not embedded in
  installed Windows builds by accident.
- Added diagnostic settings to disable update checks and analytics while keeping
  cloud login and sync enabled.
- Updated docs and tests to cover Windows setup, packaging, shell behavior,
  terminal lifecycle, and CLI/host-service behavior.

## Non-Goals

- No licensing, entitlement, paywall, or paid-feature behavior is removed or
  bypassed.
- No macOS/Linux release behavior is intentionally changed.
- No Windows ARM64 release target is introduced in this PR.
- No promise is made that the local development Docker stack is a first-class
  offline backend for packaged Windows desktop builds.

## Windows Build Prerequisites

Native Windows desktop packaging requires:

- Visual Studio Build Tools 2022
- MSVC v143 C++ x64/x86 compiler tools
- MSVC v143 C++ x64/x86 Spectre-mitigated libraries
- Windows 10 or Windows 11 SDK

The desktop build scripts preflight these requirements before invoking Electron
native rebuilds.

## Validation

Validated locally on Windows with:

```powershell
bun install
bun run lint
bun run typecheck
bun run --cwd apps/desktop install:deps
bun run --cwd apps/desktop typecheck
bun run --cwd apps/desktop prebuild
bun run --cwd apps/desktop build --win --x64
bun run --cwd packages/host-service test:e2e
bun run --cwd packages/pty-daemon test:integration
bun run smoke:win32
```

Additional targeted tests and smoke checks are documented in
`docs/windows-port-audit.md`.

Packaged desktop validation included:

- Installing the NSIS build on Windows.
- Signing in against the upstream cloud auth flow.
- Verifying the packaged build uses `https://api.superset.sh` instead of
  `localhost:3001`.
- Launching and using the desktop app with GPT/Codex provider auth.
- Verifying Settings > Experimental diagnostics can disable update checks and
  analytics without switching the app away from cloud login/sync.

## Known Limitations / Follow-Ups

- The GA target in this port is Windows x64. Windows ARM64 is intentionally left
  for a later pass.
- Some Windows integration tests can emit non-failing `MaxListenersExceededWarning`
  noise from node-pty test harnesses after passing.
- Local development setup may still require Docker Desktop and Caddy, and may
  need a documented fallback when GHCR image pulls fail.
- If maintainers prefer smaller changes, this work can be split into the PR
  sequence below.

## Recommended PR Split

For reviewability, the full port can be split into smaller PRs:

1. Windows build prerequisites and packaging docs.
2. Portable package/release scripts.
3. Native module packaging and Electron builder changes.
4. Shell abstraction and Windows command construction.
5. Named-pipe support for host-service, terminal-host, and pty-daemon.
6. Windows process cleanup and ConPTY lifecycle fixes.
7. Windows CLI distribution and updater ownership.
8. Agent wrappers, notify hooks, and provider-runtime Windows fixes.
9. NSIS installer behavior and reinstall reset flow.
10. Packaged-build URL sanitization and diagnostic settings.
11. Documentation and final validation matrix.

## Suggested Maintainer Questions

- Do you prefer one umbrella PR or a stacked series?
- Should Windows x64 be marked experimental, beta, or generally available in
  docs and release artifacts?
- Should the diagnostic update/analytics switches be kept, hidden behind a dev
  flag, or omitted from upstream?
- Should Windows installer reset behavior live in the main installer or in a
  separate troubleshooting path?
- What CI runner coverage is desired before merging Windows packaging support?

