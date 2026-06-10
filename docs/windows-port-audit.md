# Windows Port Audit

Last updated: 2026-06-09

## Current Status

Native Windows work is in progress. The repo now gets past the previous hard
failure where Bun tried to execute POSIX shell scripts during `postinstall`, and
the required install/dev/lint/typecheck scripts no longer rely on `sh -c` for
normal development flows. Desktop and host-service shell launch paths now share
a Windows-aware shell classifier so `cmd.exe`, `powershell.exe`, `pwsh.exe`, and
Git Bash paths receive native launch arguments instead of POSIX-only defaults.
Workspace run start/restart and sequential preset command arrays now stay as
arrays until the host-service or legacy desktop terminal host knows the real
terminal shell, so Windows PowerShell receives native `; if ($?) { ... }`
chaining instead of renderer-prejoined `&&`.
The pty-daemon control socket and lifecycle paths now support native Windows
named pipes and ConPTY close semantics; the broader integration suite now runs
against Windows named pipes and native shell commands, with a repeatable smoke
command for quick checks. The desktop v1 terminal-host control stream now also
uses a stable Windows named pipe and probes liveness by connecting instead of
checking for a Unix socket file. Package scripts no longer point at `.sh`,
Bash, or `sh -c` entrypoints; release and relay deploy flows now have portable
Bun/TypeScript entrypoints with dry-run verification. The standalone CLI
distribution path now has a first-class `win32-x64` target that stages
`superset.exe`, `node.exe`, a `superset-host.cmd` wrapper, and Windows native
runtime packages, with an extracted-artifact smoke that boots the host service
on Windows. The desktop app compile/prepackage path now runs on Windows through
bundled CLI generation, native module materialization, native runtime
validation, and NSIS installer generation for `win32-x64` once the required
MSVC/Spectre and Windows SDK prerequisites are installed. The `.superset` local
setup and teardown flow now has Windows-native Bun entrypoints, and the project
setup config points at portable wrappers that preserve the existing Bash setup
on Unix while using the local native path on Windows.
Desktop Windows lifecycle decisions from the product review are now reflected in
the app: x64 is the GA Windows target, the NSIS installer is explicitly
per-user, the main window minimizes to the system tray on close, the tray can
optionally enable launch-at-login, desktop updates are owned by
`electron-updater`, and the Windows agent notify hook uses a Node dispatcher
instead of PowerShell.
The packaged desktop build also sanitizes local development URLs from `.env`:
production builds replace localhost API/Web/Relay/Electric/Streams URLs with
cloud defaults unless `SUPERSET_DESKTOP_ALLOW_LOCAL_BUILD_URLS` is explicitly
set, preventing installed apps from opening auth flows against
`localhost:3001`.
Git credential askpass now writes a native Windows `.cmd` helper, so HTTPS Git
operations can receive cloud tokens without requiring `/bin/sh`. Public docs and
marketing copy now describe Windows 10/11 x64 CLI/source-build support instead
of presenting Superset as macOS-only; the remaining waitlist language is scoped
to packaged desktop installers. Desktop resource metrics now query Windows
process trees through a shell-free PowerShell argv call instead of a `cmd.exe`
interpreted command string.

## Command Matrix

