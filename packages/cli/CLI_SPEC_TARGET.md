# Superset CLI v1 Target

The shipping contract for v1 of the `superset` CLI. The current behavior we
are diffing against lives in `CLI_SPEC_CURRENT.md`. The mechanics of building
and distributing the binary live in `DISTRIBUTION.md`. This doc only defines
*what the CLI does* once shipped.

## Principles

- Every flag shown in help works as documented; no silent-ignore.
- Each command has one canonical output shape; JSON output is a function of
  inputs only, never of "happy path" vs "early exit" branches.
- Self-hosting/dev configuration is build-time, not user-facing flags.
- Local state lives in one canonical home, shared with the desktop app, so
  state written by one client is visible to the other.

## Command Surface

### In scope for v1

```text
auth          login, logout, status
organization  list, switch
projects      list
hosts         list
workspaces    list, create, delete
tasks         list, get, create, update, delete
automations   list, get, create, update, delete, pause, resume, run, logs
host          start, status, stop
```

`hosts` (plural) lists hosts registered to the org. `host` (singular)
manages the local host service lifecycle. Same noun, different scope: the
plural is for discovery, the singular is for control of the machine the
CLI is running on.

### Aliases

| Long form | Alias |
| --- | --- |
| `automations` | `auto` |
| `tasks` | `t` |
| `workspaces` | `ws` |
| `organization` | `org` |
| `hosts` | (none) |

### Out of scope for v1

```text
host install
agent, chat, notifications, ports, ui, panes
```

These do not appear in help, are not advertised in public docs, and are not
shipped as stubs.

## Global Options

| Option | Env | Description |
| --- | --- | --- |
| `--json` | | Print the command's data payload as formatted JSON. |
| `--quiet` | | Print IDs for arrays/objects with an `id` field; JSON fallback otherwise. |
| `--api-key <key>` | `SUPERSET_API_KEY` | Use API key/session token instead of stored OAuth login. |
| `--help`, `-h` | | Show help for the current command. |
| `--version`, `-v` | | Print `superset v<version>`. |

`--host` is **not** a global option. It's a per-command flag on
`workspaces`, `projects`, and `automations create/update`. It identifies
which host should service the request. **Default (when omitted) is
`getHashedDeviceId()`** — the local machine — using the same shared
helper the host service uses to identify itself.

The CLI uses two clients:

1. **Cloud client** (`https://api.superset.sh`) — for cloud-only commands
   (`auth`, `organization`, `tasks`, `automations *`, `hosts list`) and
   for routing workspace/project operations to *remote* hosts via the
   relay.
2. **Local host client** (`http://127.0.0.1:<port>` from the manifest) —
   for workspace/project operations against the local machine. Loopback
   HTTP, works offline.

Routing rule for workspace/project commands:

```ts
import { getHashedDeviceId } from "@superset/shared/device-info";

const target = options.host ?? getHashedDeviceId();
if (target === getHashedDeviceId()) {
  // local fast path: read manifest, talk to host service over loopback
} else {
  // remote: cloud API → relay → target host
}
```

`getHashedDeviceId()` is deterministic and machine-bound (HMAC of
`ioreg`/`/etc/machine-id`/Windows MachineGuid), so the comparison works
without network and without a running host service. The local detection
result is correct even when the host service is currently stopped — the
CLI can then give a precise error (`Run: superset start`) instead
of routing via cloud and getting back a confusing "host offline."

Globals are listed in every command's help, including grouped and leaf help.

There is no `--api-url` flag, no `SUPERSET_API_URL` env var, and no `apiUrl`
field in `~/.superset/config.json`. The cloud API URL is a build-time
constant. Self-hosters rebuild the binary with their own `SUPERSET_API_URL`
define.

When any of `CLAUDE_CODE`, `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`,
`CODEX_CLI`, `GEMINI_CLI`, `SUPERSET_AGENT`, or `CI` is set to a *non-empty*
value, output defaults to JSON unless `--quiet` is provided. Empty-string
env vars do not trigger this.

## Local State

```text
~/.superset/config.json
~/.superset/host/<organizationId>/manifest.json
~/.superset/host/<organizationId>/host.db
```

Manifest format (written by both the desktop app and the CLI's
`start`):

