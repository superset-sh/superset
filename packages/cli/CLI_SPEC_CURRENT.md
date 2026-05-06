# Superset CLI Current-State Reference

This document is a source-derived inventory of the CLI as implemented right
now. It is not a future product spec and it is not a release target. Anything
listed as stubbed, broken, ignored, or missing below should be treated as a real
current-state gap.

Source snapshot used for this inventory:

- CLI package: `packages/cli`
- CLI config: `packages/cli/cli.config.ts`
- Command files: `packages/cli/src/commands/**/command.ts`
- CLI middleware: `packages/cli/src/commands/middleware.ts`
- CLI framework: `packages/cli-framework/src`
- API client: `packages/cli/src/lib/api-client.ts`
- Relevant API routes: `apps/api/src/app/api/cli/*`
- Relevant tRPC routers: `packages/trpc/src/router`

## Current Inventory

| Area | State | Notes |
| --- | --- | --- |
| Auth | Partial | OAuth login, logout, and auth inspection exist. The command is `auth check`, not `auth whoami`. |
| Organizations | Working | Lists organizations and switches the locally configured active organization. |
| Tasks | Partial | CRUD exists through tRPC, but list filters are accepted and ignored. Get/update/delete resolve by slug only despite help saying ID or slug. |
| Automations | Partial | List/get/create/update/delete/pause/resume/run exist. There is no `logs` command even though the API has `automation.listRuns`. |
| Devices | Stub | `devices list` appears in help but throws `Not implemented` after auth resolves. |
| Workspaces | Stub | `workspaces list/create/delete` appear in help but throw after auth/device resolution. |
| Host service | Partial | start/status/stop exist. install is a no-op stub. start requires a sibling `superset-host` binary or `SUPERSET_HOST_BIN`. |
| Projects | Missing | No CLI commands exist. |
| UI, tabs, panes, terminal/browser/chat panes | Missing | No CLI commands exist. |
| Chat sessions | Missing | No CLI commands exist. |
| Notifications | Missing | No CLI commands exist. |
| Ports | Missing | No CLI commands exist. |

## Source Map

Top-level command groups are discovered from `packages/cli/src/commands/*`.

| Group | Source | Commands | Alias |
| --- | --- | --- | --- |
| `auth` | `src/commands/auth` | `check`, `login`, `logout` | none |
| `automations` | `src/commands/automations` | `create`, `delete`, `get`, `list`, `pause`, `resume`, `run`, `update` | `auto` |
| `devices` | `src/commands/devices` | `list` | none |
| `host` | `src/commands/host` | `install`, `start`, `status`, `stop` | none |
| `organization` | `src/commands/organization` | `list`, `switch` | none |
| `tasks` | `src/commands/tasks` | `create`, `delete`, `get`, `list`, `update` | `t` |
| `workspaces` | `src/commands/workspaces` | `create`, `delete`, `list` | `ws` |

There are no command directories for projects, agents, UI control, chat,
notifications, or ports.

Verification commands used while building this inventory:

```bash
find packages/cli/src/commands -type f -name 'command.ts' | sort
bun run dev -- --help
bun run dev -- auth --help
bun run dev -- tasks list --help
bun run dev -- automations create --help
bun run dev -- automations update --help
bun run dev -- workspaces create --help
```

## Current Bug And Gap Register

These are not target decisions. They are current behavior or current mismatch
observed in source.

