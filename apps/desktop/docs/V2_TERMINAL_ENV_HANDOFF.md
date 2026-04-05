# V2 Terminal Env Handoff

Last reviewed: 2026-04-04

## Goal

Define and implement a v2 terminal env contract that matches common terminal
patterns from GitHub sources, preserves user-needed shell env, and does not
carry over the old desktop hook metadata unless v2 has an explicit consumer.

This doc is meant to be handed to another agent to implement directly.

## Current state

Current checked-out v2 terminal flow:

- renderer uses `workspaceId` to open `/terminal/${workspaceId}`
- host-service spawns a fresh PTY per websocket
- host-service passes raw `process.env` into the PTY, then overrides a few vars

Current PTY env in
`packages/host-service/src/terminal/terminal.ts`:

```ts
{
  ...process.env,
  TERM: "xterm-256color",
  COLORTERM: "truecolor",
  HOME: process.env.HOME || homedir(),
  PWD: workspace.worktreePath,
}
```

This is too loose. It leaks whatever happens to be in host-service env and does
not define a stable contract for terminals.

## Upstream patterns to follow

GitHub sources:

- VS Code terminal env injection:
  https://github.com/microsoft/vscode/blob/main/src/vs/platform/terminal/node/terminalEnvironment.ts
- kitty shell integration:
  https://github.com/kovidgoyal/kitty/blob/master/docs/shell-integration.rst
- WezTerm `TERM` docs:
  https://github.com/wezterm/wezterm/blob/main/docs/config/lua/config/term.md
- WezTerm shell integration:
  https://github.com/wezterm/wezterm/blob/main/docs/shell-integration.md
- Windows Terminal FAQ:
  https://github.com/microsoft/terminal/wiki/Frequently-Asked-Questions-%28FAQ%29

What these tools converge on:

- Keep the public env surface small.
- Use shell-specific bootstrap vars only when loading shell integration.
- Do not rely on env vars for dynamic session state.
- Keep `TERM` conservative unless terminfo is actually shipped.
- Forward only a narrow subset across boundaries like SSH or WSL.

Examples:

- VS Code starts from inherited env, strips VS Code / Electron internals, then
  injects private bootstrap vars such as `VSCODE_INJECTION`,
  `VSCODE_SHELL_ENV_REPORTING`, `VSCODE_PATH_PREFIX`, and temporary `ZDOTDIR`.
- kitty uses `KITTY_SHELL_INTEGRATION` and shell-specific startup env like
  temporary `ZDOTDIR` or modified `XDG_DATA_DIRS`.
- WezTerm defaults to `TERM=xterm-256color` and only recommends a custom
  `TERM` once terminfo is installed.
- Windows Terminal explicitly warns that env vars are not a reliable sole
  terminal detection mechanism.

## Proposed v2 contract

### 1. Base env source

Start from the user's resolved shell env, not raw host-service `process.env`.

Use the resolved shell snapshot itself as the PTY base env.

This repo already has the primitive for that in
`apps/desktop/src/lib/trpc/routers/workspaces/utils/shell-env.ts`.

For v2, follow VS Code's shape:

- build the PTY env from the shell-derived base env
- strip only Superset / Electron / host-service internals
- inject a small explicit public terminal contract

Do not add a broad second allowlist layer on top of an already shell-derived
base env.

Do not pass arbitrary host-service `process.env` through to user terminals.

### 2. Public terminal env

Inject only this small stable surface by default:

```sh
TERM=xterm-256color
TERM_PROGRAM=Superset
TERM_PROGRAM_VERSION=<app version>
COLORTERM=truecolor
LANG=<utf8 locale>
PWD=<cwd>
```

Notes:

- Keep `TERM=xterm-256color` unless Superset ships and maintains terminfo.
- `PWD` should reflect the resolved launch cwd.
- `LANG` should be normalized to a UTF-8 locale.

### 3. Shell behavior

V2 should support the user's shell out of the box, similar to VS Code.

That means:

- launch the user's configured/default shell
- preserve normal shell startup behavior users expect
- make PATH, version managers, aliases, and shell config work without manual
  terminal setup

Use a hard-coded fallback shell only as a last resort.

### 4. Superset metadata

Do not carry over the old metadata contract by default.

Do not inject these into v2 unless a concrete v2 feature requires them:

- `SUPERSET_PANE_ID`
- `SUPERSET_TAB_ID`
- `SUPERSET_PORT`
- `SUPERSET_ENV`
- `SUPERSET_HOOK_VERSION`
- `SUPERSET_WORKSPACE_NAME`

If v2 later needs Superset-specific metadata, add only the minimum explicit
keys, not a blanket `SUPERSET_*` prefix passthrough.

Reason:

- the current desktop terminal env builder still carries legacy hook metadata
- v2 should define any future Superset metadata explicitly, not via blanket
  prefix rules

### 5. Shell integration

If v2 later adds shell integration, follow the VS Code / kitty pattern:

- use private bootstrap vars per shell only for startup
- examples: `ZDOTDIR`, `BASH_ENV`, `XDG_DATA_DIRS`
- clean them up after shell initialization when possible

Do not expose those bootstrap vars as part of the public terminal contract.

### 6. Dynamic state

Do not use env vars for:

- cwd updates after launch
- prompt boundaries
- command start/end markers
- exit status

If v2 needs those later, use shell integration and OSC sequences instead.

## Files to update

Primary implementation targets:

- `packages/host-service/src/terminal/terminal.ts`
- `apps/desktop/src/main/lib/terminal/env.ts`

Likely implementation direction:

1. Extract a shared v2 terminal env builder instead of spreading `process.env`
   in host-service.
2. Use the resolved shell env snapshot from
   `apps/desktop/src/lib/trpc/routers/workspaces/utils/shell-env.ts` as the
   PTY base env.
3. Reuse the existing shell resolution logic so v2 launches the user's
   configured/default shell, not a hard-coded fallback except as a last resort.
4. Add targeted stripping for Superset / Electron / host-service runtime vars
   that should not leak into terminals.
5. For v2, do not reuse `buildTerminalEnv()` as-is because it currently adds
   the old hook metadata contract.
6. Define a v2-specific env builder with:
   - shell-derived base env
   - targeted stripping
   - small public terminal vars
   - no legacy hook metadata
7. Add tests for:
   - shell-derived user env survives
   - default/configured shell launches correctly
   - host-service/app secrets do not leak
   - v1-only `SUPERSET_*` vars are absent
   - `TERM_PROGRAM` and `TERM_PROGRAM_VERSION` are present

## Acceptance criteria

- v2 terminal no longer spreads raw `process.env` into the PTY
- user-needed shell env still works for normal tools and version managers
- v2 PTY env includes `TERM_PROGRAM=Superset`
- v2 PTY env does not include `SUPERSET_PANE_ID`, `SUPERSET_TAB_ID`, or
  `SUPERSET_PORT`
- the contract is defined in one place and documented

## Non-goals

- changing terminal transport from workspace-scoped to terminal-scoped
- adding shell integration in this change
- recreating the old desktop notification hook contract in v2