```ts
{
  pid: number;
  endpoint: string;     // http://127.0.0.1:<port>
  authToken: string;    // = HOST_SERVICE_SECRET
  hostId: string;       // = getHashedDeviceId() — for display in `superset status`
  hostName: string;     // human-readable
  startedAt: number;
  organizationId: string;
}
```

The CLI reads the manifest to:

1. Issue local-fast-path tRPC calls when the target host is this machine:
   POST to `manifest.endpoint` with `Authorization: Bearer manifest.authToken`.
2. Implement `status` and `stop` against the recorded
   `pid`/`endpoint`.

The CLI does **not** need the manifest to determine "is this hostId the
local machine?" — that comes from `getHashedDeviceId()` directly. The
`hostId` field in the manifest is for display (`status` shows the
machine's hostId so users don't have to run `hosts list` to see their
own).

The manifest is written `0o600`; the parent dir is `0o700`. Same-user
process trust is the intentional model (matches `gh`, `aws`, `docker`,
`npm`, ssh keys, etc.).

The CLI honours `SUPERSET_HOME_DIR` to relocate the tree, matching the
desktop app. State written by either client is visible to the other; in
particular, a host service started by one client is observable and
controllable by the other through the manifest.

`config.json` and the manifest are parsed with try/catch around
`JSON.parse`; a corrupt file is reported as a clean CLIError, not a raw
`SyntaxError` crash.

## Output Conventions

### Human mode (default when stdout is a TTY)

Tables for list commands; structured plain text for everything else. Spinner
animations only render when stdout is a TTY; otherwise the CLI prints a
single status line per phase.

### JSON mode (`--json`)

Prints the command's data payload as formatted JSON. **No envelope**: list
commands print arrays, get/create/update commands print objects, delete
commands print summary objects. There is no `{ "data": ... }` wrapper and no
`{ "success": true }` wrapper. Empty results print `null`.

### Quiet mode (`--quiet`)

If the data is an array of objects each with an `id` field, prints one ID
per line. If the data is a single object with an `id` field, prints the
ID. Otherwise falls back to JSON formatting.

## Help Conventions

Help for every command (root, group, leaf) lists:

- Arguments — with `(required)` markers and angle-bracket usage syntax.
- Local options — with `(required)` markers on required flags.
- Inherited globals — `--json`, `--quiet`, `--api-key`, `--help`/`-h`,
  `--version`/`-v`.

## Error Conventions

- Exit `0` on success, `1` on any error. No other exit codes in v1.
- Errors print to stderr; data prints to stdout.
- Specific messages for known classes:
  - `UNAUTHORIZED` → `Session expired. Run: superset auth login`
  - `NOT_FOUND` → `Error: Not found`
  - Network failure → `Could not connect to API`
- Unknown commands print typo suggestions
  (`Did you mean "auth"?`) using Damerau-Levenshtein distance.

---

## Auth

### `superset auth login`

Authenticate via browser OAuth and store a session token locally.

| Option | Required | Description |
| --- | --- | --- |
| `--organization <idOrSlug>` | When stdout is non-TTY and the user belongs to multiple orgs | Selects the active organization without prompting. Optional but supported when stdout is a TTY (skips the picker). |

Flow:

1. Loopback callback server on `127.0.0.1:51789` or `51790`.
2. Opens `${WEB_URL}/cli/authorize?...`. `WEB_URL` is a build-time constant
   (overridable at runtime via `SUPERSET_WEB_URL` for development).
3. Web posts to `/api/cli/create-code`.
4. CLI receives the code on the loopback callback (5-minute timeout).
5. CLI exchanges via `/api/cli/exchange`.
6. CLI stores `auth.accessToken` and `auth.expiresAt`.
7. CLI calls `user.me`, `user.myOrganizations`.

Org selection rules:

- Single organization → selected automatically.
- Multiple + TTY → prompt. `--organization` skips the prompt if provided and matches.
- Multiple + non-TTY + `--organization` provided → use it.
- Multiple + non-TTY + no `--organization` → error: `Multiple organizations available; pass --organization <slug>` and exit 1. The available slugs are listed in the error message.

Output:

```ts
{
  userId: string;
  email: string;
  organizationId: string;
  organizationName: string;
}
```

Side effects: writes `~/.superset/config.json` with `auth` and
`organizationId`. Spinner is guarded by `process.stdout.isTTY`.

### `superset auth logout`