| ID | Area | Current behavior | Why it matters |
| --- | --- | --- | --- |
| CLI-CURRENT-001 | Auth | `auth check` exists; `auth whoami` does not. | Existing docs/specs using `whoami` are wrong. |
| CLI-CURRENT-002 | Auth | `auth login --api-url` persists a custom API URL to config. | A distributed production CLI can get stuck pointing at a stale or wrong API. |
| CLI-CURRENT-003 | Auth | Non-TTY login with multiple orgs stores `auth` but skips org selection and never writes `organizationId`. | Every subsequent authenticated command then fails with no active organization until the user runs `organization switch`. There is no `auth login --organization` flag to resolve this non-interactively. |
| CLI-CURRENT-004 | Config | CLI state is under `~/superset`, not `~/.superset`. The CLI hardcodes `homedir() + "superset"` and does not honour the `SUPERSET_HOME_DIR` env var that the desktop app reads. | Existing mental model/docs may point users at the wrong files; see CLI-CURRENT-034 for the host-DB consequence. |
| CLI-CURRENT-005 | Tasks | `tasks list` accepts filters but ignores all of them and calls `task.all`. | Users/scripts get unfiltered results while the command appears successful. |
| CLI-CURRENT-006 | Tasks | `tasks get/update/delete` claim ID-or-slug semantics in descriptions, but call `task.bySlug`. | UUID usage fails even though help implies it should work. |
| CLI-CURRENT-007 | Tasks | `tasks create --branch` is parsed but not sent to the API, and `createTaskFromUiSchema` does not include `branch` either, so the field would be stripped server-side even if sent. `tasks update --branch` does work because `updateTaskSchema` accepts `branch`. | Silent ignored input on create; requires both a CLI fix and a server schema change to support. |
| CLI-CURRENT-008 | Automations | There is no `automations logs` command. | API has `automation.listRuns`, but CLI users cannot access run history. |
| CLI-CURRENT-009 | Automations | `automations get` drops `recentRuns` from the API response. | Run history is fetched then intentionally hidden. |
| CLI-CURRENT-010 | Automations | `automations update` sends `targetHostId: options.device ?? null`. | Updating without `--device` clears the target host. `automations create` uses the same `?? null` pattern, but on create that is intentional (no existing host to preserve). |
| CLI-CURRENT-011 | Automations | `automations create --project` is required at runtime, not by the option parser. | Help output does not mark the requirement and parser errors are delayed. |
| CLI-CURRENT-012 | Automations | `automations create --workspace` still requires `--project`. | Reusing a workspace cannot be expressed with workspace ID alone. |
| CLI-CURRENT-013 | Devices | `devices list` is a stub that throws after auth. | The command appears in help but is not usable. |
| CLI-CURRENT-014 | Workspaces | `workspaces list/create/delete` are stubs that throw after auth/device resolution. | The group appears in help but no workspace command is usable. |
| CLI-CURRENT-015 | Host | `host install` is a stub and skips auth. | The command appears in help but does not install anything. |
| CLI-CURRENT-016 | Host | `host start` requires `superset-host` as a sibling binary or `SUPERSET_HOST_BIN`. | Source/dev invocation fails unless the host binary path is supplied. |
| CLI-CURRENT-017 | Framework | Required *named flag* options are not labelled as required in command help. Required *positional arguments* are labelled `(required)` and use angle brackets in usage; the gap is specifically named flags. | Users cannot reliably infer required flags from help text. |
| CLI-CURRENT-018 | Framework | Leaf and group help do not show inherited global options. The omitted set is `--json`, `--quiet`, `--device`, `--api-key`, `--help`/`-h`, and `--version`/`-v`; only root help lists `--help` and `--version`. | Users cannot discover globals from grouped or leaf help. |
| CLI-CURRENT-019 | Output | `--json` prints `result.data` when the command returns `{ data: X }`, or the raw return value when the command returns a value directly (e.g., `automations list` returns the API array, so JSON mode prints the full array). It never wraps in `{ "data": ... }`. | The old spec's JSON examples are wrong, and the two return styles in the codebase produce different envelopes. |
| CLI-CURRENT-020 | Distribution | `package.json` only has build scripts for `darwin-arm64` and `linux-x64`. | Other architectures are not currently first-class build targets. |
| CLI-CURRENT-021 | Host | `host stop` does not call `removeManifest()` if `process.kill(SIGTERM)` throws. The catch wraps the failure in `CLIError` and returns early, leaving a stale manifest on disk. | A failed stop wedges the user — subsequent `host start` and `host status` see a manifest pointing at a process the CLI could not kill. |
| CLI-CURRENT-022 | Config | `readConfig()` and `readDeviceConfig()` call `JSON.parse` with no try/catch around the file contents. | If `~/superset/config.json` or `~/superset/device.json` is corrupted (truncated write, manual edit) every CLI command crashes with a raw `SyntaxError` that bypasses the framework's error formatter. |
| CLI-CURRENT-023 | Host | `host start` calls `p.spinner()` without a `process.stdout.isTTY` guard. `auth login` guards the same call. | When stdout is piped (CI, agents, `bun run dev` through turbo) every animation frame is flushed as a separate line, spamming the output. |
| CLI-CURRENT-024 | Auth/config | `SUPERSET_API_URL` only takes effect on `auth login` (it is a local option on that command). All other commands read `config.apiUrl` via `getApiUrl(config)`, so setting the env var for `tasks list`, `automations list`, etc. is silently ignored. | There is no runtime API URL override beyond re-running `auth login`. |
| CLI-CURRENT-025 | Host | `spawnHostService` spreads `...process.env` into the host child's env before applying its own overrides. | Anything in the CLI's environment (e.g., `SUPERSET_API_KEY`) is inherited by the host binary. |
| CLI-CURRENT-026 | Tasks | `tasks create` does not null-check `result.task` before reading `slug`/`title`. | If `task.createFromUi` returns `{ task: null }` the success message prints `Created task undefined: undefined` and JSON mode prints `null`. |
| CLI-CURRENT-027 | Automations | `automations resume` calls `result.nextRunAt?.toISOString()` assuming SuperJSON deserialised the field as a `Date`. | If the API returns a string or the transformer is misconfigured, the command throws `TypeError: ... toISOString is not a function` instead of a clean error. |
| CLI-CURRENT-028 | Automations | When neither `--agent` nor `--agent-config-file` is provided, `automations update` sends `agentConfig: undefined`. | Whether the API treats `undefined` as "no change" or "clear" is not documented; the field can silently change behind the user's back. Same class of bug as CLI-CURRENT-010 but for the agent config. |
| CLI-CURRENT-029 | Host | `host start`'s "already running" early-exit returns `{ pid, endpoint }`; a fresh start returns `{ pid, port, organizationId }`. | The JSON output shape is inconsistent across invocations of the same command. |
| CLI-CURRENT-030 | Workspaces | `workspaces list` declares table columns `["name", "branch", "projectName"]` without custom headers, so the framework auto-uppercases them to `NAME BRANCH PROJECTNAME` (last column runs together as one word). | Cosmetic today because the command is a stub, but it ships broken once implemented. |
| CLI-CURRENT-031 | Framework | `host/meta.ts` declares `standalone: true`; the framework's `CliGroup` type does not include the field and no code path reads it. | Dead configuration — confusing for anyone who assumes it changes behaviour (e.g., skipping middleware). |
| CLI-CURRENT-032 | Auth | `resolveAuthSource` decides `flag` vs `env` by scanning `process.argv` for any element starting with `--api-key`. | False-positive risk for any future option named `--api-key-*`; also depends on raw argv ordering, which differs between `bun run dev`, packaged binary, and shell wrappers. |
| CLI-CURRENT-033 | Framework | `isAgentMode()` checks `process.env[v] !== undefined`, so an empty-string env (`CI=`, `CLAUDE_CODE=`) flips output to JSON. | Surprising for shells that set empty env vars without intent. |
| CLI-CURRENT-034 | Host | The CLI and the desktop app target *different* host directories. CLI uses `~/superset/host/<orgId>/`; desktop uses `~/.superset/host/<orgId>/` (or `~/.superset-<workspace>/...` in dev). The manifest schema is shared, but the paths are not, so neither client sees the other's manifest, port, secret, or `host.db`. | Running `superset start` while the desktop app is running spawns a second, isolated host service against a separate SQLite file. State written by one client is invisible to the other. |

