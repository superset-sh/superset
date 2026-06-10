# Unofficial Windows Experimental Build

This fork provides an unofficial experimental Windows build of Superset Desktop.

Original project: https://github.com/superset-sh/superset

License: Elastic License 2.0 (ELv2). See `LICENSE.md`.

This fork is not affiliated with, endorsed by, or supported by Superset, Inc. It
exists to validate native Windows packaging and runtime compatibility, and to
prepare an upstream contribution.

## Scope

This fork focuses on:

- Native Windows x64 desktop packaging.
- Windows installer behavior.
- Windows terminal, shell, process, and named-pipe compatibility.
- Windows-compatible CLI and host-service runtime paths.
- Documentation and validation for Windows development and packaging.

This fork does not attempt to bypass, remove, or alter upstream licensing,
entitlement, or paid-feature controls.

## Status

Experimental. Use at your own risk.

Validated locally on Windows 10/11 x64 class tooling with:

- Bun
- Visual Studio Build Tools 2022
- MSVC v143 C++ x64/x86 compiler tools
- MSVC v143 C++ x64/x86 Spectre-mitigated libraries
- Windows 10 or Windows 11 SDK

See `docs/windows-port-audit.md` for the detailed command matrix and current
validation notes.

## What Works

- Desktop app builds on native Windows x64.
- NSIS installer generation works after required native build prerequisites are
  installed.
- Packaged desktop login uses the upstream cloud API instead of leaking local
  development URLs.
- Host-service and pty-daemon use Windows named pipes where Unix sockets were
  previously assumed.
- Windows terminal launch and cleanup paths use native `cmd.exe`, PowerShell,
  `pwsh.exe`, ConPTY, and `taskkill` behavior where appropriate.
- Agent wrapper and notification-hook paths include Windows-native entrypoints.
- Local diagnostic settings can disable auto-update checks and analytics while
  preserving normal cloud login and sync.

## Limitations

- This is not an official Superset release.
- Builds are experimental and may not be code-signed.
- The desktop app still depends on the upstream Superset cloud/backend for
  normal login and sync behavior.
- Some validation commands are long-running on Windows.
- The local development stack may still depend on Docker/Caddy availability and
  the availability of upstream container images.

## Build

From the repository root:

```powershell
cd "C:\path\to\superset"
bun run --cwd apps/desktop install:deps
bun run --cwd apps/desktop prebuild
bun run --cwd apps/desktop build --win --x64
```

If the full build stops after creating `release\win-unpacked`, the final
electron-builder step can be retried without recompiling the app:

```powershell
cd "C:\path\to\superset"
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
bun run --cwd apps/desktop scripts/run-electron-builder.ts --publish never --win --x64
```

Expected installer output:

```text
apps/desktop/release/Superset-<version>-x64.exe
```

## Recommended Fork Labeling

Use wording like:

```text
Unofficial experimental Windows build of Superset Desktop.
```

Avoid wording that implies this is an official Superset release or an open-source
relicensing of the upstream project.

