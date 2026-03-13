# UI Blocking / Unbounded Work (Desktop Runtime)

Scope: `apps/desktop` runtime (main + renderer). Tests/scripts excluded.

## Critical
- **Main-thread DB init/migrations (sync)**: DB open + migrations run at module import; a locked DB or heavy migration freezes the main thread. `apps/desktop/src/main/lib/local-db/index.ts:76` `apps/desktop/src/main/lib/local-db/index.ts:90`
- **Auth crypto sync + no timeout**: `execFileSync`/`readFileSync` and `scryptSync` run on the main thread; slow disk or heavy scrypt can stall UI during auth. `apps/desktop/src/lib/trpc/routers/auth/utils/crypto-storage.ts:26` `apps/desktop/src/lib/trpc/routers/auth/utils/crypto-storage.ts:36` `apps/desktop/src/lib/trpc/routers/auth/utils/crypto-storage.ts:68`

## High
- **Worktree setup copy (sync)**: `cpSync` of `.superset` can be large and blocks main thread during workspace init. `apps/desktop/src/lib/trpc/routers/workspaces/utils/setup.ts:21`
- **Terminal host client sync fs in connect/spawn**: token read + log open/stat are synchronous; slow FS can stall terminal operations. `apps/desktop/src/main/lib/terminal-host/client.ts:615` `apps/desktop/src/main/lib/terminal-host/client.ts:1016`
- **Agent hook setup sync fs on startup**: multiple mkdir/write/read operations are synchronous. `apps/desktop/src/main/lib/agent-setup/index.ts:32` `apps/desktop/src/main/lib/agent-setup/agent-wrappers.ts:143` `apps/desktop/src/main/lib/agent-setup/notify-hook.ts:19` `apps/desktop/src/main/lib/agent-setup/shell-wrappers.ts:11`
- **Superset home dir setup sync fs**: mkdir + chmod on startup. `apps/desktop/src/main/lib/app-environment.ts:11`

## Medium
- **Locale lookup uses execSync**: blocks main thread (1s timeout). `apps/desktop/src/main/lib/terminal/env.ts:46`
- **Config router sync fs in tRPC handlers**: mkdir/write/read on main thread. `apps/desktop/src/lib/trpc/routers/config/config.ts:31` `apps/desktop/src/lib/trpc/routers/config/config.ts:108`
- **Window state sync fs**: read/write on startup/shutdown. `apps/desktop/src/main/lib/window-state/window-state.ts:27` `apps/desktop/src/main/lib/window-state/window-state.ts:50`
- **Static ports loader/watch sync fs**: `readFileSync`/`statSync` inside watch callbacks. `apps/desktop/src/main/lib/static-ports/loader.ts:89` `apps/desktop/src/main/lib/static-ports/watcher.ts:84`
- **Ringtone list sync fs**: `readdirSync` can block on slow/large dirs. `apps/desktop/src/lib/trpc/routers/ringtone/index.ts:128`
- **External app spawn waits without timeout**: tRPC waits for child exit; can hang indefinitely. `apps/desktop/src/lib/trpc/routers/external/helpers.ts:174`
- **Workspace init project lock waits forever**: no timeout or deadlock recovery; UI can hang waiting for init. `apps/desktop/src/main/lib/workspace-init-manager.ts:270`

## Low
- **Daemon emulator queue drain loop**: budgeted but still sync per tick; can jank under heavy output. `apps/desktop/src/main/terminal-host/session.ts:505`
- **Renderer attach scheduler sort-in-loop**: large queues can jank. `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/attach-scheduler.ts:28`
- **Tab name generation O(n^2)**: can jank with many tabs. `apps/desktop/src/renderer/stores/tabs/utils.ts:207`
- **Tray menu sync DB read**: small but sync on menu build. `apps/desktop/src/main/lib/tray/index.ts:147`

## Suggested Next Actions (if you want to fix)
- Move crypto + DB migrations off the main thread (worker/child process), or switch to async APIs with progress/timeout handling.
- Replace sync fs in main-process tRPC handlers with async equivalents (and add cancellation/timeout where possible).
- Add timeouts around external app spawns, and a lock timeout/backoff for workspace init locks.