## Invocation

During development, run commands from `packages/cli`:

```bash
bun run dev -- <command> [options]
```

The configured binary name is `superset`.

```bash
superset <command> [options]
```

Implemented top-level groups:

```text
auth
automations    alias: auto
devices
host
organization
tasks          alias: t
workspaces     alias: ws
```

## Global Options

| Option | Env | State | Description |
| --- | --- | --- | --- |
| `--json` | | Working | Prints the command data payload as formatted JSON. It does not wrap data in `{ "data": ... }`. |
| `--quiet` | | Working | Prints IDs for arrays/objects with an `id` field. Falls back to JSON otherwise. |
| `--device <id>` | `SUPERSET_DEVICE` | Partial | Used by middleware and workspace stubs. |
| `--api-key <key>` | `SUPERSET_API_KEY` | Working | Uses an API key/session token instead of stored OAuth login. |
| `--help`, `-h` | | Working on root only | Listed in root `--help` output and recognised everywhere by the parser, but the rendered help for groups and leaf commands does not list it (CLI-CURRENT-018). |
| `--version`, `-v` | | Working on root only | Prints `superset v0.1.0`. Same listing gap as `--help`. |

There is no global `--api-url` option. The only implemented API URL override is
`superset auth login --api-url <url>`, which stores the value in the local CLI
config for later commands. `SUPERSET_API_URL` only affects `auth login`
(CLI-CURRENT-024).

