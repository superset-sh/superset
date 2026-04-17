# V2 Terminal Env Handoff

Last refined: 2026-04-05

## Goal

Define and implement a v2 terminal env contract that:

- matches common terminal patterns from GitHub sources
- preserves user-needed shell env for normal shell behavior
- includes explicit shell integration behavior for common shells
- uses only a shell-derived base env for PTYs
- avoids leaking desktop, Electron, and host-service runtime env into PTYs
- keeps the useful parts of the v1 Superset notification contract, but renames
  the v2-specific keys to make the contract clearer

This doc is meant to be handed to another agent to implement directly.

## Current state

Current checked-out v2 terminal flow:

- renderer opens `/terminal/${terminalId}?workspaceId=${workspaceId}`
- host-service spawns a fresh PTY per websocket-backed session
- host-service resolves the shell from inherited process env
- host-service currently spreads raw `process.env` into the PTY

Relevant code:

- `apps/desktop/src/main/lib/host-service-manager.ts`
- `apps/desktop/src/lib/trpc/routers/workspaces/utils/shell-env.ts`
- `packages/host-service/src/terminal/terminal.ts`
- `apps/desktop/src/main/lib/terminal/env.ts` for the existing v1 contract

Current PTY env in `packages/host-service/src/terminal/terminal.ts`:

```ts
{
  ...process.env,
  TERM: "xterm-256color",
  COLORTERM: "truecolor",
  HOME: process.env.HOME || homedir(),
  PWD: workspace.worktreePath,
}
```

This is too loose in two places:

1. host-service itself is spawned from desktop with an env built from desktop
   `process.env`
2. PTYs then inherit host-service `process.env` wholesale

That leaks whatever happens to be in the desktop and host-service runtime env
and does not define a stable contract for terminals.

## Upstream patterns to follow

GitHub sources:

- VS Code terminal env injection:
  https://github.com/microsoft/vscode/blob/main/src/vs/platform/terminal/node/terminalEnvironment.ts
- VS Code process env sanitization:
  https://github.com/microsoft/vscode/blob/main/src/vs/base/common/processes.ts
- kitty shell integration:
  https://github.com/kovidgoyal/kitty/blob/master/docs/shell-integration.rst
- WezTerm `TERM` docs:
  https://github.com/wezterm/wezterm/blob/main/docs/config/lua/config/term.md
- WezTerm shell integration:
  https://github.com/wezterm/wezterm/blob/main/docs/shell-integration.md
- Windows Terminal FAQ:
  https://github.com/microsoft/terminal/wiki/Frequently-Asked-Questions-%28FAQ%29

What these tools converge on:

- keep the public env surface small
- use shell-specific bootstrap vars only when loading shell integration
- sanitize app/runtime env before child processes and terminals instead of
  inheriting it wholesale
- do not rely on env vars for dynamic session state
- keep `TERM` conservative unless terminfo is actually shipped
- do not treat env vars as the only reliable terminal identity signal

Concrete VS Code pattern to follow:

- VS Code uses a small set of private bootstrap vars for shell integration such
  as `VSCODE_INJECTION`, `VSCODE_SHELL_ENV_REPORTING`, `VSCODE_PATH_PREFIX`,
  `ZDOTDIR`, and `USER_ZDOTDIR`
- VS Code also sanitizes process env before crossing process boundaries by
  stripping Electron and VS Code runtime keys like `ELECTRON_*` and most
  `VSCODE_*`

Superset v2 should follow the same shape:

- shell-derived env is the base
- Superset adds a small explicit public contract
- Superset strips its own runtime env before PTY launch instead of inheriting it
  by default

## Refined v2 contract

### 1. Env boundary

The shell-derived env snapshot is the only valid PTY base env.

For v2:

- desktop should spawn host-service with the runtime env it needs
- host-service should resolve a shell-derived env snapshot for terminal use
- host-service should preserve that shell snapshot as a dedicated terminal
  base env, separate from its own runtime `process.env`
- PTYs should be built from that dedicated shell snapshot plus explicit v2
  terminal vars

Desktop `process.env` is not a valid PTY env source.

Host-service `process.env` is not a valid PTY env source.

Host-service runtime vars may exist in the host-service process env for the
service itself, but they are not part of the PTY base env and must never be
passed through to user terminals by default.