| Command | Result | Notes |
|---|---:|---|
| `bun --version` | pass | Tested with Bun `1.3.14`; repo requests `bun@1.3.11`. |
| `bun install` | pass | Dependency install completes after Windows native build prerequisites are installed. |
| `bun run --cwd apps/desktop install:deps` | pass | Electron native dependencies rebuild for Electron's Node ABI with Visual Studio Build Tools 2022, MSVC v143 compiler tools, Spectre-mitigated libraries, and Windows SDK present. |
| `bun run lint` | pass | Uses `scripts/lint.ts` instead of `scripts/lint.sh`; `biome.jsonc` uses `lineEnding: "auto"` so native Windows CRLF checkouts do not produce repo-wide false positives. |
| `bun run typecheck` | pass | Full Turbo typecheck passed for all packages. On Windows this now uses `scripts/typecheck.ts`, which defaults Turbo to `--concurrency 4` unless the caller supplies a concurrency flag; this avoids Bun/Turbo `VirtualAlloc` failures after desktop native modules are materialized. |
| `bun run --cwd apps/docs typecheck` | pass | Verifies the Windows-native setup/teardown and Linear integration docs render through MDX/type generation after replacing Unix-only examples. |
| `bun run --cwd apps/desktop typecheck` | pass | Verifies the in-app setup-script prompt changes typecheck with the desktop renderer. |
| `bun run --cwd packages/cli build:win32-x64` | pass | Builds the Windows Bun CLI binary at `packages/cli/dist/superset-win32-x64.exe`. |
| `bun run --cwd packages/cli build:dist -- --target=win32-x64` | pass | Builds a standalone Windows CLI distribution with `superset.exe`, bundled `node.exe`, host-service/pty-daemon bundles, Windows native runtime packages, migrations, and `superset-host.cmd`; produces `packages/cli/dist/superset-win32-x64.tar.gz`. |
| `bun run --cwd packages/cli smoke:dist -- <extracted superset-win32-x64.tar.gz> win32-x64` | pass | Extracted tarball smoke verifies CLI version/help, bundled Node `v22.13.0`, native addon loading from the staged bundle, node-pty ConPTY spawn, and host-service `health.check`. |
| `bun test packages/cli/src/commands/update/command.test.ts` | pass | Verifies Windows CLI artifacts still resolve as `win32-x64`, while `superset update` is disabled on Windows so desktop `electron-updater` owns Windows updates. |
| `SUPERSET_INSTALLER_DRY_RUN=1 powershell -File apps/marketing/public/cli/install.ps1` | pass | Verifies the public Windows CLI installer detects `win32-x64` and resolves the `cli-latest` Windows archive without downloading or mutating PATH. |
| `SUPERSET_INSTALLER_DRY_RUN=1 SUPERSET_VERSION=cli-v9.9.9 powershell -File apps/marketing/public/cli/install.ps1` | pass | Verifies the public Windows CLI installer constructs pinned release URLs for `superset-win32-x64.tar.gz`. |
| `bash -n apps/marketing/public/cli/install.sh` | pass | Verifies the POSIX installer remains syntactically valid after adding a Windows handoff message. |
| `bun run --cwd apps/desktop compile:app` | pass | Electron/Vite main, preload, and renderer build passed on Windows; also writes bundled `dist/resources/bin/superset.exe` and validates the pty-daemon bundle markers. |
| `TARGET_PLATFORM=win32 TARGET_ARCH=x64 bun run --cwd apps/desktop prepackage` | pass | Exercises bundled CLI generation, native module materialization from Bun's store/workspace symlinks, and native runtime validation for Windows x64. |
| `bun run --cwd apps/desktop prebuild` | pass | Generated icons, Vite/Electron builds, bundled CLI, copied native modules, and `validate:native-runtime` all pass on Windows x64. |
| `bun run --cwd apps/desktop build --win --x64` | pass via electron-builder wrapper | The parent command exceeded the tool timeout, but the child electron-builder run produced `release/win-unpacked` and installer artifacts. Re-running `bun run --cwd apps/desktop scripts/run-electron-builder.ts --publish never --win --x64` completed successfully and produced signed `Superset-1.12.4-x64.exe` plus blockmap. |
| Packaged desktop auth URL scan | pass | After rebuilding with local `.env` present, `apps/desktop/dist` and `release/win-unpacked/resources` contain no `localhost:3001`; `NEXT_PUBLIC_API_URL` is embedded as `https://api.superset.sh`. |
| `SUPERSET_SKIP_WINDOWS_NATIVE_BUILD_PREREQ_CHECK=1 bun run --cwd apps/desktop scripts/run-electron-builder.ts --version` | pass | Verifies the guarded electron-builder wrapper can still invoke electron-builder when a CI/custom toolchain intentionally bypasses the Windows prerequisite preflight. |
| Package-script POSIX blocker scan | pass | No package scripts now contain POSIX inline env assignments, `.sh` launchers, grep/sed/awk/cut/xargs pipelines, or POSIX filesystem commands. |
| `bun run --cwd apps/mobile dev --help` | pass | Verifies the Expo dev script reaches `expo start` through the portable `scripts/with-env.ts` helper instead of POSIX inline env assignment. |
| `bun run --cwd packages/macos-process-metrics install` | pass | Verifies the macOS-only native addon install script skips cleanly on Windows without invoking `node-gyp` or relying on shell `|| echo` fallback. |
| `bun test packages/host-service/scripts/test-e2e.test.ts` | pass | Verifies the host-service e2e launcher resolves Electron from Windows, Unix, macOS, and Bun flat-store layouts, and detects Electron native-module ABI mismatch output. |
| `bun run --cwd packages/host-service test:e2e` | pass | Electron-as-Node adoption e2e now runs against Windows named pipes and native `cmd.exe` commands. The Windows run passes 14 tests with 1 bash-specific readiness case skipped; node-pty still emits a `MaxListenersExceededWarning` from the harness after pass. |
| `bun test packages/host-service/src/providers/git/CloudGitCredentialProvider/askpass.test.ts` | pass | Verifies Windows `.cmd` askpass execution for username/password prompts and POSIX sidecar-token script generation. |
| `bun run smoke:win32` | pass | Starts an in-process pty-daemon on a Windows named pipe, validates hello handshake, command output/exit, interactive input, resize, close, and cleanup through ConPTY. |
| `node scripts/smoke-pty-daemon-cleanup.mjs --repo .` | pass | Starts the source pty-daemon on a Windows named pipe and verifies closing a ConPTY session reaps a descendant helper process through Windows cleanup. |
| `bun run --cwd packages/pty-daemon test:integration` | pass | 48 Node integration tests passed across smoke, control-plane, signal-recovery, byte-fidelity, and handoff coverage on Windows named pipes/ConPTY. Uses `--test-force-exit` because node-pty native handles can keep the test process alive; the high-concurrency test may emit a `MaxListenersExceededWarning` while still passing. |
| `bun run release:desktop 9.9.9 --dry-run` | pass | Exercises the Windows-native desktop release script without writing files, pushing, or calling GitHub APIs mutatively. |
| `bun run release:desktop 9.9.9 HEAD --dry-run` | pass | Exercises commit-based desktop release branch/tag flow without creating a worktree or pushing. |
| `bun run release:canary HEAD --dry-run` | pass | Exercises canary temp-branch and workflow-dispatch command construction. |
| `bun run --cwd apps/relay deploy --dry-run` | pass | Exercises production Fly deploy/scale/status and regional smoke-test command construction. |
| `bun run --cwd apps/relay deploy:staging --dry-run` | pass | Exercises staging Fly deploy/scale/status and regional smoke-test command construction. |
| `bun ./.superset/setup.local.ts --dry-run --skip-install --skip-db` | pass | Exercises native local setup planning, dependency reporting, port allocation, generated `.env`/Caddy/Electric/ports/config paths, and skip handling without mutating files or starting Docker. |
| `bun ./.superset/setup.local.ts` | pass | Docker and Caddy are installed and detected. The first run was blocked by repeated `EOF` failures pulling `ghcr.io/timowilhelm/local-neon-http-proxy:main`; building that same tag locally from `TimoWilhelm/local-neon-http-proxy` with LF line endings unblocked the compose stack. A follow-up `bun ./.superset/setup.local.ts --skip-install` brought up Postgres, neon-proxy, and Electric, applied migrations, seeded `admin@local.test`, and wrote the local config overlay. |
| `bun ./.superset/teardown.local.ts` | pass | Removes the local DB stack, containers, network, and volume after the full setup validation. |
| `bun ./.superset/setup.ts --dry-run --skip-install --skip-db` | pass | Exercises the project-config wrapper path on Windows; delegates to `setup.local.ts`. |
| `bun ./.superset/teardown.ts --dry-run` | pass | Exercises the project-config wrapper path on Windows; delegates to `teardown.local.ts` and constructs the local Docker compose teardown command. |
| `bun test packages/host-service/src/trpc/router/workspace-creation/shared/setup-terminal.test.ts packages/host-service/src/runtime/teardown/teardown.test.ts` | pass | 25 tests verify portable setup fallback resolution, PowerShell-compatible configured setup command chaining, Windows-native setup fallback scripts (`.cmd`, `.bat`, `.ps1`), and Windows `cmd.exe`/PowerShell teardown exit command construction for portable `.ts` and Windows-native teardown scripts. |
| `bun test packages/host-service/src/runtime/teardown/teardown.test.ts packages/shared/src/shell.test.ts` | pass | 10 tests verify shared shell classification plus Windows `cmd.exe`/PowerShell portable teardown command construction and script resolution. |
| `bun test packages/host-service/test/integration/setup-scripts.integration.test.ts packages/host-service/test/integration/teardown.integration.test.ts packages/host-service/test/integration/workspace-cleanup.integration.test.ts packages/host-service/test/integration/terminal.integration.test.ts` | pass | 23 host-service integration tests pass on Windows named pipes, including setup config propagation, hidden teardown terminal exit, real-daemon terminal cleanup, and workspace deletion cleanup. |
| `bun test packages/host-service/test/integration/setup-scripts.integration.test.ts packages/host-service/test/integration/teardown.integration.test.ts packages/host-service/test/integration/workspace-cleanup.integration.test.ts` | pass | 16 host-service setup/teardown/workspace-cleanup integration tests pass after expanding teardown script discovery. |
| `bun test packages/host-service/src/daemon/DaemonSupervisor.test.ts` | pass | 37 daemon supervisor unit tests pass, including Windows named-pipe socket formatting and adoption/version-probe behavior. |
| `bun run --cwd packages/host-service test:integration:daemon` | pass | 18 real-spawn Node integration tests pass on Windows named pipes, covering DaemonClient protocol behavior, supervisor spawn/adopt/restart/respawn, stale-daemon update, Windows no-live-session update restart, and live-session update deferral. Uses Node `--test-force-exit` because node-pty native handles can keep the runner alive after tests finish. |
| `bun test packages/host-service/src/terminal packages/pty-daemon/src/protocol` | pass | 90 terminal/protocol tests pass on Windows after the host-service integration port. |
| `bun test packages/workspace-fs/src packages/pty-daemon/src/protocol packages/pty-daemon/test/helpers` | pass | 62 workspace-fs and daemon protocol/helper tests pass, including Windows drive-root watcher event normalization and local socket/named-pipe protocol comments. |
| `bun run --cwd packages/host-service typecheck` | pass | Host-service TypeScript typecheck passes after Windows integration-test and terminal/teardown changes. |
| `bun test packages/cli/src packages/host-service/src/terminal/clean-shell-env.test.ts` | pass | 25 CLI/host-service tests verify Windows updater helpers, deferred replacement script generation, and Windows terminal-base env snapshot behavior. |
| `bun test packages/cli/src/lib/auth.test.ts packages/cli/src` | pass | 17 CLI tests verify OAuth refresh redaction plus Windows browser launch command construction for query-string-heavy authorization URLs. |
| `bun test packages/cli/src/commands/workspaces/open/command.test.ts packages/cli/src` | pass | 19 CLI tests verify workspace deep-link launch command construction on Windows plus the existing CLI Windows updater, OAuth, config, auth resolution, and host-service spawn coverage. |
| `bun test apps/desktop/src/lib/trpc/routers/workspaces/utils/git.test.ts` | pass | 36 desktop Git utility tests pass on Windows, including worktree hook tolerance, branch/upstream checks, and Windows-safe background cleanup planning. |
| `bun test apps/desktop/src/main/lib/terminal/env.test.ts` | pass | 78 desktop terminal environment tests pass, including Windows env casing and a guard that skips the POSIX locale probe on Windows. |
| `bun test apps/desktop/src/main/lib/resource-metrics/process-tree.test.ts` | pass | 11 resource-metrics tests verify process-subtree aggregation plus Unix and Windows process-list parsing; Windows process listing is built as `powershell.exe` argv instead of a shell command string. |
| `bun test apps/desktop/src/main/lib/terminal-host/paths.test.ts apps/desktop/src/main/terminal-host/session.test.ts apps/desktop/src/main/terminal-host/session-shell-ready.test.ts apps/desktop/src/main/terminal-host/terminal-host.test.ts` | pass | 36 terminal-host tests pass, including Windows named-pipe path generation and the surrounding session/readiness behavior. |
| `bun test apps/desktop/src/renderer/lib/file-manager-labels.test.ts` | pass | Verifies desktop file-manager labels render as File Explorer on Windows, Finder on macOS, and Files on Linux. |
| `bun test apps/desktop/src/renderer/lib/file-manager-labels.test.ts apps/desktop/src/renderer/lib/external-app-platforms.test.ts apps/desktop/src/lib/trpc/routers/external/helpers.test.ts` | pass | 116 tests verify platform-aware file-manager labels, Open In app filtering, Windows external-app command candidates, macOS-only app rejection on Windows, and platform-native external path resolution. |
| `bun test apps/desktop/src/renderer/lib/script-file-imports.test.ts` | pass | Verifies the project script import helper accepts Unix, Windows (`.cmd`, `.bat`, `.ps1`, `.psm1`), and portable Bun/Node (`.ts`, `.js`, `.mjs`, `.cjs`) script files while rejecting non-script extensions. |
| `bun test apps/desktop/src/main/lib/agent-setup/agent-wrappers.test.ts` | pass | 32 passing / 6 skipped tests verify agent wrapper generation; Windows now executes a generated `.cmd` wrapper against a fake real binary, while Bash-wrapper execution cases are Unix-only. |
| `bun test apps/desktop/src/main/lib/agent-setup/notify-hook.test.ts` | pass | 9 notify-hook tests verify the Windows `notify.cmd` entrypoint, generated Node `notify.mjs` dispatcher, v2 host-service payload, v1 fallback, and CRLF-tolerant template assertions. |
| `bun test apps/desktop/src/main/lib/agent-setup/notify-hook.test.ts apps/desktop/src/main/lib/auto-updater.test.ts packages/cli/src/commands/update/command.test.ts` | pass | Focused regression slice for the product-review decisions around Node notify hooks, Windows desktop auto-updates, and Windows CLI self-update ownership. |
| `bun test apps/desktop/scripts/windows-native-build-prereqs.test.ts` | pass | 6 tests verify Windows prerequisite detection for non-Windows no-op, explicit skip, incomplete MSVC compiler tools, missing Spectre libraries, complete MSVC+SDK layout, and actionable guidance formatting. |
| `bun run --cwd packages/pty-daemon test` | pass | 59 pty-daemon unit tests pass, including the new Windows process-table guard that skips Unix `ps` discovery and the Unix `ps` output parser coverage. |
| `bun test apps/desktop/src/main/lib/agent-setup/shell-wrappers.test.ts` | pass | 27 shell-wrapper tests pass on Windows after managed wrapper `.cmd` support. |
| `bun test apps/desktop/src/lib/trpc/routers/workspaces/utils/teardown.test.ts` | pass | 13 teardown tests pass on Windows and verify managed wrapper path precedence under `cmd.exe`. |
| `bun test apps/desktop/src/lib/trpc/routers/workspaces/utils/teardown.test.ts apps/desktop/src/main/lib/agent-setup/shell-wrappers.test.ts` | pass | 42 tests verify desktop workspace teardown uses native Windows shell execution, preserves managed-bin PATH precedence, builds PowerShell-compatible teardown command chains, and keeps shell-wrapper command behavior intact. |
| `bun test packages/shared/src/shell.test.ts apps/desktop/src/renderer/lib/terminal/launch-command.test.ts packages/host-service/test/integration/terminal.integration.test.ts` | pass | 25 tests verify shared shell command-chain construction, renderer launch-command behavior, and host-service terminal session creation after adding shell-aware command-array launches. |
| `bun test packages/shared/src/shell.test.ts apps/desktop/src/renderer/lib/terminal/launch-command.test.ts apps/desktop/src/main/terminal-host/session.test.ts apps/desktop/src/renderer/react-query/workspaces/bootstrap-open-worktree.test.ts apps/desktop/src/renderer/stores/tabs/preset-launch.test.ts` | pass | 50 tests verify shared shell chaining/cwd/line-ending helpers, v1 terminal-host command-array launch args, renderer command-array launch helpers, open-worktree setup writes, and preset launch planning after removing POSIX focused-terminal command construction. |
| `bun run --cwd apps/desktop typecheck` | pass | Re-run after v1 workspace-run start/restart changes; verifies persisted pane workspace-run command arrays, terminal lifecycle restart payloads, and `createOrAttach.commands` typing. |
| `bun test packages/host-service/src/trpc/router/workspace-creation/shared/setup-terminal.test.ts packages/host-service/test/integration/setup-scripts.integration.test.ts packages/host-service/test/integration/teardown.integration.test.ts` | pass | 15 tests verify setup-terminal fallback resolution, including Windows refusing Bash-only fallback setup scripts, plus related setup/teardown integration coverage. |
| `bun test apps/desktop/src/main/lib/tree-kill.test.ts packages/host-service/src/ports/tree-kill.test.ts apps/desktop/src/main/terminal-host/session.test.ts apps/desktop/src/main/terminal-host/terminal-host.test.ts` | pass | 16 tests verify Windows taskkill argument construction and the legacy desktop terminal-host session behavior after routing cleanup through the Windows-native process-tree helper. |
| `bun test apps/desktop/src/main/lib/tree-kill.test.ts apps/desktop/src/main/lib/terminal-host/paths.test.ts apps/desktop/src/main/terminal-host/session.test.ts apps/desktop/src/main/terminal-host/terminal-host.test.ts` | pass | 17 tests verify the desktop Windows taskkill helper, named-pipe terminal-host paths, and terminal-host session behavior after stale daemon PID cleanup was routed through the Windows-native process-tree helper. |
| `bun test packages/workspace-fs/src` | pass | 45 workspace-fs tests pass, including Windows-specific atomic-write behavior that skips POSIX mode preservation on Windows while preserving Unix behavior. |
| `bun test packages/shared/src/shell.test.ts packages/host-service/src/terminal/env.test.ts apps/desktop/src/main/lib/agent-setup/shell-wrappers.test.ts apps/desktop/src/main/terminal-host/session-shell-ready.test.ts apps/desktop/src/main/terminal-host/session.test.ts` | pass | 104 focused shell launch/readiness tests passed on Windows. |
| `bun test packages/host-service/src/terminal packages/pty-daemon/src/protocol apps/desktop/src/main/lib/terminal apps/desktop/src/main/lib/agent-setup/shell-wrappers.test.ts apps/desktop/src/main/terminal-host/session-shell-ready.test.ts apps/desktop/src/main/terminal-host/session.test.ts packages/shared/src/shell.test.ts` | pass | 302 terminal/protocol/shell-wrapper tests passed on Windows. |
| `bun test packages/pty-daemon/src/Server packages/pty-daemon/src/Pty/Pty.test.ts packages/host-service/src/daemon/DaemonSupervisor.test.ts packages/shared/src/shell.test.ts packages/host-service/src/terminal/env.test.ts` | pass | 87 daemon/supervisor/shell tests passed, including Windows named-pipe daemon probing/adoption. |

