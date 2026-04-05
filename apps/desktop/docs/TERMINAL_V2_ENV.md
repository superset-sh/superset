# V2 Terminal Env Contract

Last updated: 2026-04-04

## Overview

V2 terminals use a defined env contract instead of raw `process.env` passthrough.

The env is built by stripping Superset / Electron / host-service internals from
the shell-derived base env, then injecting a small public terminal contract.

## Implementation

### Host-service (runtime)

`packages/host-service/src/terminal/env.ts` — `buildV2TerminalEnv()`

The host-service process env already contains the user's shell-derived env
(merged by the desktop app via `getProcessEnvWithShellPath` before spawning
host-service). The builder:

1. Reads `process.env` and drops undefined values
2. Strips internal vars via denylist (prefixes + exact matches)
3. Injects the public terminal contract

Used by `packages/host-service/src/terminal/terminal.ts`.

### Desktop app (canonical contract + tests)

`apps/desktop/src/main/lib/terminal/env.ts` — `buildV2TerminalEnv()`

Takes a pre-resolved `shellEnv` record (from `getShellEnvironment()`) and
applies the same stripping + injection. This is the canonical contract
definition with tests in `env.test.ts`.

## Public terminal env

```sh
TERM=xterm-256color
TERM_PROGRAM=Superset
TERM_PROGRAM_VERSION=<app version>
COLORTERM=truecolor
LANG=<utf8 locale>
PWD=<cwd>
```

All other user shell env vars (PATH, HOME, SSH_AUTH_SOCK, version managers,
proxy config, etc.) pass through from the shell-derived base env.

## Stripped vars

### By prefix

- `ELECTRON_` — Electron runtime internals
- `SUPERSET_` — Legacy hook metadata (v1 only)
- `VITE_` — Build-time frontend config
- `NEXT_PUBLIC_` — Build-time frontend config
- `TURBO_` — Build system
- `npm_` — npm lifecycle metadata
- `CHROME_` — Chromium internals

### By exact name

- `HOST_SERVICE_SECRET`, `HOST_DB_PATH`, `HOST_MIGRATIONS_PATH` — host-service config
- `AUTH_TOKEN`, `CLOUD_API_URL` — app auth/API config
- `ORGANIZATION_ID`, `DEVICE_CLIENT_ID`, `DEVICE_NAME` — device identity
- `CORS_ORIGINS`, `DESKTOP_VITE_PORT` — dev server config
- `GOOGLE_API_KEY` — Chromium API key
- `NODE_OPTIONS`, `NODE_ENV`, `NODE_PATH` — Node/Electron runtime
- `ORIGINAL_XDG_CURRENT_DESKTOP` — Electron internal

## What is NOT in v2

These v1 hook metadata vars are not injected unless a v2 feature explicitly
needs them:

- `SUPERSET_PANE_ID`
- `SUPERSET_TAB_ID`
- `SUPERSET_PORT`
- `SUPERSET_ENV`
- `SUPERSET_HOOK_VERSION`
- `SUPERSET_WORKSPACE_NAME`

## Files

| File | Role |
|------|------|
| `packages/host-service/src/terminal/env.ts` | Runtime v2 env builder |
| `packages/host-service/src/terminal/terminal.ts` | PTY spawn (uses builder) |
| `apps/desktop/src/main/lib/terminal/env.ts` | Canonical contract + `buildV2TerminalEnv` |
| `apps/desktop/src/main/lib/terminal/env.test.ts` | Tests |
