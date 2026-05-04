# CLI v1 Audit — Punch List

Code-level diff between the current CLI (`packages/cli/src/`) and the v1
shipping contract in `packages/cli/CLI_SPEC_TARGET.md`.

For each item: what's broken, where it lives, what the user sees, rough
effort to fix. Mark each `✅ fix` or `❌ skip` to plan the work.

Items are grouped by phase. Phase 1 fixes existing lies; Phases 2–4 build
toward the v1 contract; Phase 5 covers distribution gaps the spec doesn't
address yet.

---

## Phase 1 — Stop the CLI from claiming features it doesn't have

These ship false flags, throw "Not implemented", or silently ignore user
input. None of them require backend or spec changes — pure CLI cleanup.

### CLI-1.1 — `auth login` discards the web's org selection — ✅ fixed

- CLI now trusts `user.myOrganization.query()` (the just-bound session's
  active org) and only prompts when none is bound. Adds `--organization`
  flag for non-TTY logins (CLI-4.4 also closed). Verified end-to-end
  against local dev — picked org on web, CLI consumed it without
  re-prompting.
- **Decision**: ✅ fixed

### CLI-1.2 — `tasks list` filter flags are decorative — ✅ fixed

Backend `task.list` now accepts filter input (statusId/priority/
assigneeMe/assigneeId/creatorMe/search/limit/offset). CLI wires all flags
through. Verified.

### CLI-1.3 — `tasks create --branch` is dropped on the floor

- **Where**: `packages/cli/src/commands/tasks/create/command.ts:13`
- **Today**: ~~declares `--branch`, never passes it to `task.createFromUi.mutate`.~~
  Flag removed.
- **Note**: `tasks update` still declares `--branch` and passes it through;
  will break when **CLI-2.8** lands (drop `branch` from task schemas).
  Remove there too at that point or earlier.
- **Decision**: ✅ fixed

### CLI-1.4 — `tasks get/update/delete` can't resolve UUIDs — ✅ fixed

- Added `task.byIdOrSlug` procedure (CLI-2.5) that detects UUIDs by regex
  and falls back to slug lookup. CLI's get/update/delete commands all
  use it now.
- **Decision**: ✅ fixed

### CLI-1.5 — `automations update --device` clobbers on absence — ✅ fixed (CLI-side)

- Renamed `--device` to `--host`. The mutate call now spreads
  `targetHostId` only when `options.host !== undefined`. Server-side
  partial semantics fix (CLI-2.9) is still useful as defense-in-depth.
- **Decision**: ✅ fixed

### CLI-1.6 — `workspaces list/create/delete` are stubs — ✅ fixed

- **Implementation**:
  - `workspaces list` → cloud `v2Workspace.list` (joins on `v2_users_hosts`
    membership; supports `--host <id>` filter).
  - `workspaces create --host <id>` → `resolveHostTarget` → host-service
    `workspace.create` (loopback for local, relay for remote).
  - `workspaces delete <id...>` → cloud `v2Workspace.getFromHost` lookup to
    find the host → `resolveHostTarget` → host-service `workspace.delete`.
    `--host` flag short-circuits the lookup.
- **New helper**: `packages/cli/src/lib/host-target/resolveHostTarget.ts` —
  builds a typed host-service tRPC client (loopback or relay) using
  `getHostId()` for local detection and `buildHostRoutingKey()` for relay.
  Reusable for any future per-host CLI command.
- **Backend**: Added `v2Workspace.list` cloud procedure (was CLI-2.2).
- **Decision**: ✅ fixed

### CLI-1.7 — `devices list` is a stub — ✅ fixed (renamed to `hosts list`)

- Directory renamed `commands/devices/` → `commands/hosts/`, output shape
  matches target spec (`id, name, online`). Wired to new cloud
  `host.list` procedure (CLI-2.1). Verified end-to-end.
- **Decision**: ✅ fixed

### CLI-1.8 — `host install` is a stub — ✅ fixed (removed)

- **Where**: ~~`packages/cli/src/commands/host/install/command.ts`~~ deleted.
- **Note**: Out of scope for v1 per target spec; if/when boot-time install
  ships, recreate the command then. **CLI-5.4** (the v1 yes/no decision) is
  now resolved as "no, removed."