Clear `auth` from `~/.superset/config.json`. Does not call the API. Does not
clear `organizationId` — the user's preferred org persists across re-logins.

Output:

```ts
{ loggedOut: true }
```

### `superset auth whoami`

Show the current user, active organization, and auth source.

tRPC: `user.me`, `user.myOrganization`.

Output:

```ts
{
  userId: string;
  email: string;
  name: string;
  organizationId: string;
  organizationName: string;
  authSource: "flag" | "env" | "oauth";
}
```

No `apiUrl` field. The CLI does not expose its API URL to the user.

---

## Organizations

### `superset organization list`

List organizations available to the current auth context. Marks the active
one.

tRPC: `user.myOrganizations`, `user.myOrganization`.

Output (array, raw):

```ts
Array<{
  id: string;
  name: string;
  slug: string;
  active: boolean;
}>
```

Quiet: organization IDs (one per line).
Human: table with columns `NAME, SLUG, ACTIVE`.

### `superset organization switch <idOrSlug>`

Set the active organization in `~/.superset/config.json`.

tRPC: `user.myOrganizations`.

Output:

```ts
{ id: string; name: string; slug: string }
```

---

## Projects

Project commands target a host using the same routing rule as workspaces:
local fast path when targeting the local machine, cloud-via-relay
otherwise. Projects are checked-out repos that live on a specific host.

### `superset projects list`

List projects on the target host.

| Option | Description |
| --- | --- |
| `--host <id>` | Defaults to local manifest's hostId. |

tRPC:
- Local → host service `project.list` (existing).
- Remote → cloud `project.list` (new — see Backend Prerequisites).

Output (array, raw):

```ts
Array<{
  id: string;
  name: string;
  repoUrl: string | null;
  defaultBranch: string | null;
  hostId: string;
}>
```

Quiet: project IDs.
Human: table with `NAME, REPO, DEFAULT BRANCH`.

v1 only ships `list`. Project CRUD is deferred — users create projects
via the desktop app and use the CLI to look up project IDs for
`automations create`.

---

## Hosts

### `superset hosts list`

List hosts registered to the active organization.

tRPC: `host.list` *(new — see Backend Prerequisites)*.

Output (array, raw):

```ts
Array<{
  id: string;
  name: string;
  online: boolean;
  lastSeen: string;
  organizationId: string;
}>
```

Quiet: host IDs.
Human: table with `NAME, ONLINE, LAST SEEN`.

v1 only ships `list` for org-wide host discovery. Host registration happens
via `superset start` on each machine — there is no separate
"register a host" command.

---

## Workspaces (alias: `ws`)

Workspace commands target a host. Routing rule:

- If target host = the local machine (resolved hostId matches the local
  manifest's hostId), the CLI calls the host service directly over
  loopback HTTP. **No cloud roundtrip; works offline.**
- Otherwise, the CLI calls the cloud's `workspace.*` procedure with the
  target hostId; the cloud dispatches via the relay to the named host.

This makes the common local-only user case fast and offline-capable
while still supporting "manage workspaces on a remote host."

`--host` resolution per command:

1. `--host <id>` flag if provided.
2. Otherwise `getHashedDeviceId()` (this machine's stable identity).

There is no error case for "no host" — the local machine always has an
identity. If the user genuinely has no host service running anywhere and
tries a workspace command, the local-target path errors with
`Host service for this machine isn't running. Run: superset start.`
That's the right message: they need to start the service or pick a
different host with `--host <id>` (use `superset hosts list` to find one).

If the resolved host is the local machine but the host service isn't
responding (no manifest, stale manifest, dead PID), the CLI errors fast
rather than falling through to cloud — different failure modes shouldn't
get silently mixed.

### `superset workspaces list`

| Option | Description |
| --- | --- |
| `--host <id>` | Defaults to local manifest's hostId. |

tRPC:
- Local target → host service `workspace.list` (existing).
- Remote target → cloud `workspace.list` (new — see Backend Prerequisites).

Output (array, raw):

```ts
Array<{
  id: string;
  name: string;
  branch: string;
  projectId: string;
  projectName: string;
  hostId: string;
}>
```

Quiet: workspace IDs.
Human: table with `NAME, BRANCH, PROJECT, HOST`.

### `superset workspaces create`

| Option | Required | Description |
| --- | --- | --- |
| `--host <id>` | optional (defaults to local) | Target host. |
| `--project <projectId>` | yes | |
| `--name <name>` | yes | |
| `--branch <branch>` | yes | Workspace branch. |

tRPC:
- Local → host service `workspace.create` (existing).
- Remote → cloud `workspace.create` (new).

Output: `Workspace` (raw).

### `superset workspaces delete <id...>`

Variadic.

| Option | Description |
| --- | --- |
| `--host <id>` | Defaults to local manifest's hostId. |

tRPC:
- Local → host service `workspace.delete` (existing).
- Remote → cloud `workspace.delete` (new).

Output:

```ts
{ deleted: string[] }
```

---

## Tasks (alias: `t`)

### `superset tasks list`

| Option | Description |
| --- | --- |
| `--status <backlog\|todo\|in_progress\|done\|cancelled>` | Filter by status. |
| `--priority <urgent\|high\|medium\|low\|none>` | Filter by priority. |
| `--assignee-me`, `-m` | Tasks assigned to current user. |
| `--creator-me` | Tasks created by current user. |
| `--search <query>`, `-s` | Substring search on title. |
| `--limit <n>` | Default 50, max 200. |
| `--offset <n>` | Default 0. |

All filters are sent to the API and respected. No silent-ignore.

tRPC: `task.list` *(new — replaces `task.all` for the CLI; takes the filter
input shape above)*.

Output (array, raw):

```ts
Array<Task>
```

Quiet: task IDs.
Human: table with `SLUG, TITLE, STATUS, PRIORITY, ASSIGNEE`.

### `superset tasks get <idOrSlug>`

Resolves either UUID or human slug.

tRPC: `task.byIdOrSlug` *(new — see Backend Prerequisites)*.

Output: `Task` (raw).

### `superset tasks create`

| Option | Required | Description |
| --- | --- | --- |
| `--title <title>` | yes | |
| `--description <text>` | no | |
| `--priority <urgent\|high\|medium\|low\|none>` | no | |
| `--assignee <userId>` | no | |

No `--branch` — the field is unused in the product (see CLI_SPEC_CURRENT bug
register and Backend Prerequisites).

tRPC: `task.create` *(this is the renamed-from-`createFromUi` procedure; the
old all-IDs `task.create` is deleted)*.

Output: `Task` (raw, never null).

### `superset tasks update <idOrSlug>`

Same fields as create, all optional.

tRPC: `task.byIdOrSlug` then `task.update`.

Output: `Task` (raw).

### `superset tasks delete <idOrSlug...>`

Variadic.

tRPC: `task.byIdOrSlug` per arg, then `task.delete` per ID.

Output:

```ts
{ deleted: string[] /* IDs */ }
```

---

## Automations (alias: `auto`)

Schedules use RFC 5545 RRULE bodies, e.g.
`FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0`.

### `superset automations list`

tRPC: `automation.list`.

Output (array, raw):

```ts
Array<Automation>
```

Quiet: automation IDs.
Human: table with `ID, NAME, AGENT, SCHEDULE, ENABLED, NEXT RUN`.

### `superset automations get <id>`

tRPC: `automation.get`.

Output: `Automation` (with `recentRuns` omitted — use
`automations logs` to fetch run history).

### `superset automations create`

| Option | Required | Description |
| --- | --- | --- |
| `--name <name>` | yes | Marked required in help. |
| `--prompt <text>` | one of prompt sources | Inline prompt; pass `-` to read from stdin. |
| `--prompt-file <path>` | one of prompt sources | Read verbatim. No leading/trailing whitespace stripped. |
| `--rrule <rrule>` | yes | Marked required in help. |
| `--timezone <iana>` | no | Default: host TZ, then UTC. |
| `--dtstart <iso8601>` | no | Default: now. |
| `--workspace <workspaceId>` | one of workspace/project | Reuse an existing workspace; project is derived server-side. |
| `--project <projectId>` | one of workspace/project | New-workspace-per-run mode. |
| `--host <hostId>` | no | Target host for runs. Default: owner's online host. |
| `--agent <presetId>` | no | Default: `claude`. |
| `--agent-config-file <path>` | no | Full ResolvedAgentConfig JSON; overrides `--agent`. |

Exactly one of `--prompt` or `--prompt-file` must be provided. Exactly one
of `--workspace` or `--project` must be provided. Both constraints are
enforced at parse time and shown as `(required, one of: ...)` in help.

tRPC: `automation.create`.

Output: `Automation` (raw, including `id`, `nextRunAt`, `agentConfig`).

### `superset automations update <id>`

All flags optional. **Omitting a flag preserves the existing field** —
`undefined` means "no change", not "clear". This requires server-side partial
update semantics (see Backend Prerequisites).

| Option | Description |
| --- | --- |
| `--name <name>` | |
| `--prompt <text>` | `-` reads from stdin. |
| `--prompt-file <path>` | Read verbatim. |
| `--rrule <rrule>` | |
| `--timezone <iana>` | |
| `--dtstart <iso8601>` | |
| `--host <hostId>` | Preserves the existing host when omitted. |
| `--agent <presetId>` | Preserves the existing agent config when omitted. |
| `--agent-config-file <path>` | Overrides `--agent` when both provided. |
| `--enabled` / `--no-enabled` | Calls `automation.setEnabled` first. |

tRPC:

```text
automation.setEnabled  # only if --enabled or --no-enabled provided
automation.update
```

Output: `Automation` (raw).

### `superset automations delete <id>`

tRPC: `automation.delete`.

Output:

```ts
{ deleted: string /* id */ }
```

### `superset automations pause <id>` / `superset automations resume <id>`

`pause` sets `enabled: false`; `resume` sets `enabled: true`. The API
recomputes `nextRunAt` on resume.

tRPC: `automation.setEnabled`.

Output: `Automation` (raw).

### `superset automations run <id>`

Dispatch immediately. Does not wait for completion. Use `automations logs`
or `automations logs --follow` to track progress.

tRPC: `automation.runNow`.

Output:

```ts
{
  runId: string;
  automationId: string;
  dispatchedAt: string; // ISO 8601
}
```

### `superset automations logs <id>`

| Option | Description |
| --- | --- |
| `--limit <n>` | Default 20, max 100. |
| `--offset <n>` | Default 0. |
| `--status <pending\|running\|success\|failure\|cancelled>` | Filter. |
| `--follow`, `-f` | Poll every 5s for new runs; stream until interrupted. |

tRPC: `automation.listRuns` *(already exists)*.

Output (array, raw):

```ts
Array<{
  id: string;
  automationId: string;
  status: "pending" | "running" | "success" | "failure" | "cancelled";
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  output: string | null;
  error: string | null;
}>
```

Quiet: run IDs.
Human: table with `RUN ID, STATUS, STARTED, DURATION`.

---

## Host Service

### `superset start`

| Option | Description |
| --- | --- |
| `--daemon` | Run detached. |
| `--port <n>` | Specific port; default is a free loopback port. |

Behavior:

- If a manifest exists and the PID is alive, returns the existing instance's
  details and exits successfully.
- Otherwise spawns the host service binary, polls
  `/trpc/health.check` for up to 10 seconds, writes the manifest.

Output (one shape, used for both "already running" and "freshly started"):

```ts
{
  pid: number;
  port: number;
  endpoint: string;
  organizationId: string;
}
```

Side conventions:

- Spinner is guarded by `process.stdout.isTTY`.
- Host child process gets a *clean* env containing only the documented host
  vars; the CLI's own environment is not inherited.
- Starting the host service while the desktop app is also running returns
  the desktop app's manifest if both are configured for the same
  organization (shared `~/.superset/host/<orgId>/`).

### `superset status`

Three output shapes, depending on state:

```ts
// No manifest
{ running: false; organizationId: string }

// Manifest exists but PID is dead
{
  running: false;
  stale: true;
  pid: number;
  organizationId: string;
}

// Running
{
  running: true;
  healthy: boolean;
  pid: number;
  port: number;
  endpoint: string;
  organizationId: string;
  uptimeSec: number;
}
```

`healthy` reflects a live `health.check` request (2 second timeout).

### `superset stop`

Sends SIGTERM, waits up to 10 seconds, sends SIGKILL if still alive. **The
manifest is removed in all cases**, including when the SIGTERM call itself
throws — the CLI reports the failure but does not leave a stale manifest
behind.

Output:

```ts
// Manifest existed and the process was killed (or was already dead)
{ stopped: true; pid: number; organizationId: string }

// No manifest existed
{ stopped: false; organizationId: string }
```

---

## Backend Prerequisites

These changes must land in the API/server before the v1 CLI ships:

- **`task.create` consolidation** — delete the existing all-IDs
  `task.create`, rename `task.createFromUi` → `task.create`, and remove
  the dead `onInsert` handler in
  `apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/collections.ts`.
- **Drop `branch` from task schemas** — `createTaskSchema`, `updateTaskSchema`,
  any sync schemas. Column on the `tasks` table can be retired in a separate
  migration.
- **`task.list` filtering** — accept the filter set listed under
  `tasks list`. Returns paginated results (`{ items, total }` or just an
  array, TBD with backend).
- **`task.byIdOrSlug`** — single procedure that resolves UUIDs and slugs.
  Replaces the current `task.bySlug` for CLI use.
- **`automation.create` workspace-only mode** — when `v2WorkspaceId` is
  provided, derive `v2ProjectId` server-side instead of requiring both.
- **`automation.update` partial semantics** — treat `undefined` fields as
  "no change" for `targetHostId` and `agentConfig`. The CLI will rely on
  this to fix the silent-clobber bug (CLI-CURRENT-010, CLI-CURRENT-028).
- **`host.list`** on cloud — new tRPC procedure for the
  `superset hosts list` discovery command. Returns hosts with
  `id = machineId` (the consolidated identifier — see below).
- **`workspace.list/create/delete`** on cloud — new tRPC procedures used
  only when the CLI is targeting a *remote* host. They take a `hostId`
  input and dispatch via the relay to the named host service. The host
  service's existing `workspace.*` procedures handle the actual work on
  both sides; the cloud procedures are the routing wrapper for the
  remote case. The CLI calls these cloud procedures only when the
  resolved host is not the local machine.
- **`project.list`** on cloud — same pattern as workspaces: cloud-side
  routing wrapper used only for the remote case.
- **Websocket-based host command routing** — cloud API → relay → host
  service tRPC → response back through the relay. Used by the
  `workspace.*` and `project.*` cloud procedures above. Same plumbing as
  automation dispatch.
- **Host service writes `{ hostId, hostName }` into the manifest** on
  startup. Both fields are derived from
  `@superset/shared/device-info.getHashedDeviceId()` /
  `getDeviceName()`. The CLI does not depend on these for routing — it
  computes `getHashedDeviceId()` itself — but `status` displays
  them so users can see their own hostId without `hosts list`.
- **Drop UUID surrogates on `v2_hosts` and `v2_clients`.** The product
  hasn't shipped widely; this is the right window to consolidate.
  After this change, `machineId` (output of `getHashedDeviceId()` on
  desktop, OS-provided device IDs on mobile, persisted localStorage
  UUIDs on web) is the canonical row identity end-to-end. The
  CLI's local-detection routing rule depends on the host half of this
  landing.

  **`v2_hosts` migration:**
  - Drop `id` (uuid). PK becomes composite `(organizationId, machineId)`.
    `machineId` stays as the column name (it documents what the value is).
  - Same machine in two orgs still works — two rows, same machineId,
    different organizationIds.
  - Four FK columns migrate from uuid to text composite (FK to
    `v2_hosts(organizationId, machineId)`):
    - `v2_users_hosts.hostId`
    - `v2_workspaces.hostId`
    - `automations.targetHostId` (still nullable)
    - `automation_runs.hostId` (still nullable, `ON DELETE SET NULL`)
  - The migration translates existing values by joining old uuid → new
    machineId via `v2_hosts`.
  - **Drop the `session_hosts` table.** Audit confirmed dead — zero
    writes anywhere in the codebase, no renderer consumers of the
    Electric-synced collection. Original intent ("record which host ran
    which chat session") was never wired up. If we want it later, it
    can be rebuilt as a column on `chat_sessions` rather than a join
    table. Drop covers: the table itself, `sessionHostsRelations`, the
    `sessionHosts: many(...)` relation on `chatSessionsRelations`, the
    `apps/electric-proxy/src/where.ts` case clause, and the
    `apps/desktop/src/renderer/.../CollectionsProvider/collections.ts`
    collection registration.
  - Code search-and-replace: `eq(v2Hosts.id, hostId)` →
    `and(eq(v2Hosts.organizationId, orgId), eq(v2Hosts.machineId, hostId))`
    in `packages/trpc/src/router/device/device.ts`,
    `packages/trpc/src/router/automation/{automation,dispatch}.ts`, and
    `packages/trpc/src/router/v2-workspace/v2-workspace.ts`. Insert
    paths drop the uuid default.

  **`v2_clients` migration:**
  - Drop `id` (uuid). PK becomes composite
    `(organizationId, userId, machineId)` — promotes the existing
    unique constraint to PK.
  - **No FK migrations needed** — nothing references `v2_clients.id`.
  - Code search-and-replace: `packages/trpc/src/router/device/device.ts`
    insert path stops generating a uuid default.

  **What `machineId` means per platform** (orthogonal to the PK shape;
  same column accepts any of these):
  - Desktop: `getHashedDeviceId()` from
    `@superset/shared/device-info`.
  - Mobile (iOS): `Application.getIosIdForVendor()`.
  - Mobile (Android): `Application.getAndroidId()` or Expo equivalent.
  - Web: `crypto.randomUUID()` generated once on first load,
    persisted to localStorage / IndexedDB.

  The UUID surrogate would not have improved stability for web/mobile
  — fresh storage clear or app reinstall produces a fresh `machineId`
  *and* would have produced a fresh row UUID. Old rows become orphaned
  and get GC'd via `lastSeenAt`-based cleanup, same either way. Keeping
  the UUID would just have meant two churning identifiers per rebirth
  instead of one.

  **API surface:** continues to expose the value as `hostId` (text) on
  the wire. The CLI and desktop never hear the word "machineId" — that
  stays as the column name only. After this lands,
  `automation.targetHostId` accepted by `automations create --host` is
  the same value as `getHashedDeviceId()` on the target machine, the
  same value `hosts list` returns as `id`, and the same value the host
  service uses to identify itself. One identifier, end to end.
- **Host service binds to `127.0.0.1` only** — `packages/host-service/src/serve.ts`
  currently calls `serve({ fetch, port })` without a `hostname`, so
  `@hono/node-server` defaults to all interfaces. Pass `hostname: "127.0.0.1"`
  so the host service is unreachable from the local network. The relay
  tunnel still connects out to the relay; nothing about the relay flow
  needs the service to be externally bound.

## CLI / Framework Changes

These changes are internal to the CLI and framework packages:

- Migrate the home directory from `~/superset/` to `~/.superset/` and
  honour `SUPERSET_HOME_DIR` (matches desktop; fixes CLI-CURRENT-034).
- Rename "device" → "host" throughout the user-facing surface:
  - `--device` flag → `--host` (per-command, not global).
  - Drop `SUPERSET_DEVICE` env var (no replacement).
  - `devices list` group → `hosts list`.
  - Drop `~/.superset/device.json` entirely; `hostId`/`hostName` move into
    the per-org manifest.
  - Internal: drop `readDeviceConfig` / `deviceId` field on the middleware
    ctx; per-command code reads `hostId` from the manifest as needed.
- Drop `apiUrl` config field, `auth login --api-url` flag, and
  `SUPERSET_API_URL` env var. API URL is a build-time constant only.
- Drop `--branch` flag from `tasks create` and `tasks update`.
- Implement `tasks list` filters end-to-end (no silent ignores).
- Implement `automations logs <id>`.
- Add `--organization <idOrSlug>` to `auth login`.
- Add stdin support (`-`) for `--prompt` on `automations create` and
  `automations update`.
- Stop trimming contents read by `--prompt-file`; preserve verbatim.
- `stop`: remove manifest in all cases, including SIGTERM failure
  (CLI-CURRENT-021).
- `start`: guard spinner with `process.stdout.isTTY`
  (CLI-CURRENT-023). Don't inherit the parent process env into the child
  (CLI-CURRENT-025). Unify the "already running" and "fresh start" output
  shapes (CLI-CURRENT-029).
- `readConfig` / `readManifest`: handle corrupt JSON with a clean
  CLIError (CLI-CURRENT-022).
- Show inherited globals and required-flag markers in command help
  (CLI-CURRENT-017, CLI-CURRENT-018).
- `auth check` → `auth whoami` rename. No alias retained — the CLI has no
  shipped installed base, so back-compat is unnecessary ceremony.
- `automations resume`: guard `nextRunAt.toISOString()` against non-Date
  values (CLI-CURRENT-027).
- Tighten `authSource` detection in `resolveAuth` to avoid
  `--api-key-*` false-positives (CLI-CURRENT-032).
- Tighten `isAgentMode` to require non-empty env values (CLI-CURRENT-033).
- Remove `host/meta.ts`'s dead `standalone: true` (CLI-CURRENT-031).

## Out of Scope for V1

- `host install` — deferred to v1.1, not in help, not in docs. The
  implementation path is pinned so v1.1 doesn't have to relitigate it:
  - macOS: write `~/Library/LaunchAgents/sh.superset.host.plist`
    (`RunAtLoad=true`, `KeepAlive=true`, exec'ing `superset-host` directly
    with the current login's env), then `launchctl load` it.
  - Linux: write `~/.config/systemd/user/superset-host.service`, then
    `systemctl --user enable --now superset-host`. Document
    `loginctl enable-linger <user>` for always-on headless servers.
  - Uninstall via `host install --uninstall` or a separate
    `host uninstall` command.
  - Use case the v1 surface does not cover: a host service that survives
    reboot. `start --daemon` only survives logout (with `setsid`).
- `agent` — agent presets are configured server-side; no CLI surface in v1.
- `chat` — desktop uses Electric sync; needs a `chat.list` query before a
  CLI can exist.
- `notifications` — no use case in v1 that isn't covered by the desktop app.
- `ports` — port management lives in the host service; CLI surface is
  deferred until ports table + scanning land in the host service (see
  TODO.md).
- `ui`, `panes`, terminal/browser/chat pane control — desktop-only in v1.

## Decisions Made During Drafting (Flag For Review)

The following calls were made while drafting and may need user review before
this becomes the locked v1 contract:

1. **JSON envelope: raw payload, never wrapped.** Mixing list arrays and
   `{data}` wrappers is the current source of confusion (CLI-CURRENT-019).
   This commits to "JSON output = the data".
2. **Quiet mode prints UUIDs (the `id` field), not slugs.** Tasks and
   automations both have an `id`, so quiet mode emits UUIDs for both.
   Switching to slugs where present would be more ergonomic but adds
   per-command rules; deferred to v1.1.
3. **`automations get` continues to omit `recentRuns`.** With `automations
   logs` in scope, leaving runs out of `get` keeps the get response lean
   and gives one obvious place to look for run history.
4. **`--prompt-file` reads verbatim, no `.trim()`.** Markdown prompts may
   intentionally end with whitespace (code fences, trailing newlines).
   Trimming is the kind of "helpful" behavior that bites markdown.
5. **`workspaces`, `projects`, `hosts` are full v1 commands**, not
   stubs. This commits us to landing the backend prereqs before v1 ships;
   if those slip we'd fall back to hiding the groups, but the spec assumes
   they ship.
6. **"Devices" terminology dropped in favour of "hosts"** throughout the
   user-facing CLI surface — flags (`--host`), the listing group
   (`hosts list`), the manifest field (`hostId`), and the env var (none
   — the `SUPERSET_DEVICE` env var is dropped, with no replacement). This
   matches the backend's existing internal naming
   (`automation.targetHostId`, the host service itself).
7. **Dual client with a fixed routing rule.** Workspace/project commands
   use the local host client when the target hostId matches the local
   manifest, the cloud client otherwise. Local-only users (a large
   fraction of the user base) get a fast, offline-capable CLI without
   sacrificing remote-host support. The trade-off is a small amount of
   routing logic in the CLI; both clients share the same tRPC schema
   shape, so the call sites differ only in which client they use.
8. **`--host` defaults to `getHashedDeviceId()` (the local machine).**
   Per-command flag (not global). The default uses the same shared
   helper the host service uses to identify itself, so the CLI knows
   "this is the local machine" without needing the manifest, the host
   service to be running, or a network call. Cloud-only commands
   (`tasks`, `automations list/get/run/logs`, `auth`, `organization`,
   `hosts list`) don't take `--host` at all, so CI runs them unmodified.
9. **Stale-manifest behaviour: fail fast, don't fall through to cloud.**
   If the resolved target is the local machine but the host service
   isn't reachable (no manifest, stale manifest, dead PID), workspace
   /project commands error with `Run: superset start` rather than
   silently retrying via cloud. The two failure modes are different
   (one is "your host service crashed", the other is "your network is
   down") and conflating them under one error makes debugging worse.