When one of `CLAUDE_CODE`, `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`,
`CODEX_CLI`, `GEMINI_CLI`, `SUPERSET_AGENT`, or `CI` is set to *any* value
including the empty string, output defaults to JSON unless `--quiet` is
provided (CLI-CURRENT-033).

### Build-time vs runtime configuration

Three URL/host knobs live in `cli.config.ts` as `define`s and are baked into
the binary at build time:

```text
SUPERSET_API_URL  — passed to the host service as its cloud API URL
RELAY_URL      — passed to the host service as its relay URL
WEB_URL        — derived in code; can be overridden at runtime via SUPERSET_WEB_URL
```

These are not the same as the runtime `apiUrl` stored in
`~/superset/config.json`, which is what every authenticated tRPC call reads.
The CLI's tRPC traffic uses `getApiUrl(config)` (config-based, default
`https://api.superset.sh`); the host service spawned by `host start`
uses `SUPERSET_API_URL` and `RELAY_URL` (build-time). A custom build with
different defines will route host-service traffic to the new URL but CLI
tRPC traffic still goes to the binary's hardcoded fallback unless the user
also runs `auth login --api-url`.

Runtime env vars used outside individual commands:

```text
SUPERSET_DEVICE      — global --device fallback
SUPERSET_API_KEY     — global --api-key fallback
SUPERSET_API_URL     — only honoured by `auth login` (CLI-CURRENT-024)
SUPERSET_WEB_URL     — overrides the OAuth web URL inside `auth login`
SUPERSET_HOST_BIN    — path to the host binary used by `host start`
HOST_MIGRATIONS_FOLDER — path to host migrations used by `host start`
```

## Local Files

The CLI currently uses `~/superset`, not `~/.superset`.

| File | Purpose |
| --- | --- |
| `~/superset/config.json` | OAuth token, expiry, API URL override, active organization ID. Written `0o600`; the parent dir is `0o700`. If `readConfig()` finds lax permissions on either, it silently `chmod`s them back. |
| `~/superset/device.json` | Local device metadata read by middleware: `{ "deviceId": "...", "deviceName": "..." }`. |
| `~/superset/host/<organizationId>/manifest.json` | Host service PID, endpoint, auth token, start time, and organization ID. |
| `~/superset/host/<organizationId>/host.db` | Host service SQLite path passed to the spawned host service. |

Both `config.json` and `device.json` are parsed via `JSON.parse` with no
try/catch (CLI-CURRENT-022); a corrupted file crashes every command with a
raw `SyntaxError`.

## Auth

### `superset auth login`

Authenticates via browser OAuth and stores a session token locally.

Options:

| Option | Env | Description |
| --- | --- | --- |
| `--api-url <url>` | `SUPERSET_API_URL` | Override API URL and persist it to `~/superset/config.json`. |

`SUPERSET_WEB_URL` is also read at runtime by `getWebUrl()` to override the
OAuth authorize URL. If unset, the CLI derives the web URL from
`config.apiUrl` by replacing `api.superset.sh` with `app.superset.sh`.

Flow:

1. Starts a loopback callback server on `127.0.0.1:51789` or `127.0.0.1:51790`.
2. Opens `${webUrl}/cli/authorize?redirect_uri=...&state=...`.
3. The web app calls `POST /api/cli/create-code`.
4. The CLI receives the code on the loopback callback. The wait has a 5-minute timeout.
5. The CLI calls `POST /api/cli/exchange`.
6. The CLI stores `auth.accessToken` and `auth.expiresAt`.
7. The CLI calls `user.me`, `user.myOrganizations`, and sometimes `user.myOrganization`.