- **Decision**: ✅ fixed

### CLI-1.9 — Agent-env detection triggers on empty string — ✅ fixed

---

## Phase 2 — Backend prerequisites

Server-side work the CLI v1 contract depends on. Mostly independent of CLI
churn; can land as their own PRs.

### CLI-2.1 — `host.list` on cloud — ✅ fixed

Implemented in `packages/trpc/src/router/host/host.ts:list`. Joins
`v2_hosts ⋈ v2_users_hosts` filtered by user membership. Returns
`Array<{ id (=machineId), name, online, organizationId }>`. Verified.

### CLI-2.2 — Cloud `workspace.list` (cross-device read) — ✅ fixed

Implemented in `packages/trpc/src/router/v2-workspace/v2-workspace.ts:list`.
Wired into `superset workspaces list`.

CLI-2.2's previously-planned `create/delete` cloud routing wrappers were
dropped — CLI talks to host service directly (loopback or relay).

### CLI-2.3 — ~~`project.list` cloud routing wrapper~~ — dropped

- **Status**: No new procedure needed. `project.list` per spec is per-host;
  CLI calls host service directly (loopback or relay). `host-service` already
  has `project.list`.
- **Decision**: ✅ obsolete — covered by CLI's `resolveHostTarget` helper.

### CLI-2.4 — ~~Cloud → relay → host-service tRPC routing plumbing~~ — dropped for CLI scope

- **Status**: Not needed for CLI v1. The CLI uses its user JWT directly
  against relay; the relay's existing access middleware (verify JWT, call
  `host.checkAccess`) handles authz. No new shared module.
- **Note**: The cloud → relay path is still alive for **automation
  dispatch** (cron-fired, cloud-initiated). That existing pathway is
  unchanged.
- **Decision**: ✅ obsolete for CLI work.

### CLI-2.5 — `task.byIdOrSlug` procedure — ✅ fixed

Added in `packages/trpc/src/router/task/task.ts`. Detects UUID format
and routes to `getTaskById` / `getTaskBySlug` accordingly.

### CLI-2.6 — `task.list` filter input — ✅ fixed

`task.all` renamed → `task.list`, takes filter input
(`statusId/priority/assigneeMe/assigneeId/creatorMe/search/limit/offset`).
Joins `task_statuses` for `statusName` in result.

### CLI-2.7 — `task.create` consolidation — ✅ fixed

Old all-IDs `task.create` removed. `task.createFromUi` renamed to
`task.create`. Desktop `CreateTaskDialog` and CLI updated.

### CLI-2.8 — Drop `branch` from task schemas — ✅ fixed (schema only)