### 2. Shell-derived base env

Use a clean-shell resolver colocated with the host-service terminal code.

But tighten the semantics:

- normal path: use the resolved shell snapshot from a clean spawn
- failure path: fail closed for terminal env construction

Important:

- the existing `getShellEnvironment()` helper spawns a subshell that inherits
  the full Electron `process.env`, which in dev includes all Vite `.env`
  secrets — that contaminates the snapshot at the source
- the existing helper also falls back to `process.env` when shell env
  resolution fails
- neither the contaminated snapshot nor the fallback are acceptable for v2
  terminal env construction

For v2, shell snapshot resolution must:

- spawn the user's login shell with a **minimal parent env** (HOME, USER,
  SHELL, PATH, TERM, and a few OS-specific keys) so that Vite `.env` secrets
  never enter the subshell
- let the shell's profile scripts populate the env with the user's actual
  vars (version managers, proxy config, SSH agent, etc.)
- throw on failure instead of falling back to `process.env`

This "clean spawn" approach means dev and production behave identically — the
snapshot only contains what the user's shell profile produces, never what
Electron or Vite loaded into the app process.

For v2, PTY creation must never degenerate into `...process.env` or any other
desktop-runtime fallback.

### 3. Public terminal env

Inject this stable terminal surface by default:

```sh
TERM=xterm-256color
TERM_PROGRAM=Superset
TERM_PROGRAM_VERSION=<app version>
COLORTERM=truecolor
LANG=<utf8 locale>
PWD=<cwd>
```

Notes:

- keep `TERM=xterm-256color` unless Superset ships and maintains terminfo
- `TERM_PROGRAM_VERSION` should come from the app/host-service version, not
  `npm_package_version`
- `PWD` should reflect the resolved launch cwd
- for the current v2 path, launch cwd is the workspace worktree path
- `HOME`, `PATH`, `SHELL`, proxy vars, SSH agent vars, and version-manager vars
  should come from the shell-derived base env rather than being redefined as
  part of the public contract

### 4. Superset-specific metadata retained in v2

We do want to keep a trimmed, explicit Superset contract for v2 notification
and integration flows.

Keep these explicit vars in v2:

```sh
SUPERSET_TERMINAL_ID=<terminal id>
SUPERSET_WORKSPACE_ID=<workspace id>
SUPERSET_WORKSPACE_PATH=<worktree path>
SUPERSET_ROOT_PATH=<repo root path, when available>
SUPERSET_ENV=<development|production>
SUPERSET_AGENT_HOOK_PORT=<desktop local agent hook server port>
SUPERSET_AGENT_HOOK_VERSION=<agent hook protocol version>
```

Rename the old v1 vars as follows:

- `SUPERSET_PANE_ID` -> `SUPERSET_TERMINAL_ID`
- `SUPERSET_PORT` -> `SUPERSET_AGENT_HOOK_PORT`
- `SUPERSET_HOOK_VERSION` -> `SUPERSET_AGENT_HOOK_VERSION`

Drop this key entirely in v2:

- `SUPERSET_TAB_ID`

Do not use a blanket `SUPERSET_*` passthrough rule in v2.

The v2 Superset metadata surface should stay explicit and minimal.

### 5. Shell behavior and integration

V2 should support the user's shell out of the box, similar to VS Code.

That means:

- launch the user's configured or default shell
- preserve normal shell startup behavior users expect
- make PATH, version managers, aliases, and shell config work without manual
  terminal setup

Use a hard-coded fallback shell only as a last resort:

- macOS/Linux: prefer inherited `SHELL`, then `/bin/sh`
- Windows: prefer inherited `COMSPEC`, then `cmd.exe`

Do not default to `/bin/zsh` just because the current implementation does.

Shell integration is in scope for v2.

Follow the VS Code and kitty pattern:

- use private bootstrap vars per shell only for startup
- examples: `ZDOTDIR`, `BASH_ENV`, `XDG_DATA_DIRS`
- clean them up after shell initialization when possible

Do not expose those bootstrap vars as part of the public v2 terminal contract.

Supported shells for the first v2 implementation:

- `zsh`
- `bash`
- `fish`
- `sh` and `ksh` as reduced-functionality login-shell fallbacks