If multiple organizations are returned and stdout is a TTY, the user is
prompted to choose one. If stdout is not a TTY, no organization is selected
unless there is exactly one organization (CLI-CURRENT-003).

The login spinner is guarded with `process.stdout.isTTY` and falls back to
plain log lines when not on a TTY.

Output data (both human flow and `--json`):

```ts
{ apiUrl: string }
```

If the user cancels the org-selection prompt, the command still returns
`{ data: { apiUrl } }` — no error code, no message indicating cancellation in
JSON mode.

### `superset auth logout`

Clears `auth` from `~/superset/config.json`. This command does not call the API.

### `superset auth check`

Shows the current user, active organization, auth source, and API URL.

tRPC calls:

```text
user.me
user.myOrganization
```

Output data:

```ts
{
  userId: string;
  email: string;
  name: string;
  organizationId: string;
  organizationName: string;
  authSource: "flag" | "env" | "oauth";
  apiUrl: string;
}
```

Human mode formats `authSource` into a different string (`"Session (expires
in N min)"`, `"API key (from --api-key flag)"`, `"API key (from
SUPERSET_API_KEY env)"`); JSON mode emits the raw enum.

`authSource` is detected by scanning `process.argv` for any element starting
with `--api-key` (CLI-CURRENT-032).

## Organizations

### `superset organization list`

Lists organizations available to the current auth context and marks the active
organization.

tRPC calls:

```text
user.myOrganizations
user.myOrganization
```

Human columns:

```text
NAME  SLUG  ACTIVE
```

Output data (raw array, no `{data}` wrapper):

```ts
Array<{
  id: string;
  name: string;
  slug: string;
  active: boolean;
}>
```

The human table omits `id`; only JSON mode exposes it. `--quiet` prints
organization UUIDs (the `id` field), not slugs.

### `superset organization switch <idOrSlug>`

Switches the locally configured active organization by writing
`organizationId` to `~/superset/config.json`.

tRPC call:

```text
user.myOrganizations
```

The command matches only organization ID or slug.

Output data:

```ts
{ id: string; name: string; slug: string }
```

## Tasks

### `superset tasks list`

Lists tasks in the active organization.

Options accepted by the parser:

| Option | Description |
| --- | --- |
| `--status <backlog|todo|in_progress|done|cancelled>` | Accepted but currently ignored. |
| `--priority <urgent|high|medium|low|none>` | Accepted but currently ignored. |
| `--assignee-me`, `-m` | Accepted but currently ignored. |
| `--creator-me` | Accepted but currently ignored. |
| `--search <query>`, `-s` | Accepted but currently ignored. |
| `--limit <n>` | Accepted but currently ignored. Default parser value is `50`. |
| `--offset <n>` | Accepted but currently ignored. Default parser value is `0`. |

tRPC call:

```text
task.all
```

Human columns:

```text
SLUG  TITLE  PRIORITY  ASSIGNEE
```

Output data (raw array; the API returns `{task, assignee}` pairs which the
CLI flattens):

```ts
Array<Task & { assignee: string /* assignee.name ?? "—" */ }>
```

`--quiet` prints task UUIDs (the `id` field), not slugs, even though the
human table column is `SLUG`.

### `superset tasks get <slug>`

Gets a task by slug. The help text currently says "ID or slug", but the source
calls `task.bySlug`, so UUID lookup does not work through this command.

tRPC call:

```text
task.bySlug
```

### `superset tasks create`

Creates a task in the active organization.

Options:

| Option | State | Description |
| --- | --- | --- |
| `--title <title>` | Working, required | Task title. |
| `--description <text>` | Working | Task description. |
| `--priority <urgent|high|medium|low|none>` | Working | Task priority. |
| `--assignee <userId>` | Working | Assignee user ID. |
| `--branch <branch>` | Accepted but ignored | Parsed but not sent to the API. |

tRPC call:

```text
task.createFromUi
```

Payload fields sent:

```ts
{
  title: string;
  description?: string;
  priority?: "urgent" | "high" | "medium" | "low" | "none";
  assigneeId?: string;
}
```