## Fixed In This Pass

- Replaced root `postinstall` with `scripts/postinstall.ts` so Bun can run it on Windows.
- Replaced root `lint` with `scripts/lint.ts`, preserving the Biome check and custom `simple-git`/git-ref scans without Bash.
- Replaced root `typecheck` with `scripts/typecheck.ts`, preserving `turbo typecheck` while applying a Windows-safe default concurrency to avoid allocator failures after desktop native modules are materialized.
- Added `scripts/dev-with-port.ts`, `scripts/cli-dev.ts`, and `scripts/with-env.ts` to remove POSIX env/default-port syntax from normal package scripts.
- Converted Next/Wrangler dev scripts from `sh -c 'exec ... ${PORT:-default}'` to portable Bun helpers.
- Converted `packages/email` and `packages/cli` dev scripts away from `grep`/`cut`/`env` shell forms.
- Converted the Expo mobile dev script away from POSIX inline env assignment by using the shared `scripts/with-env.ts` helper.
- Replaced the macOS process metrics install shell fallback with a portable TypeScript install script that skips non-macOS before invoking `node-gyp`.
- Replaced the host-service e2e Electron resolver's Unix `find` call with platform-aware filesystem resolution for `electron.exe`, Linux `electron`, macOS `Electron.app`, and Bun flat-store installs.
- Added host-service e2e launcher coverage for Windows/macOS/Bun Electron resolution and actionable Electron native-module ABI mismatch detection.
- Updated the host-service adoption e2e test to use a Windows named pipe for its daemon socket instead of a filesystem `.sock` path.
- Added `packages/cli` `build:win32-x64` and taught `scripts/build-dist.ts` to build a standalone Windows CLI distribution from Node's Windows zip, Windows native optional packages, `superset.exe`, and a `superset-host.cmd` wrapper.
- Added `packages/cli/scripts/smoke-test.ts`, a cross-platform distribution smoke that replaces the Bash-only smoke path for Windows and verifies the extracted Windows artifact without leaking modules from the developer machine.
- Kept Windows CLI artifact resolution for distribution/build validation, but disabled `superset update` on Windows so installed Windows apps update through desktop `electron-updater` instead of a second CLI updater path.
- Hardened CLI OAuth browser launching by replacing shell-string `exec()` calls with detached `spawn()` argument arrays; Windows now launches through `cmd.exe /c start` with verbatim arguments so authorization URLs containing `&`, `%`, and query parameters are not reinterpreted by the shell.
- Hardened CLI workspace deep-link launching with the same verbatim Windows `cmd.exe /c start` argument construction so `superset://` URLs containing shell metacharacters are not reinterpreted before reaching the desktop app.
- Fixed host-service terminal env startup on Windows by using the inherited process environment instead of trying to invoke `cmd.exe` with POSIX `-i -l -c` shell flags; the packaged Windows dist smoke now reaches `health.check`.
- Hardened desktop resource metrics on Windows by replacing the shell-string PowerShell process listing with a `powershell.exe` argv call, and covered Windows CRLF CSV parsing plus the no-shell command contract.
- Added a public Windows PowerShell CLI installer at `apps/marketing/public/cli/install.ps1`, updated CLI docs with Windows install instructions, and changed the POSIX installer to direct Windows shells to the PowerShell path instead of reporting Windows as unsupported.
- Updated desktop worktree removal so Windows uses Node's native recursive deletion for renamed worktree directories instead of spawning `/bin/rm -rf`, while Unix keeps the existing spawned cleanup path.
- Hardened worktree hook-tolerance detection on Windows by falling back to `git rev-parse --is-inside-work-tree` when `git worktree list` path spelling does not string-match the requested path.
- Made desktop Git utility tests portable on Windows by avoiding `chmod`, POSIX `|| true`, Homebrew-only PATH assertions, and shell-composed Git commits in the affected cases.
- Skipped the desktop terminal POSIX `locale | grep | cut` probe on Windows; Windows terminals now fall back directly to the default UTF-8 locale without spawning a guaranteed-failing shell pipeline.
- Added Windows `.cmd` shims for Superset-managed agent wrappers (`claude`, `codex`, `opencode`, `amp`, `droid`, `gemini`, `mastracode`, `copilot`, and `cursor-agent`) so native Windows shells can resolve PATH-injected wrappers through `PATHEXT`; the existing Bash wrappers remain in place for Unix and Git Bash behavior.
- Made agent-wrapper tests platform-aware by keeping Bash wrapper execution coverage on Unix and adding a native Windows `.cmd` execution test that verifies real-binary lookup, argument forwarding, and `SUPERSET_AGENT_ID` propagation.
- Added a native Windows notification hook entrypoint (`notify.cmd`) plus Node dispatcher (`notify.mjs`) so agent lifecycle hooks can post v2 host-service events and fall back to the v1 Electron hook without invoking Bash or PowerShell.
- Enabled Windows tray lifecycle behavior: closing the main window hides it to the system tray, explicit tray Quit still performs the full app quit path, and the tray exposes an optional launch-at-login toggle.
- Enabled desktop `electron-updater` on Windows and made the Windows NSIS target explicitly per-user (`perMachine: false`) while keeping the GA target x64-only.
- Hardened packaged desktop builds against local `.env` leakage: production build config no longer lets local `localhost` URLs override inherited release env, and local API/Web/Relay/Electric/Streams URLs are replaced with cloud defaults unless explicitly allowed for a local-build test.
- Made Claude, Codex, Droid, Mastra, OpenCode, Amp, and Pi hook generation choose platform-appropriate notify commands, including idempotent cleanup of stale Windows Claude hook commands.
- Added `apps/desktop/scripts/install-app-deps.ts` so Windows native rebuild failures identify missing Visual Studio components directly.
- Added a shared Windows native-build prerequisite checker and guarded desktop `install:deps`, `build`, `package`, and `release` entrypoints so machines missing MSVC Spectre libraries fail with actionable guidance before invoking Electron native rebuilds.
- Expanded the Windows native-build prerequisite checker to detect incomplete MSVC toolset installs that have a version directory but are missing `cl.exe` compiler tools for x64/x86, and updated guidance to name both compiler tools and Spectre libraries.
- Updated desktop build/release docs to use the portable TypeScript release script and document Windows native packaging prerequisites.
- Hardened `apps/desktop/scripts/copy-native-modules.ts` for Windows by deleting Bun symlinks with `unlinkSync` and dereferencing nested symlinks when materializing native runtime modules.
- Replaced the desktop native-module npm fallback fetch pipeline (`curl | tar`) with shell-free `curl` and `tar` process calls using explicit argv and a temporary tarball.
- Updated `apps/desktop/scripts/validate-native-runtime.ts` so all platform package checks honor `TARGET_PLATFORM`/`TARGET_ARCH`, including `@parcel/watcher`.
- Added Windows coverage for the packaged bundled CLI shim (`superset.cmd`) and made the test suite mock Electron correctly under Bun on Windows.
- Ported cloud Git credential askpass generation to Windows by emitting a native `.cmd` helper and storing tokens in a sidecar file instead of embedding them in POSIX shell text.
- Set Biome formatter line endings to `auto`, which avoids CRLF-vs-LF noise on native Windows checkouts while preserving LF expectations on Unix.
- Fixed `DaemonClient` socket data typing for Node's Windows-visible `string | Buffer` data event type.
- Fixed host-service env preservation test to assert `Path` on Windows and `PATH` elsewhere.
- Added `@superset/shared/shell` for cross-platform shell basename normalization, known-shell classification, shell-ready marker support, and Windows-native shell arguments.
- Refactored desktop shell wrappers, terminal-host readiness gating, and host-service shell launch code to use the shared shell utility instead of POSIX basename checks.
- Added coverage for Git Bash paths such as `C:\Program Files\Git\bin\bash.exe` and native Windows shells (`cmd.exe`, `powershell.exe`, `pwsh.exe`).
- Made shell-wrapper integration tests portable on Windows by preserving the current PATH when spawning Git Bash and avoiding chmod-only assertions that Windows cannot represent reliably.
- Changed host-service pty-daemon socket paths to use Windows named pipes (`\\.\pipe\superset-ptyd-...`) instead of filesystem `.sock` paths on Windows.
- Taught pty-daemon `Server.listen()`/`close()` to skip Unix socket file operations (`mkdir`, `unlink`, `chmod`) for Windows named pipes.
- Fixed daemon readiness polling so Windows named pipes are probed by connection instead of gated by `fs.existsSync`.
- Added a shared desktop terminal-host path helper so the v1 terminal-host daemon and client use a stable Windows named pipe instead of `~/.superset/terminal-host.sock` on Windows.
- Updated terminal-host client spawning, shutdown, liveness probing, and stale socket cleanup so Windows named pipes are treated as connectable endpoints rather than filesystem paths.
- Updated the terminal-host daemon to skip Unix-only socket chmod/unlink on Windows named pipes, and updated its local socket probe helper so Windows no longer opts out.
- Made regular Windows ConPTY spawn independent of POSIX-only node-pty master fd validation; fd-handoff now reports a clear unsupported path for live Windows sessions.
- Fixed Windows PTY close by using `taskkill.exe /PID <pid> /T /F` instead of passing POSIX signals to node-pty, which throws on Windows.
- Added `bun run smoke:win32` for repeatable native Windows pty-daemon smoke coverage.
- Ported `scripts/smoke-pty-daemon-cleanup.mjs` to Windows named pipes and a Node coordinator helper, with async named-pipe readiness, Windows process cleanup, and bounded in-process liveness checks.
- Ported pty-daemon integration/control-plane/byte-fidelity/signal-recovery/handoff tests to Windows named pipes and platform shell helpers.
- Made the handoff integration test assert the clear Windows unsupported fd-handoff path while preserving real fd-handoff assertions on Unix.
- Made signal-recovery integration tests run from the TypeScript source entrypoint instead of requiring a prebuilt `dist/pty-daemon.js` bundle.
- Suppressed noisy Windows node-pty kill fallback errors by skipping the fallback kill call when `taskkill` already removed the process.
- Replaced root `release:desktop` with `apps/desktop/scripts/create-release.ts`, preserving version bump, optional commit-based releases, tag/workflow monitoring, publish, merge, and host-service patch-bump behavior in a Windows-native entrypoint.
- Replaced root `release:canary` with `scripts/release-canary.ts`, preserving optional commit temp-branch behavior and workflow dispatch.
- Replaced `apps/relay` `deploy` with `apps/relay/scripts/deploy.ts` and added `deploy:staging`; the portable script preserves Fly deploy/scale/status plus regional `/health` smoke checks.
- Verified package scripts no longer reference `.sh`, Bash, or `sh -c` entrypoints. Remaining `.sh` files are compatibility/source scripts, not package-script launch blockers.
- Added `.superset/setup.local.ts` and `.superset/teardown.local.ts` to mirror the local DB setup/teardown flow without Bash, `jq`, `curl`, `grep`, `sed`, or POSIX file operations.
- Added `.superset/setup.ts` and `.superset/teardown.ts` wrappers; Unix delegates to the existing Bash scripts, while Windows delegates to the native local Bun scripts.
- Updated `.superset/config.json` and generated local overlays to use the portable Bun setup/teardown entrypoints.
- Updated host-service setup fallback and workspace cleanup teardown resolution so Windows can choose portable `.superset/*.ts` scripts and hidden cleanup terminals exit correctly under `cmd.exe` or PowerShell.
- Hardened host-service workspace setup fallback so Windows uses `.superset/setup.ts` when available and otherwise skips Bash-only `.superset/setup.sh` fallback scripts instead of trying to invoke `bash`.
- Updated desktop workspace-delete teardown execution to default to `cmd.exe` on Windows, use verbatim `cmd` arguments for quoted redirection paths, prepend managed binary wrappers to Windows PATH, and kill timed-out teardown process trees with `taskkill`.
- Updated docs and marketing platform copy to advertise Windows 10/11 x64 CLI/source-build support while keeping packaged desktop installer waitlist messaging separate.
- Ported host-service setup, teardown, terminal, and workspace-cleanup integration tests to Windows named pipes via a shared test socket helper.
- Fixed the host-service setup integration test for Windows CRLF command writes and realistic integration-test timeout.
- Fixed hidden teardown integration setup ordering and made the fake PTY path exercise Windows teardown marker creation without relying on Unix shell execution.
- Fixed host-service terminal initial commands to append Windows-native CRLF for `cmd.exe`, PowerShell, and `pwsh`, while continuing to gate shell-ready markers only for supported POSIX shells.
- Fixed `buildTeardownInitialCommand` for `cmd.exe` so teardown success/failure is propagated with `bun "script" && exit /b 0 || exit /b 1` instead of stale `%ERRORLEVEL%` expansion.
- Hardened the Windows real-daemon terminal cleanup integration test to use a native `cmd.exe` session and daemon-reported PID instead of PowerShell/Node/Bun helper processes that can fail inside constrained ConPTY environments.
- Ported host-service real-spawn daemon integration tests to Windows named pipes and native `cmd.exe` session metadata.
- Added `--test-force-exit` to the host-service daemon integration script so Node exits cleanly after node-pty integration tests on Windows.
- Added a Windows daemon-update path: with live ConPTY sessions, update returns the existing explicit "close sessions first" failure; with no live sessions, it safely stops and respawns the daemon, clears stale update state, and logs `mode: "windows_restart_no_live_sessions"`.
- Updated daemon/CLI distribution docs that still described Unix-only sockets, POSIX-only wrappers, or Windows ConPTY as out of scope.
- Restored workspace-fs Windows drive-root watcher event normalization, replacing a stale "desktop doesn't ship on Windows" omission with tested local path normalization for Parcel watcher events.
- Hardened workspace-fs atomic overwrites so Windows skips POSIX mode preservation (`chmod`) on temporary replacement files, while Unix keeps source mode preservation.
- Updated the public terminal daemon deep-dive and daemon protocol/test comments so they describe the local socket/named-pipe transport instead of Unix sockets only.
- Replaced desktop renderer user-facing Finder-only file-manager labels with platform-aware labels: Windows now shows File Explorer, macOS shows Finder, and Linux shows Files while preserving the existing `openInFinder` route/API names.
- Hid macOS-only desktop Open In targets (`xcode`, `iterm`, `terminal`, and `appcode`) from Windows/Linux renderer menus and command-palette entries, while preserving cross-platform editors and falling back to the platform file manager when a persisted default is not available.
- Taught desktop external-app launching to resolve Windows CLI commands with `PATHEXT`-aware candidates instead of treating Windows like Linux, and to return a clear unsupported-platform error for macOS-only app selections.
- Hardened external path normalization so `~` expansion works from `HOME`, `USERPROFILE`, or `os.homedir()` and resolved paths are normalized to the host platform.
- Updated v1 and v2 project script import controls to accept Windows-native script files (`.cmd`, `.bat`, `.ps1`, `.psm1`) and portable Bun/Node scripts (`.ts`, `.js`, `.mjs`, `.cjs`) instead of silently ignoring every non-Unix script extension.
- Updated setup/teardown documentation and the in-app setup-script prompt so complex project automation recommends portable Bun/Node scripts, documents Windows-native `.ps1`/`.cmd`/`.bat` entrypoints, and no longer presents `.sh` as the only serious option; the Linear integration docs now include a native Windows PowerShell plus `.cmd` launcher path.
- Expanded host-service setup fallback discovery so Windows workspace creation can run `.superset/setup.cmd`, `.superset/setup.bat`, or `.superset/setup.ps1` when no portable `.superset/setup.ts` exists, while still refusing Bash-only `.superset/setup.sh` fallbacks on Windows.
- Made configured setup arrays shell-aware for Windows PowerShell by chaining commands with explicit `$?`/`$LASTEXITCODE` guards instead of assuming `&&` is available, while keeping existing `&&` behavior for `cmd.exe` and POSIX shells.
- Expanded host-service auto-teardown discovery so Windows workspaces can use `.superset/teardown.cmd`, `.superset/teardown.bat`, or `.superset/teardown.ps1` when no portable `.superset/teardown.ts` exists, with command generation that preserves exit status under both `cmd.exe` and PowerShell.
- Made legacy desktop workspace teardown config arrays shell-aware for Windows PowerShell by using the same explicit `$?`/`$LASTEXITCODE` guard chain, while preserving existing `&&` command chaining for `cmd.exe` and POSIX shells.
- Added shared shell command-chain construction and routed v2 workspace run/sequential preset launches through host-service `initialCommands`/`writeCommands`, so PowerShell terminals use interactive `; if ($?) { ... }` chaining while `cmd.exe` and POSIX shells keep `&&`.
- Made sequential preset reuse of an active v2 terminal apply preset `cwd` through shell-specific directory commands (`cd /d`, `Set-Location -LiteralPath`, or POSIX `cd`) instead of a POSIX-quoted `cd ... && ...` string.
- Routed legacy desktop setup/open-worktree writes and v1 sequential preset launches through a shell-aware `terminal.writeCommands` path, and added v1 terminal-host `commands` support so command arrays are chained after the terminal shell is resolved.
- Removed the legacy renderer focused-preset `cd ... && ...` helper; active terminal preset cwd is now applied by the Electron main process with shell-specific `cd /d`, `Set-Location -LiteralPath`, or POSIX `cd` commands.
- Made v1 workspace-run start/restart paths keep command arrays in pane state and route live-session reuse through `terminal.writeCommands` while fresh or recovered terminal sessions receive `createOrAttach.commands`, avoiding stored renderer `&&` chains on PowerShell.
- Made desktop and host-service process-tree cleanup explicitly Windows-native by routing Windows kills through `taskkill.exe /PID <pid> /T /F`, treating already-missing PIDs as successful no-ops, and updating the legacy desktop terminal-host pty subprocess to use the same helper instead of importing `tree-kill` directly.
- Made pty-daemon process-tree discovery explicitly platform-aware so Windows returns an empty POSIX process-group table without spawning `ps`, while Unix keeps the existing `ps -axo pid=,ppid=,pgid=` parser behind focused coverage.
- Routed stale desktop terminal-host daemon PID cleanup through the same Windows `taskkill` helper, while preserving POSIX process-group signaling for Unix daemon cleanup.
- Hardened stale desktop terminal-host PID cleanup so Windows reads the candidate PID's command line with `powershell.exe` argv and only kills it when it matches the terminal-host daemon, avoiding accidental `taskkill` of an unrelated process after PID reuse.
- Cleared the external MSVC/Spectre prerequisite on this machine and verified `bun run --cwd apps/desktop install:deps`, `bun run --cwd apps/desktop prebuild`, and `bun run --cwd apps/desktop scripts/run-electron-builder.ts --publish never --win --x64`; the Windows NSIS installer and blockmap are generated under `apps/desktop/release`.
- Ported the host-service adoption e2e commands to native Windows shells, added `--test-force-exit` to the Electron-as-Node runner, and verified `bun run --cwd packages/host-service test:e2e` passes on Windows.
- Verified Docker Desktop and Caddy availability. Full `.superset/setup.local.ts` passes after building the GHCR-only neon-proxy image locally from upstream source with LF line endings; Postgres, neon-proxy, Electric, migrations, dev-account seed, config overlay, and teardown all complete on native Windows.
- Hardened desktop Anthropic model settings so placeholder text is not persisted as a credential and Bedrock-specific env vars are suppressed whenever a direct Anthropic API key/OAuth credential is available; rebuilt the Windows NSIS installer with the fix.
- Added a Windows NSIS reinstall reset page: the installer can replace the previous version while clearing Superset local auth/cache/runtime data, preserving `~/.superset/worktrees`; a separate checkbox moves Claude Code/mastracode login files aside with `.superset-reset.bak` for forced resync without hard-deleting them.
- Added local-test performance switches for packaged desktop builds: `SUPERSET_DISABLE_AUTO_UPDATE=1` skips update checks, and the local placeholder PostHog key `phc_local_dev_disabled` is now treated as telemetry disabled instead of making real PostHog network calls.

## Remaining Blockers

None known from the current Windows validation pass.

## Next Verification Targets

- Decide whether to vendor/document the local neon-proxy build fallback for Windows machines where GHCR blob downloads fail. The image source checkout must preserve LF line endings for `start.sh`.
- Investigate or suppress the non-failing `MaxListenersExceededWarning` emitted by the Electron/node-pty e2e harness after `packages/host-service test:e2e` passes.