Unsupported shells should still launch natively, but without Superset-specific
shell bootstrap beyond the base env contract.

Per-shell integration design:

- `zsh`
  - use wrapper startup through `ZDOTDIR`
  - set `SUPERSET_ORIG_ZDOTDIR` and temporary `ZDOTDIR`
  - launch as a login shell
- `bash`
  - use the generated Superset rcfile when available
  - launch with `--rcfile <path>`
- `fish`
  - use `-l --init-command ...`
  - prepend Superset bin dir idempotently after fish config loads
  - emit the shell-ready marker using fish-native event hooks
- `sh` and `ksh`
  - launch as login shells
  - no custom wrapper files in the first pass

This means v2 should not reuse the v1 desktop terminal env builder as-is, but
it should reuse the proven shell integration behavior and path conventions.

`apps/desktop/src/main/lib/terminal/env.ts` currently mixes together:

- safe env filtering
- shell wrapper bootstrap
- theme hints like `COLORFGBG`
- legacy Superset notification metadata

That builder should remain v1-oriented.

Instead, v2 should have a separate shell launch config layer that produces:

- `shell`
- `args`
- private bootstrap env

from:

- resolved shell path
- `SUPERSET_HOME_DIR`
- wrapper file availability

### 7. Dynamic state

Do not use env vars for:

- cwd updates after launch
- prompt boundaries
- command start/end markers
- exit status

If v2 needs those later, use shell integration and OSC sequences instead.

## Current implementation constraints

### Host-service launch env

`apps/desktop/src/main/lib/host-service-manager.ts` should keep responsibility
for launching host-service with the runtime env it needs.

Host-service itself must resolve and preserve the dedicated shell snapshot used
for PTY construction. PTYs must not be derived from desktop main or the live
host-service `process.env`.

### PTY context available in host-service

The host-service terminal session currently has first-class access to:

- `terminalId`
- `workspaceId`
- workspace `worktreePath`

Host-service can also derive:

- repo root path by joining workspace -> project and reading `projects.repoPath`

Host-service does not currently store a dedicated workspace display name in its
SQLite schema.

Implication:

- `SUPERSET_TERMINAL_ID`, `SUPERSET_WORKSPACE_ID`, and
  `SUPERSET_WORKSPACE_PATH` are straightforward
- `SUPERSET_ROOT_PATH` is straightforward with a join
- `SUPERSET_WORKSPACE_NAME` should not be part of the first v2 PTY contract

Do not invent a display name from `branch` or `id`.

## Files to update

Primary implementation targets:

- `apps/desktop/src/main/lib/host-service-manager.ts`
- `apps/desktop/src/lib/trpc/routers/workspaces/utils/shell-env.ts`
- `packages/host-service/src/terminal/terminal.ts`
- new: `packages/host-service/src/terminal/env.ts`
- new: `packages/host-service/src/terminal/env-strip.ts`
- new: `packages/host-service/src/terminal/shell-launch.ts`
- `apps/desktop/src/main/host-service/index.ts` (desktop entry point for host-service)

Secondary follow-up targets:

- `apps/desktop/src/main/lib/terminal/env.ts`
  only to clarify that it is the legacy v1 builder
- `apps/desktop/src/main/lib/agent-setup/templates/notify-hook.template.sh`
- `apps/desktop/src/main/lib/agent-setup/templates/gemini-hook.template.sh`
- `apps/desktop/src/main/lib/agent-setup/templates/copilot-hook.template.sh`
- `apps/desktop/src/main/lib/agent-setup/templates/cursor-hook.template.sh`
- `apps/desktop/src/lib/trpc/routers/terminal/terminal.ts`
- `apps/desktop/docs/EXTERNAL_FILES.md`

## Implementation plan

1. Tighten host-service spawn env in
   `apps/desktop/src/main/lib/host-service-manager.ts`.

   Implement a strict helper:

   - `resolveTerminalShellSnapshot(): Promise<Record<string, string>>`

   Required behavior:

   - call `getStrictShellEnvironment()`, which spawns the user's login shell
     with a minimal parent env (clean spawn) so Vite `.env` secrets never
     contaminate the snapshot
   - if shell resolution fails, throw — do not fall back to `process.env` or
     any filtered variant

   This policy is final for v2:

   - shell resolution failure is terminal-blocking
   - raw `process.env` passthrough is not allowed
   - filtered desktop-runtime fallback is not allowed