`branch` removed from `createTaskSchema` and `updateTaskSchema`. CLI's
`tasks update --branch` flag also dropped. Database column drop deferred
to a separate migration when convenient (low priority — column is
nullable, doesn't break anything to leave it).

### CLI-2.9 — `automation.update` partial-semantics fix — ✅ already correct

The procedure already implements `input.targetHostId === undefined ?
existing.targetHostId : input.targetHostId` semantics for `targetHostId`
and `?? existing.agentConfig` for `agentConfig`. The CLI was the bug
(CLI-1.5), already fixed.

### CLI-2.10 — `automation.create` workspace-only mode — ✅ fixed

Schema: `v2ProjectId` now optional, with `.refine()` requiring at least
one of `v2ProjectId/v2WorkspaceId`. Mutation: when only
`v2WorkspaceId` is provided, looks up the workspace's projectId from
`verifyWorkspaceInOrg` (now returns `{id, projectId}`).

### CLI-2.12 — `jwtProcedure` session-token fallback (discovered during e2e)

- **Where**: `packages/trpc/src/trpc.ts:73`.
- **Found during**: e2e testing the new `hosts list` / `workspaces list`
  commands. Both are `jwtProcedure` and rejected the CLI's session-token
  bearer ("Session expired").
- **Original behavior**: `jwtProcedure` only verified signed JWTs. Worked
  for relay-forwarded user JWTs and host-service-minted JWTs but not for
  session tokens carried in `Authorization: Bearer`.
- **Fix**: After failed JWT verify, fall back to `ctx.session` (which
  better-auth populates from session-token bearers via `getSession`).
  Derives `organizationIds` from `members` table.
- **Status**: ✅ fixed.

### CLI-2.13 — Sign-in middleware drops query params (discovered during e2e)

- **Where**: `apps/web/src/proxy.ts`.
- **Original behavior**: Unauth requests to any non-public route got
  redirected to bare `/sign-in` — query params lost. Caused `/cli/authorize`
  and `/oauth/consent` to silently bounce users to the app root after
  sign-in.
- **Fix**: Middleware now stashes `{path, params}` in a short-lived
  `superset_pending_auth_redirect` cookie, sends user to
  `/sign-in?redirect=<path>`. Pages call `consumePendingAuthParams()`
  helper to recover params after sign-in.
- **Status**: ✅ fixed. Helper at
  `apps/web/src/app/utils/pendingAuthRedirect/`.

### CLI-2.11 — Host service writes `{ hostId, hostName }` to manifest — ✅ resolved differently

Originally planned: stamp `getHostId()` + `getHostName()` into the
manifest. **Better solution**: `getHostName()` returns the OS hostname,
but users can rename hosts in the cloud UI. Stamping it into the
manifest would show a stale name. Instead, `host status` now calls
`host.list` and looks up the current cloud-side name by matching
`getHostId()` against `id`. Manifest stays minimal.

---

## Phase 3 — Terminology + spec alignment

Rename / move work after backend lands. Mostly mechanical.

### CLI-3.1 — Rename `~/superset/` → `~/.superset/` — ✅ fixed

### CLI-3.2 — Honor `SUPERSET_HOME_DIR` env var — ✅ fixed

### CLI-3.3 — Drop `--api-url` flag, `apiUrl` config, `SUPERSET_API_URL` env — ✅ fixed

`env.CLOUD_API_URL` (build-time constant) is now the sole source.
`getApiUrl(config)` → `getApiUrl()`. `config.apiUrl` deleted.
`createApiClient(config, opts)` → `createApiClient(opts)`.

### CLI-3.4 — `device` → `host` terminology — ✅ fixed

`--device` flags renamed to `--host` (automations create/update). Global
`--device` option removed from `cli.config.ts`. `DeviceConfig`,
`readDeviceConfig`, `ctx.deviceId` all removed. `SUPERSET_DEVICE` env var
gone.

### CLI-3.5 — `auth check` → `auth status` — ✅ fixed

Directory renamed. Output dropped `apiUrl` field (per spec).

### CLI-3.6 — `devices list` → `hosts list` — ✅ fixed

Directory renamed, output shape per spec, wired to cloud `host.list`.

### CLI-3.7 — Manifest type adds `hostId` / `hostName` — ✅ resolved (different approach)

Resolved alongside CLI-2.11: the manifest stays minimal; `host status`
queries cloud `host.list` for the current name. See CLI-2.11.

---

## Phase 4 — Missing surface

New commands and routing logic.

### CLI-4.1 — `projects list` — ✅ fixed

New command at `packages/cli/src/commands/projects/list/`. Uses the
shared `resolveHostTarget()` helper (loopback or relay) to call the host
service's `project.list` procedure. Backend host-service `project.list`
extended to return `repoOwner / repoName / repoUrl / repoPath`.

### CLI-4.2 — `automations logs` — ✅ fixed

New command at `packages/cli/src/commands/automations/logs/`. Calls the
existing `automation.listRuns` cloud procedure with `automationId` and
`limit`.

### CLI-4.3 — Local-vs-relay routing — ✅ fixed

Implemented as `resolveHostTarget()` in
`packages/cli/src/lib/host-target/`. Returns a typed tRPC client against
host-service's AppRouter for either loopback or relay transport.
Reused by `workspaces` and `projects` commands; canonical helper for
any future per-host CLI command.

### CLI-4.4 — `--organization` flag on `auth login` — ✅ fixed (with CLI-1.1)

---

## Phase 5 — Distribution + update mechanism

Gaps in the spec docs themselves. Need decisions before building.

### CLI-5.1 — `superset update` mechanism — ✅ fixed

New `superset update` command at
`packages/cli/src/commands/update/command.ts`:

- Detects target (`darwin-arm64`, `linux-x64`).
- Fetches latest `cli-v*` release from GitHub
  (`/repos/superset-sh/superset/releases/latest`).
- Downloads matching `superset-<target>.tar.gz` asset.
- Extracts to a tempdir; verifies the new layout has `bin/superset`.
- Atomic-replaces the install root: rename current → `.bak`, move new
  in, on failure roll back; on success delete `.bak`.
- `--check` flag prints version comparison without installing.
- `--force` re-installs even when on the latest version.
- Refuses to run from a dev build (`SUPERSET_VERSION="0.0.0-dev"`).
- Build-time `SUPERSET_VERSION` define added to cli.config.ts; exposed
  via `env.VERSION`.
- Install root is `dirname(dirname(process.execPath))` matching the
  build-dist layout (`bin/superset`, `lib/`, `share/migrations/`).

Caveats explicitly out of scope: signature/checksum verification (covered
by CLI-5.3 below), Homebrew-installed binaries (CLI-5.2 — those should
update via `brew upgrade`).

### CLI-5.2 — Distribution channels — design committed

- **GitHub release tarballs**: ✅ canonical channel. `build-cli.yml`
  produces them; `superset update` consumes them.
- **Homebrew**: ✅ secondary. `bump-homebrew.yml` already wired up; users
  install via `brew install superset/tap/superset` and update via
  `brew upgrade`. `superset update` on a brew-installed binary should
  detect that and tell the user to use brew (future CLI tweak).
- **install.sh**: deferred. Not a v1 blocker — the GitHub release
  already provides direct-download tarballs; `curl | sh` wrapper is
  cosmetic.
- **Windows (winget/scoop/MSI)**: deferred. Bun's
  `--target=windows-x64` works but `build-dist.ts` doesn't currently
  produce Windows artifacts. Add when there's user demand.
- **Linux (deb/rpm/AUR)**: deferred. Tarball is sufficient for v1.

### CLI-5.3 — Code signing — deferred (out of scope for v1)

Acknowledged trade-off:
- macOS Gatekeeper: users see "right-click → Open" the first time they
  run an unsigned binary. Acceptable friction for v1 dev-tool audience;
  Apple Developer ID + notarization is ~$99/year and a multi-day
  pipeline change. Defer.
- Windows SmartScreen: not relevant since Windows isn't shipped in v1.
- Linux: no equivalent gatekeeping; tarballs work as-is.

When user demand grows, revisit. Add to a follow-up CLI-vNext milestone.

### CLI-5.4 — Decide on `host install` for v1 — ✅ resolved (removed)

- Removed in **CLI-1.8**.

---

## ⚠️ Quality issues — small bets

### CLI-Q.1 — `tasks delete` partial-failure cleanup — ✅ fixed

Each ID gets its own try/catch; success vs failure reported in
`{ deleted, failed }`. On any failure, exits non-zero with a per-id
breakdown.

### CLI-Q.2 — `config.ts` permission discipline — ✅ fixed

`device.json` removed entirely (CLI-3.4 made it obsolete). `ensureDir`
now also re-chmods the parent dir to `0o700` if it has stray perms.

### CLI-Q.3 — Token expiry is wall-clock-only — ✅ fixed

5-min clock-skew tolerance added in `resolve-auth.ts`:
`if (config.auth.expiresAt + CLOCK_SKEW_MS < Date.now())`.

### CLI-Q.4 — `--quiet` was overridden by agent-mode JSON (discovered during e2e)

Spec target: agent-mode auto-JSON should NOT trigger when `--quiet` is
passed. Old: `isJson = jsonFlag ?? isAgentMode()` — `--quiet` couldn't
override. **Fix**: `isJson = jsonFlag ?? (!isQuiet && isAgentMode())`.

---

## Audit completeness notes

- Cross-checked every command file under `packages/cli/src/commands/**`.
- Did **not** deeply trace help text rendering, table formatting, or
  cli-framework internals beyond the agent-env detection.
- Did **not** run the CLI end-to-end against a live cloud — findings are
  static-analysis only.
- Backend prereq items reflect target-spec promises; verified procedure
  shapes only spot-checked (e.g. confirmed `task.all` takes no input).
