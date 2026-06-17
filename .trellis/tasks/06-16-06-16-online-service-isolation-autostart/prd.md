# Isolate online service ports and launchd autostart

## Goal

Make the Mac mini hosted Superset service independent from local development and Codex worktree development. The online service must run on its own high port range and be restorable automatically after a Mac restart.

## Requirements

- Add a repo-managed online service script that starts/stops/status-checks the hosted service without relying on whatever `.env` currently says for development ports.
- Move online app ports away from default dev ports:
  - Web: `43000`
  - API: `43001`
  - Electric proxy: `43012`
  - Relay: `43013`
- Move online data service ports away from default dev ports:
  - Electric upstream: `43009`
  - Postgres: `43014`
  - Neon HTTP proxy: `43015`
  - Redis: `43016`
  - KV REST: `43017`
- Keep public browser URLs pointing to the existing public domain ports:
  - `http://bj1.v.lhb.ink:63000`
  - `http://bj1.v.lhb.ink:63001`
  - `http://bj1.v.lhb.ink:63012`
  - `http://bj1.v.lhb.ink:63013`
- Install a user-level launchd job so the online service starts when the Mac user session starts after reboot.
- Do not change or depend on worktree/dev `.env` port blocks for online startup.
- Do not stop the current `3000/3001/3012/3013` transitional service until the new isolated ports are verified.

## Acceptance Criteria

- [x] `bun run online:start` starts Docker data dependencies and tmux app services on `430xx` ports.
- [x] `bun run online:status` reports tmux, Docker, local URLs, and public URL probe status.
- [x] `bun run online:stop` stops only the isolated online service.
- [x] `bun run online:install-launchd` installs and loads a LaunchAgent.
- [x] Local probes for `43000`, `43001`, `43012`, and `43013` return expected service responses.
- [x] The user can remap soft router ports `63000/63001/63012/63013` to `43000/43001/43012/43013`.
- [x] Running normal dev servers on `3000/3001` no longer conflicts with the isolated online service.

## Notes

- This task intentionally separates online operations from local dev and worktree operations. Online startup should use explicit environment overrides, not inherited root `.env` app ports.
- Implemented `scripts/superset-online.sh` with root scripts `online:start`, `online:stop`, `online:status`, `online:install-launchd`, and `online:uninstall-launchd`.
- Online local service ports are `43000` web, `43001` API, `43012` Electric proxy, and `43013` Relay.
- Online local data ports are `43009` Electric, `43014` Postgres, `43015` Neon proxy, `43016` Redis, and `43017` KV REST.
- Online Docker uses compose project `superset-online`, so containers and volumes are isolated from dev/worktree Docker state.
- Online app sessions use fixed tmux socket `~/Library/Application Support/Superset/online-tmux.sock` so launchd and manual status commands inspect the same sessions.
- launchd cannot directly execute or source scripts/env files under `~/Documents` on this Mac due TCC. `online:install-launchd` therefore copies the online script and `.env` snapshot into `~/Library/Application Support/Superset/`; rerun `bun run online:install-launchd` after changing online secrets.
- Verified launchd cold path by killing all `superset-online-*` tmux sessions, reinstalling the LaunchAgent, and confirming local probes:
  - `http://localhost:43000/sign-in` -> `200`
  - `http://localhost:43001/api/auth/get-session` -> `200`
  - `http://localhost:43012/v1/shape` -> `401`
  - `http://localhost:43013/health` -> `200`
- Public probes pass after the soft router maps `63000/63001/63012/63013` to `43000/43001/43012/43013`.
- Investigated a Canary "Restoring your session / Reconnecting to Superset services..." report after moving to the isolated online stack. The online service was healthy: `online:status` passed local and public probes, API `/api/auth/get-session` returned `200`, Relay `/health` returned `200`, and Electric correctly returned unauthenticated `401`.
- Root cause: the work computer had an old saved desktop token/JWT from the previous backend/auth environment. The isolated online Relay rejected that token with `JWKSNoMatchingKey`, and API `/api/auth/token` returned `401`. Server-side rejection is correct; accepting a token signed by the old JWK would weaken auth. The desktop UX bug was that authenticated routes retried session recovery forever instead of presenting a clear re-login path.
- Desktop fix: authenticated session recovery now performs one online recovery attempt for a saved local token. If the token cannot produce a cloud session, the app clears the local desktop token/JWT and returns to `/sign-in` so Canary users can sign in manually instead of waiting on "Restoring your session". A 20-second fallback still shows "Your saved session could not be restored" with Retry and Sign in again if the recovery request hangs instead of completing. The sign-in page also stops showing "Restoring your session" once a recovery attempt has failed.

## Validation

- `bun test apps/desktop/src/renderer/lib/auth-session-state.test.ts` -> pass.
- `bun run --cwd apps/desktop typecheck` -> pass.
- `bun run lint` -> pass.
- `python3 ./.trellis/scripts/task.py validate .trellis/tasks/06-16-06-16-online-service-isolation-autostart` -> pass.
- `bun run online:status` -> pass for local and public probes.