2. Build the final host-service process env explicitly in
   `apps/desktop/src/main/lib/host-service-manager.ts`.

   Replace the current `buildHostServiceEnv()` implementation with:

   - `shellSnapshot` from `resolveTerminalShellSnapshot()`
   - explicit runtime additions only

   The final host-service env must contain exactly:

   - all keys from `shellSnapshot`
   - `ELECTRON_RUN_AS_NODE=1`
   - `ORGANIZATION_ID`
   - `DEVICE_CLIENT_ID`
   - `DEVICE_NAME`
   - `HOST_SERVICE_SECRET`
   - `HOST_SERVICE_VERSION`
   - `HOST_MANIFEST_DIR`
   - `KEEP_ALIVE_AFTER_PARENT=1`
   - `HOST_DB_PATH`
   - `HOST_MIGRATIONS_PATH`
   - `DESKTOP_VITE_PORT`
   - `SUPERSET_HOME_DIR`
   - `SUPERSET_AGENT_HOOK_PORT`
   - `SUPERSET_AGENT_HOOK_VERSION`
   - `AUTH_TOKEN` only when present
   - `CLOUD_API_URL` only when present

   Source of each value:

   - `DESKTOP_VITE_PORT` comes from `shared/env.shared.ts`
   - `SUPERSET_AGENT_HOOK_PORT` comes from
     `shared/env.shared.ts` as `DESKTOP_NOTIFICATIONS_PORT`
   - `SUPERSET_AGENT_HOOK_VERSION` comes from the existing
     `HOOK_PROTOCOL_VERSION` constant for this change
   - `SUPERSET_HOME_DIR` comes from the already-resolved desktop app env

   Do not start from `...(process.env as Record<string, string>)`.

   Also persist the original `shellSnapshot` in host-service as the dedicated
   PTY base env. PTY construction must use that preserved snapshot, not
   host-service `process.env`.

3. Add `packages/host-service/src/terminal/env.ts` as the single source of
   truth for v2 PTY env construction.

   Required exports:

   - `resolveLaunchShell(baseEnv: Record<string, string>): string`
   - `normalizeUtf8Locale(baseEnv: Record<string, string>): string`
   - `getSupersetShellPaths(supersetHomeDir: string): { BIN_DIR: string; ZSH_DIR: string; BASH_DIR: string }`
   - `getShellBootstrapEnv(params): Record<string, string>`
   - `getShellLaunchArgs(params): string[]`
   - `stripTerminalRuntimeEnv(baseEnv: Record<string, string>): Record<string, string>`
   - `buildV2TerminalEnv(params): Record<string, string>`

4. Make `resolveLaunchShell(...)` deterministic.

   Required behavior:

   - on Windows: `baseEnv.COMSPEC || "cmd.exe"`
   - on non-Windows: `baseEnv.SHELL || "/bin/sh"`

   Do not default to `/bin/zsh`.

5. Make shell integration deterministic in
   `packages/host-service/src/terminal/env.ts`.

   Reuse the existing desktop shell behavior exactly:

   - `zsh`
     - shell args: `["-l"]`
     - private bootstrap env:
       - `SUPERSET_ORIG_ZDOTDIR = baseEnv.ZDOTDIR || baseEnv.HOME || homedir()`
       - `ZDOTDIR = <SUPERSET_HOME_DIR>/zsh`
     - only apply this bootstrap when `<SUPERSET_HOME_DIR>/zsh/.zshrc` exists
   - `bash`
     - shell args: `["--rcfile", "<SUPERSET_HOME_DIR>/bash/rcfile"]`
     - if the rcfile does not exist, fall back to `["-l"]`
     - no bootstrap env keys
   - `fish`
     - shell args:
       `["-l", "--init-command", "<existing fish init command used by desktop shell-wrappers.ts>"]`
     - no bootstrap env keys
   - `sh` and `ksh`
     - shell args: `["-l"]`
     - no bootstrap env keys
   - all other shells
     - shell args: `[]`
     - no bootstrap env keys

   Desktop remains responsible for creating:

   - `<SUPERSET_HOME_DIR>/bin`
   - `<SUPERSET_HOME_DIR>/zsh`
   - `<SUPERSET_HOME_DIR>/bash`

   Host-service is responsible for selecting shell args and bootstrap env.