`createFromUi` returns `{ task: Task | null }`. The command does not
null-check `result.task` (CLI-CURRENT-026), so a null result produces a
success message of `Created task undefined: undefined` and JSON `data: null`.

### `superset tasks update <slug>`

Updates a task by slug. UUID lookup does not work for the same reason as
`tasks get`.

Options:

| Option | State |
| --- | --- |
| `--title <title>` | Working |
| `--description <text>` | Working |
| `--priority <urgent|high|medium|low|none>` | Working |
| `--assignee <userId>` | Working |
| `--branch <branch>` | Working |

tRPC calls:

```text
task.bySlug
task.update
```

### `superset tasks delete <slug...>`

Deletes one or more tasks by slug. UUID lookup does not work.

tRPC calls per slug:

```text
task.bySlug
task.delete
```

## Automations

Schedules use RFC 5545 RRULE bodies, for example:

```text
FREQ=DAILY;BYHOUR=9;BYMINUTE=0
FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0
FREQ=MINUTELY;INTERVAL=15
```

### `superset automations list`

Lists automations in the active organization.

tRPC call:

```text
automation.list
```

Human columns:

```text
ID  NAME  AGENT  SCHEDULE  ENABLED  NEXT RUN
```

### `superset automations get <id>`

Fetches one automation by UUID and prints JSON by default because there is no
custom human formatter. The API returns recent runs, but the CLI intentionally
removes `recentRuns` from the output.

tRPC call:

```text
automation.get
```

### `superset automations create`

Creates a scheduled automation.

Options:

| Option | State | Description |
| --- | --- | --- |
| `--name <name>` | Required | Human-readable automation name. |
| `--prompt <text>` | One of prompt or prompt file required at runtime | Prompt to send to the agent. |
| `--prompt-file <path>` | One of prompt or prompt file required at runtime | Reads and trims the prompt file. |
| `--rrule <rrule>` | Required | RFC 5545 RRULE body. |
| `--timezone <iana>` | Optional | Defaults to the local host timezone, then UTC. |
| `--dtstart <iso8601>` | Optional | Defaults to now in the API. |
| `--project <projectId>` | Required at runtime | v2 project ID. The help text does not mark it required. |
| `--workspace <workspaceId>` | Optional | Existing v2 workspace to reuse. `--project` is still required. |
| `--device <hostId>` | Optional | Target host ID. Defaults are resolved by the API/dispatcher. |
| `--agent <presetId>` | Optional | Defaults to `claude`; resolved against shipped agent presets. |
| `--agent-config-file <path>` | Optional | Full `ResolvedAgentConfig` JSON. Overrides `--agent`. |

tRPC call:

```text
automation.create
```

Payload fields sent:

```ts
{
  name: string;
  prompt: string;
  agentConfig: ResolvedAgentConfig;
  targetHostId: string | null;
  v2ProjectId: string;
  v2WorkspaceId: string | null;
  rrule: string;
  dtstart?: Date;
  timezone: string;
  mcpScope: [];
}
```

### `superset automations update <id>`

Updates an automation by UUID.

Options:

| Option | State |
| --- | --- |
| `--name <name>` | Working |
| `--prompt <text>` | Working |
| `--prompt-file <path>` | Working |
| `--rrule <rrule>` | Working |
| `--timezone <iana>` | Working |
| `--dtstart <iso8601>` | Working |
| `--agent <presetId>` | Working |
| `--agent-config-file <path>` | Working, overrides `--agent` |
| `--device <hostId>` | Working, but see note below |
| `--enabled [true|false]` | Working; `--no-enabled` is also supported by the parser |

Current flaw: the command always sends `targetHostId: options.device ?? null`.
That means running `superset automations update <id> --name ...` without
`--device` clears the target host.

If `--enabled` is provided, the command first calls `automation.setEnabled`,
then calls `automation.update`.

tRPC calls:

```text
automation.setEnabled  # only when --enabled is provided
automation.update
```

There are no CLI options to change `v2ProjectId`, `v2WorkspaceId`, or
`mcpScope`, even though the API schema supports them.

### `superset automations delete <id>`

Deletes an automation by UUID.

tRPC call:

```text
automation.delete
```

### `superset automations pause <id>`

Sets `enabled` to false.

tRPC call:

```text
automation.setEnabled
```

### `superset automations resume <id>`

Sets `enabled` to true. The API recomputes `nextRunAt` from now when resuming a
previously paused automation.

tRPC call:

```text
automation.setEnabled
```

### `superset automations run <id>`

Dispatches an automation immediately. It does not wait for the resulting agent
work to complete.

tRPC call:

```text
automation.runNow
```

### Missing: `superset automations logs <id>`

There is no command file for logs. The API has `automation.listRuns`, but it is
not wired into the CLI.

## Devices

### `superset devices list`

Stub. This command still runs auth middleware first, so unauthenticated users
see the normal login error. With auth resolved, it always throws:

```text
Error: Not implemented
Hint: Needs device.list tRPC procedure on the API side
```

There is no `device.list` procedure in the current tRPC router. The device
router exposes host/client registration and access checks, but not a list
query for CLI use.

## Workspaces

All workspace commands are stubs. They still run auth middleware first. After
auth resolves, they resolve a device ID from `--device`, `SUPERSET_DEVICE`, or
`~/superset/device.json`; if none is found they throw:

```text
Error: No device found
Hint: Use --device or run: superset devices list
```

If a device is found, they throw:

```text
Error: Not implemented
Hint: Needs device command routing via websocket
```

### `superset workspaces list`

Options:

```text
--device <deviceId>
```

### `superset workspaces create`

Options:

```text
--device <deviceId>
--project <projectId>  required by parser
--name <name>          required by parser
--branch <branch>      required by parser
```

### `superset workspaces delete <id...>`

Options:

```text
--device <deviceId>
```

## Host Service

### `superset host install`

Stub. Skips auth middleware and returns:

```text
Not implemented yet
```

### `superset start`

Starts the host service for the active organization.

Options:

| Option | Description |
| --- | --- |
| `--daemon` | Run the child process detached in the background. |
| `--port <number>` | Host service port. If omitted, a free loopback port is chosen. |

tRPC call:

```text
user.myOrganization
```

Runtime requirements:

- The user must be logged in and have an active organization.
- The host binary must exist at `SUPERSET_HOST_BIN` or as a sibling
  `superset-host` next to the current CLI executable.
- Host migrations must exist at `HOST_MIGRATIONS_FOLDER` or in the compiled
  distribution's `share/migrations` folder.

Environment passed to the host process:

```text
ORGANIZATION_ID
AUTH_TOKEN
SUPERSET_API_URL
RELAY_URL
PORT
HOST_SERVICE_PORT
HOST_SERVICE_SECRET
HOST_DB_PATH
HOST_MIGRATIONS_FOLDER
```

The CLI polls `http://127.0.0.1:<port>/trpc/health.check` for up to 10 seconds
using `HOST_SERVICE_SECRET`, then writes the host manifest.

### `superset status`

Checks the active organization's host manifest, process liveness, and health
endpoint.

tRPC call:

```text
user.myOrganization
```

Possible states:

- no manifest: not running
- manifest PID is dead: stale manifest
- PID alive and health check succeeds/fails: running with `healthy: true|false`

### `superset stop`

Stops the host service process in the active organization's manifest. It sends
`SIGTERM`, waits up to 10 seconds, then sends `SIGKILL` if the process is still
alive. It removes the manifest either way.

tRPC call:

```text
user.myOrganization
```

## Missing Command Groups From The Old Spec

The previous version of this file documented these command groups, but there is
no implementation in `packages/cli/src/commands`:

```text
superset projects ...
superset agent ...
superset ui ...
superset ui sidebar ...
superset ui tabs ...
superset ui panes ...
superset ui panes terminal ...
superset ui panes browser ...
superset ui panes chat ...
superset chat ...
superset notifications ...
superset ports ...
```

## Known CLI Framework Issues Visible From Source

- Command help does not show global options on leaf commands.
- Required options are not labelled as required in help output.
- `superset auth check --help` and similar commands work, but grouped command
  help only shows leaf arguments/options, not inherited globals.
- JSON output prints the raw data payload, not the full command result object;
  docs and scripts should not expect a `{ data: ... }` wrapper.
- Boolean options accept `--flag`, `--flag true`, `--flag false`, and
  `--no-flag`.