6. Make PTY env filtering deterministic in
   `stripTerminalRuntimeEnv(...)`.

   Start from the dedicated terminal base env snapshot captured from the user's
   shell, not from a snapshot of host-service `process.env`.

   Remove these exact runtime keys:

   - `AUTH_TOKEN`
   - `CLOUD_API_URL`
   - `DESKTOP_VITE_PORT`
   - `DEVICE_CLIENT_ID`
   - `DEVICE_NAME`
   - `ELECTRON_RUN_AS_NODE`
   - `HOST_DB_PATH`
   - `HOST_MANIFEST_DIR`
   - `HOST_MIGRATIONS_PATH`
   - `HOST_SERVICE_SECRET`
   - `HOST_SERVICE_VERSION`
   - `KEEP_ALIVE_AFTER_PARENT`
   - `ORGANIZATION_ID`

   Remove these exact Node and app keys:

   - `NODE_ENV`
   - `NODE_OPTIONS`
   - `NODE_PATH`

   Remove keys with these prefixes:

   - `npm_`
   - `npm_config_`
   - `ELECTRON_`
   - `VITE_`
   - `NEXT_PUBLIC_`
   - `TURBO_`

   Treat these categories as internal runtime env, not terminal env:

   - `HOST_*`
   - `DESKTOP_*`
   - `DEVICE_*`
   - non-kept `SUPERSET_*`

   Keep these explicit Superset support keys when present:

   - `SUPERSET_HOME_DIR`
   - `SUPERSET_AGENT_HOOK_PORT`
   - `SUPERSET_AGENT_HOOK_VERSION`

   Do not preserve any other `SUPERSET_*` keys by prefix rule.

7. Make PTY env construction deterministic in `buildV2TerminalEnv(...)`.

   `buildV2TerminalEnv(...)` must:

   - start from `stripTerminalRuntimeEnv(baseEnv)`
   - merge private shell bootstrap env from `getShellBootstrapEnv(...)`
   - inject or override:
     - `TERM=xterm-256color`
     - `TERM_PROGRAM=Superset`
     - `TERM_PROGRAM_VERSION=<HOST_SERVICE_VERSION>`
     - `COLORTERM=truecolor`
     - `LANG=<normalized utf8 locale>`
     - `PWD=<cwd>`
     - `SUPERSET_TERMINAL_ID=<terminalId>`
     - `SUPERSET_WORKSPACE_ID=<workspaceId>`
     - `SUPERSET_WORKSPACE_PATH=<workspacePath>`
     - `SUPERSET_ROOT_PATH=<rootPath or "">`
     - `SUPERSET_ENV=<development|production>`
     - `SUPERSET_AGENT_HOOK_PORT=<SUPERSET_AGENT_HOOK_PORT>`
     - `SUPERSET_AGENT_HOOK_VERSION=<SUPERSET_AGENT_HOOK_VERSION>`

   `SUPERSET_WORKSPACE_NAME` is not part of the v2 PTY env.

8. Update `packages/host-service/src/terminal/terminal.ts`.

   `createTerminalSessionInternal(...)` must:

   - query the workspace as it does now
   - query the related project to derive `rootPath`
   - load the preserved shell snapshot for PTY env construction
   - resolve `shell` via `resolveLaunchShell(shellSnapshot)`
   - resolve `shellArgs` via `getShellLaunchArgs(...)`
   - build `ptyEnv` via `buildV2TerminalEnv(...)`
   - call `spawn(shell, shellArgs, { name: "xterm-256color", cwd, cols, rows, env: ptyEnv })`

   It must not read host-service `process.env` as the PTY base env.

   It must no longer call `spawn(resolveShell(), [], { env: { ...process.env, ... } })`.

9. Keep v1 and v2 separate.

   - do not make v2 call `apps/desktop/src/main/lib/terminal/env.ts`
   - do not make v2 reuse blanket `SUPERSET_*` passthrough
   - do not change v1 desktop terminal behavior in this change

## Acceptance criteria

- v2 host-service no longer spawns PTYs from raw `process.env`
- v2 host-service no longer uses host-service `process.env` as the PTY base env
- v2 host-service launch env no longer starts from raw desktop `process.env`
- v2 terminal creation fails closed when a real shell snapshot cannot be
  resolved
- user-needed shell env still works for normal tools and version managers
- zsh, bash, and fish launch with Superset shell integration behavior
- v2 PTY env includes `TERM_PROGRAM=Superset`
- v2 PTY env includes `SUPERSET_TERMINAL_ID`
- v2 PTY env includes `SUPERSET_WORKSPACE_ID`
- v2 PTY env includes `SUPERSET_WORKSPACE_PATH`
- v2 PTY env includes `SUPERSET_ROOT_PATH` when it is derivable
- v2 PTY env includes `SUPERSET_AGENT_HOOK_PORT`
- v2 PTY env includes `SUPERSET_AGENT_HOOK_VERSION`
- v2 PTY env does not include `SUPERSET_PANE_ID`
- v2 PTY env does not include `SUPERSET_TAB_ID`
- v2 PTY env does not include `SUPERSET_PORT`
- v2 PTY env does not include `SUPERSET_HOOK_VERSION`
- v2 PTY env does not require `SUPERSET_WORKSPACE_NAME`
- the v2 contract is defined in one place and documented

## Tests

Add or update tests around behavior regressions and boundary protection, not
around every field assignment.

Required test coverage:

- shell snapshot path
  - when a shell-derived env contains user PATH/tooling vars that are missing
    from app env, PTY env preserves them
  - PTY env is built from the preserved shell snapshot, not live host-service
    `process.env`
  - when shell resolution fails, terminal creation fails explicitly instead of
    falling back to desktop or host-service runtime env

- leakage prevention
  - app/runtime secrets do not reach PTY env
  - host-service control vars do not reach PTY env
  - dev-runner and Electron runtime vars do not reach PTY env:
    `npm_*`, `npm_config_*`, `ELECTRON_*`
  - removed legacy vars do not reach PTY env:
    `SUPERSET_PANE_ID`, `SUPERSET_TAB_ID`, `SUPERSET_PORT`,
    `SUPERSET_HOOK_VERSION`

- retained contract behavior
  - the minimal v2 Superset metadata needed by real consumers is present:
    `SUPERSET_TERMINAL_ID`, `SUPERSET_WORKSPACE_ID`,
    `SUPERSET_WORKSPACE_PATH`, `SUPERSET_AGENT_HOOK_PORT`,
    `SUPERSET_AGENT_HOOK_VERSION`
  - `TERM_PROGRAM=Superset` and a UTF-8 locale are present

- shell launch behavior
  - zsh launch config applies wrapper bootstrap only when wrapper files exist
    and otherwise degrades safely
  - bash launch config uses rcfile when present and login-shell fallback when
    absent
  - fish launch config uses the expected init-command path and does not crash
  - unsupported shells launch natively without Superset-specific bootstrap

- workspace-derived metadata
  - `SUPERSET_ROOT_PATH` is populated when project data is available
  - missing project/root metadata degrades to empty string rather than failure

- one integration-level PTY spawn test
  - host-service terminal session creation uses the preserved shell snapshot
    plus built env rather than `spawn(..., [], { env: { ...process.env } })`

Avoid low-value tests that only restate helper internals line-by-line or assert
every single key in isolation without covering a real regression risk.

Recommended test location:

- `packages/host-service/src/terminal/env.test.ts`
- targeted integration coverage near `packages/host-service/src/terminal/terminal.ts`

## Non-goals

- recreating the full v1 desktop hook contract unchanged
- using env vars for dynamic runtime session state

## Notes for implementation

- `apps/desktop/src/main/lib/terminal/env.ts` is not the right shared source
  for v2 because it is coupled to v1 desktop shell wrappers and legacy
  notification env names
- the pure shell launch logic in `apps/desktop/src/main/lib/agent-setup/shell-wrappers.ts`
  is the right behavioral reference for zsh, bash, and fish support
- `packages/host-service/src/terminal/terminal.ts` currently only has
  `workspaceId` on websocket attach, so launch cwd remains the workspace
  worktree path for this change
- `SUPERSET_WORKSPACE_NAME` is intentionally omitted from the first v2 PTY
  contract because there is no clean host-service source for it and no concrete
  v2 runtime consumer requiring it
