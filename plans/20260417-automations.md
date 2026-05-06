# Automations — Grounded Implementation Plan (v5)

## Context

Users need to schedule agent sessions on a team machine with a prompt. At fire time a session spawns automatically on the target host-service; the user (or teammate) can continue interactively.

- **Public product name: "automations"** (matches competitors, covers future non-time triggers).
- **Recurrence format: RRule (RFC 5545)**; CLI accepts cron as sugar and converts server-side.
- **Dispatch path: cloud API → v2 relay → host-service tRPC** (not Electric SQL + `agent_commands` — that's v1 renderer-driven).
- **Ships behind a paid-plan gate** (`subscriptions.plan !== "free"`) via both route guard and tRPC middleware. No new PostHog flag.
- **v1 scope: no completion tracking.** Runs land at `dispatched` and the user clicks through to the workspace to see what happened. No host-service callback.
- **v1 supports both chat and terminal agents** via the existing `AgentLaunchRequest` pipeline. No agent-specific dispatch code.

---

## Consolidation & Extraction (Prerequisite Work)

Three existing pieces of code live in desktop-only paths today and must move to shared packages so the cloud API dispatcher can call them identically.

### 1. `AgentLaunchRequest` + `agent-settings` → `packages/shared/src/agent-launch/`

**From:** `apps/desktop/src/shared/utils/agent-launch-request.ts`, `apps/desktop/src/shared/utils/agent-settings.ts`
**To:** `packages/shared/src/agent-launch/`

These files contain `buildPromptAgentLaunchRequest`, `AgentLaunchRequest` type, preset resolution (`ResolvedAgentConfig`, `AgentDefinitionId`), and the chat-vs-terminal kind branching. The cloud-side scheduler needs them to construct the same `AgentLaunchRequest` the desktop builds.

**Scope:** move the files + re-export through `packages/shared`, fix all imports in `apps/desktop`. No logic changes.

### 2. Workspace creation defaults resolver → `packages/shared/src/workspace-launch/`

The actual workspace creation RPC lives in host-service (`packages/host-service/src/trpc/router/workspace-creation/workspace-creation.ts`) — cloud API just calls it via relay. What's desktop-specific is the *orchestration* (pending-workspace state, optimistic UI, draft context). We skip all of that.

**What needs extracting:** the small utilities that resolve defaults — branch-name generation (`sanitizeBranchNameWithMaxLength`), setup-script defaults, input validators — so the scheduler can build a valid `WorkspaceCreateInput` without reaching into renderer code.

**Scope:** move 2-3 pure utility files to `packages/shared/src/workspace-launch/`. No orchestration, no state machine.

### 3. `useIsPaidPlan` hook + `requirePaidPlan` tRPC middleware

Plan tier is currently inline-checked as `subscriptionData?.plan !== "free"` in billing components. Consolidate into:

- `packages/trpc/src/router/billing/hooks.ts` (or similar) — server-side helper `getCurrentPlan(ctx)` → `PlanTier`
- `packages/trpc/src/trpc.ts` — new `paidPlanProcedure` that extends `protectedProcedure` with a plan check
- `apps/desktop/src/renderer/hooks/useIsPaidPlan/useIsPaidPlan.ts` — React hook reading the subscription query

Used by the Automations route guard (sidebar hide + route 404) and every `automation.*` tRPC procedure.

---

## Holes Against Real Code (Kept for Reference)

| Draft assumption | Ground truth |
|---|---|
| Generic "relay with a startSession RPC" | Relay (`apps/relay`) is a transparent tunnel proxy. `POST /hosts/:hostId/trpc/*` with a user JWT → WebSocket tunnel → host-service local tRPC. No new relay code. |
| Dispatch via `agent_commands` + Electric + useCommandWatcher | v1 renderer-driven; not used for remote scheduled execution. |
| Completion callback URL | Not in v1. Run state stops at `dispatched`. |
| REST API surface | tRPC-first everywhere except webhooks/QStash/OAuth. |
| `machines` table | Table is `v2_hosts`. `is_online` maintained by relay on WS connect/disconnect. |
| MCP config per-automation | MCP hardcoded `disableMcp: true`. v1 = Superset MCP only. |
| Per-token webhook auth for Zapier | No per-token model exists; defer to Phase 3. |

---

## Architecture

```
┌──────────────────┐    tRPC     ┌──────────────────────┐
│ CLI (v1) /       │────────────▶│ automationRouter     │
│ Desktop UI (v2)  │             │ (paid-plan gated)    │
└──────────────────┘             └──────────┬───────────┘
                                            │
                                            ▼
                                 ┌──────────────────────┐
                                 │   automations (new)  │
                                 └──────────┬───────────┘
                                            │
                 Vercel Cron @ 1min         │
                 (new: vercel.json +        │
                  CRON_SECRET guard)        ▼
                                 ┌──────────────────────────────┐
                                 │ POST /api/cron/automations/  │
                                 │     dispatch                 │
                                 │ For each due automation:     │
                                 │  1. Check v2_hosts.is_online │
                                 │  2. INSERT automation_runs   │  ← idempotent
                                 │  3. Mint user JWT            │
                                 │  4. If "new workspace" mode: │
                                 │     POST {RELAY}/hosts/:id/  │
                                 │       trpc/workspaceCreation │
                                 │  5. Build AgentLaunchRequest │  ← shared builder
                                 │  6. Dispatch:                │
                                 │     • chat → chat.sendMessage│
                                 │     • terminal → terminal.*  │
                                 │  7. Record dispatched state  │
                                 │  8. Advance next_run_at      │
                                 └──────────┬───────────────────┘
                                            │ HTTP (Bearer JWT)
                                            ▼
                                 ┌──────────────────────┐
                                 │  Relay (apps/relay)  │
                                 └──────────┬───────────┘
                                            │ WS frame
                                            ▼
                                 ┌──────────────────────┐
                                 │  Host-service tRPC   │
                                 │  workspaceCreation   │
                                 │  chat / terminal     │
                                 └──────────────────────┘
```

---

## Rollout & Gating

- **Paid plan required.** `subscriptions.plan !== "free"`. Users on the free plan see no Automations sidebar entry; `/automations` routes return 404; CLI / tRPC calls return `FORBIDDEN` with "Automations require a paid plan".
- **v2-only.** Schema references `v2_hosts`, so automations can't be used by orgs still on v1.
- **No PostHog flag.** The existing `V2_CLOUD` flag is already gating v2. Paid-plan check is the only additional gate.

---

## Dispatch Auth

Cloud API mints a short-lived user JWT per dispatch, signed with the same JWKS key Better Auth uses. Claims:
```ts
{
  sub: automation.ownerUserId,
  email: ownerEmail,
  organizationIds: [automation.organizationId],
  scope: "automation-run",
  runId: automationRun.id,
  exp: now + 5 min,
}
```

Relay verifies it via existing `verifyJWT` (`apps/relay/src/auth.ts`). Host-service trusts the relay PSK as today.

**Rationale.** Shared-secret bypass would leak "any user × any host × indefinite"; a minted user JWT leaks "one user × ≤5 min". ~20-line helper in `packages/auth/src/server.ts` if Better Auth doesn't expose server-side `signJwt` directly.

**Performance.** ES256 signing ~0.5-1ms; 1000 dispatches parallel = <100ms total. HTTP roundtrip to relay dominates (100-300ms). Not the bottleneck.

---

## Recurrence Format: RRule

Stored fields on `automations`:
- `rrule text` — RFC 5545 RRULE body, e.g. `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0`
- `dtstart timestamptz` — anchor (defaults to `createdAt`)
- `timezone text` — IANA TZ

At compute time (create/update and after each fire):
```ts
const rule = RRule.fromString(
  `DTSTART;TZID=${automation.timezone}:${formatRRuleDtstart(automation.dtstart)}\n` +
  `RRULE:${automation.rrule}`
);
const next = rule.after(automation.nextRunAt, false); // strictly after
```

**CLI sugar:** `--cron "0 9 * * *"` → server converts to RRule.

**Timezones:**
- Vercel Cron heartbeat is UTC (Vercel has no TZ support) — fine, it just pokes the dispatcher.
- Per-automation RRule interpreted in the automation's TZ by `rrule.js` via `TZID=` on DTSTART. Dispatcher stores/queries UTC; TZ math only at "compute next occurrence".

---

## Database Schema

### `automations`

File: `packages/db/src/schema/automations.ts` (new), re-exported via `packages/db/src/schema/index.ts`.

```ts
export const automationWorkspaceMode = pgEnum("automation_workspace_mode", [
  "new_per_run",      // create a fresh v2_workspace for each run
  "existing",         // reuse a specific v2_workspace every run
]);

export const automations = pgTable(
  "automations",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    name: text().notNull(),
    prompt: text().notNull(),

    // Agent preset (AgentDefinitionId — "claude", "amp", "codex", etc).
    // Resolved to chat vs terminal at dispatch time via shared AgentSettings.
    agentType: text("agent_type").notNull(),

    // Target device (v2_hosts.id). Null = owner's most-recently-online host at dispatch.
    targetHostId: uuid("target_host_id").references(() => v2Hosts.id, {
      onDelete: "set null",
    }),

    // Workspace mode. "new_per_run" requires v2ProjectId; "existing" requires v2WorkspaceId.
    workspaceMode: automationWorkspaceMode().notNull().default("new_per_run"),
    v2ProjectId: uuid("v2_project_id").references(() => v2Projects.id, {
      onDelete: "cascade",
    }),
    v2WorkspaceId: uuid("v2_workspace_id").references(() => v2Workspaces.id, {
      onDelete: "cascade",
    }),
    // Check constraint (added in migration):
    // (workspace_mode = 'new_per_run' AND v2_project_id IS NOT NULL)
    //   OR (workspace_mode = 'existing' AND v2_workspace_id IS NOT NULL)

    // Recurrence
    rrule: text().notNull(),
    dtstart: timestamp("dtstart", { withTimezone: true }).notNull(),
    timezone: text().notNull(),
    enabled: boolean().notNull().default(true),

    // MCP scope. v1: empty = Superset MCP only.
    mcpScope: jsonb("mcp_scope").$type<string[]>().notNull().default([]),

    // Dispatcher hot path
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("automations_dispatcher_idx").on(t.enabled, t.nextRunAt),
    index("automations_owner_idx").on(t.ownerUserId),
    index("automations_organization_idx").on(t.organizationId),
  ],
);
```

Notes:
- No `model` / `thinking_level` columns — encoded inside the agent preset via shared `agent-settings`.
- No `base_branch` — always project default at dispatch time.
- No `setup_script_override` — inherit project defaults.

### `automation_runs`

```ts
export const automationRunStatus = pgEnum("automation_run_status", [
  "pending",
  "dispatching",
  "dispatched",
  "skipped_offline",
  "dispatch_failed",
]);

export const automationSessionKind = pgEnum("automation_session_kind", [
  "chat", "terminal",
]);

export const automationRuns = pgTable(
  "automation_runs",
  {
    id: uuid().primaryKey().defaultRandom(),
    automationId: uuid("automation_id")
      .notNull()
      .references(() => automations.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),

    hostId: uuid("host_id").references(() => v2Hosts.id, {
      onDelete: "set null",
    }),
    v2WorkspaceId: uuid("v2_workspace_id").references(() => v2Workspaces.id, {
      onDelete: "set null",
    }),

    sessionKind: automationSessionKind(),
    // Exactly one populated based on sessionKind; both nullable for skipped/failed pre-dispatch.
    chatSessionId: uuid("chat_session_id").references(() => chatSessions.id, {
      onDelete: "set null",
    }),
    terminalSessionId: text("terminal_session_id"),

    status: automationRunStatus().notNull().default("pending"),
    error: text(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("automation_runs_dedup_idx").on(t.automationId, t.scheduledFor),
    index("automation_runs_history_idx").on(t.automationId, t.createdAt),
    index("automation_runs_status_idx").on(t.status),
    index("automation_runs_workspace_idx").on(t.v2WorkspaceId),
  ],
);
```

No `completedAt` / `tokenUsage` in v1.

### Migrations

Per AGENTS.md: modify schema files, spin up Neon branch, run `bunx drizzle-kit generate --name="add_automations"`. Never hand-edit `packages/db/drizzle/`.

---

## API Surface (tRPC)

New router: `packages/trpc/src/router/automation/automation.ts` + `schema.ts`. Mounted at `automation` in `packages/trpc/src/root.ts`.

All procedures use `paidPlanProcedure` (new middleware) and are org-scoped.

- `create` — validates RRule, workspace-mode invariants, host access; computes initial `next_run_at`
- `list` — returns rows with `scheduleText` (server-computed via `rule.toText()`) so client never imports `rrule.js`
- `get` — full row + last 10 `automation_runs` for the detail page right rail
- `update` — recomputes `next_run_at` if rrule/dtstart/timezone changed
- `delete` — cascades `automation_runs`; `chat_sessions` survive via `ON DELETE SET NULL`
- `setEnabled` — pause/resume; on resume, recomputes `next_run_at` from now()
- `runNow` — inserts `automation_runs` with `scheduled_for = now()` and triggers dispatch inline
- `listRuns` — paginated, for CLI `logs` and "see all"
- `parseCron` — pure helper, cron → RRule

**List/get return shape:**
- List: `id`, `name`, `enabled`, `nextRunAt`, `lastRunAt`, `rrule`, `timezone`, `scheduleText`, `targetHostId`, `workspaceMode`, `v2WorkspaceId`, `v2ProjectId`, `agentType`
- Get: all of list fields + `prompt`, `dtstart`, `mcpScope`, `recentRuns: [...]`

### Dispatcher route

File: `apps/api/src/app/api/cron/automations/dispatch/route.ts`

```ts
// Protected by CRON_SECRET. For each due automation:
async function dispatchOne(automation: SelectAutomation, now: Date) {
  // 1. Resolve target host
  const host = await resolveTargetHost(automation);
  if (!host) { return recordSkipped(automation, "no host available"); }
  if (!host.isOnline) { return recordSkipped(automation, "host offline"); }

  // 2. Idempotent run insert
  const run = await insertRun(automation, host, now); // ON CONFLICT DO NOTHING
  if (!run) return; // already handled this minute

  // 3. Mint user JWT for relay auth
  const jwt = await mintUserJwt({
    userId: automation.ownerUserId,
    organizationIds: [automation.organizationId],
    scope: "automation-run",
    runId: run.id,
    ttlSeconds: 300,
  });

  // 4. Resolve or create workspace
  let workspaceId: string;
  if (automation.workspaceMode === "existing") {
    workspaceId = automation.v2WorkspaceId!;
  } else {
    // "new_per_run" — call host-service workspace-creation via relay with resolved defaults
    const wsCreate = await callHostService(host, jwt, "workspaceCreation.create", {
      projectId: automation.v2ProjectId!,
      // base branch: project default (no override)
      branchName: generateBranchName(automation, run),
      // setup script / other fields: inherit project defaults
    });
    workspaceId = wsCreate.workspaceId;
    await updateRun(run.id, { v2WorkspaceId: workspaceId });
  }

  // 5. Build AgentLaunchRequest via shared builder
  const agentConfig = resolveAgentConfig(automation.agentType);  // from packages/shared/src/agent-launch
  const launchRequest = buildPromptAgentLaunchRequest({
    workspaceId,
    source: "automation",
    selectedAgent: automation.agentType,
    prompt: automation.prompt,
    configsById: /* resolved via shared agent-settings */,
  });

  // 6. Dispatch based on kind
  try {
    if (launchRequest.kind === "chat") {
      const sessionId = crypto.randomUUID();
      await callHostService(host, jwt, "chat.sendMessage", {
        sessionId,
        workspaceId,
        payload: { content: automation.prompt },
        metadata: { model: launchRequest.chat.model },
      });
      await updateRun(run.id, {
        status: "dispatched",
        sessionKind: "chat",
        chatSessionId: sessionId,
        dispatchedAt: new Date(),
      });
    } else { // terminal
      const terminalResult = await callHostService(host, jwt, "terminal.create", {
        workspaceId,
        command: launchRequest.terminal.command,
        // other terminal config per agent preset
      });
      await updateRun(run.id, {
        status: "dispatched",
        sessionKind: "terminal",
        terminalSessionId: terminalResult.paneId,
        dispatchedAt: new Date(),
      });
    }
  } catch (err) {
    await updateRun(run.id, {
      status: "dispatch_failed",
      error: describeError(err),
    });
  }

  // 7. Advance next occurrence (always, regardless of outcome)
  await advanceNextRun(automation, now);
}
```

**Concurrency.** `FOR UPDATE SKIP LOCKED` on automations select; `ON CONFLICT DO NOTHING` on unique `(automation_id, scheduled_for)`. Vercel Cron double-delivery absorbed.

### Reconciler route

File: `apps/api/src/app/api/cron/automations/reconcile/route.ts` (every 5 min)

- `automation_runs.status='dispatching'` older than 10 min → `dispatch_failed` "crashed mid-flight"
- `automations.next_run_at` > 1 hour in the past → log to Sentry
- Pre-allocated `chat_sessions` from `dispatch_failed` runs with no messages → cleanup

No "stuck dispatched" check needed since we don't track completion.

### Vercel Cron config

File: `apps/api/vercel.json` (new)
```json
{
  "crons": [
    { "path": "/api/cron/automations/dispatch",  "schedule": "* * * * *" },
    { "path": "/api/cron/automations/reconcile", "schedule": "*/5 * * * *" }
  ]
}
```

New env vars: `CRON_SECRET`, `RELAY_URL`.

---

## Host-Service Side

**No v1 changes to host-service routers.**
- `chat.sendMessage` (`packages/host-service/src/trpc/router/chat/chat.ts:44-53`) — accepts caller-provided `sessionId`, first message creates runtime.
- `terminal.create` (in `packages/host-service/src/trpc/router/terminal/terminal.ts`) — called over relay for terminal agents.
- `workspaceCreation.create` — called over relay when in `new_per_run` mode.

**Relay compatibility check during build:** verify `terminal.create` works end-to-end over the relay tunnel (nothing renderer-specific in the path). If it turns out terminal launch depends on desktop-main-process state, surface as blocker.

---

## MCP Gap

MCP disabled everywhere (`disableMcp: true` in two runtimes). No cloud credential table.

**v1:** Superset MCP only; auths via the dispatch JWT's `userId` / `organizationId`.
**Follow-up (separate design doc):** `user_mcp_credentials` (encrypted), per-MCP OAuth UI, scope enforcement per-automation.

---

## CLI

Rename `crons` → `automations`. CLI_SPEC.md (lines 1153-1284) updated as Phase 1 task.

| CLI command | tRPC call |
|---|---|
| `superset automations list` | `automation.list` |
| `superset automations create` | `automation.create` (possibly preceded by `automation.parseCron`) |
| `superset automations update <id>` | `automation.update` |
| `superset automations delete <id>` | `automation.delete` |
| `superset automations logs <id>` | `automation.listRuns` |
| `superset automations run <id>` | `automation.runNow` |

Create flags:
```
--name <name>                     required
--rrule <rrule>                   one of --rrule / --cron / --config required
--cron <cron>                     sugar → server converts
--config <path.json>              full JSON payload for complex cases
--timezone <IANA>                 default: host's TZ, else UTC
--dtstart <iso8601>               default: now
--device <machineId>              default: auto-detect from ~/.superset/device.json
--project <projectId>             required when --workspace omitted (new-workspace mode)
--workspace <workspaceId>         optional; if set, existing-workspace mode
--prompt <text> | --prompt-file <path>   required
--agent <preset-id>               default: "claude"
```

All commands checked by `paidPlanProcedure` server-side; CLI prints a polite upgrade message on `FORBIDDEN`.

---

## Desktop UI (Phase 2)

Routes under `apps/desktop/src/renderer/routes/_authenticated/_dashboard/automations/`. Route component checks `useIsPaidPlan()`; redirects to `/settings/billing` with a notice banner if on free.

### Screens (v2)

- `automations/index.tsx` — list
- `automations/$id.tsx` — detail + recent runs
- `automations/new.tsx` — create modal

### Run detail route (nested inside workspace)

**Key UX decision:** a scheduled run lives inside a workspace. URL pattern:
`/_authenticated/_dashboard/v2-workspace/$workspaceId/scheduled-run/$runId`

This route shows:
- Breadcrumb (`Automations › <name> › <timestamp>`)
- Run header (status, started, automation link)
- Session tabs (Chat / Terminal — one active based on `session_kind`)
- Embedded session viewer (existing chat / terminal pane)

### Data shape for UI

- Run history row: `status`, `scheduledFor`, `sessionKind`, `v2WorkspaceId` → deep link target
- No `duration` / `tokens` displayed (no completion tracking in v1)
- "Runs in" label shows `New workspace` OR the specific workspace name
- Offline host: amber dot on list row, amber banner on detail; `Run now` button disabled with tooltip (no separate dialog)

---

## UI/UX Screens — HTML Mocks

**Location:** `apps/desktop/docs/automations-ui/` — 16 standalone HTML files + `index.html` gallery + shared assets (`tokens.css`, `app-shell.html`).

**Mock inventory:**

| # | File | Purpose |
|---|---|---|
| 1 | `01-list-populated.html` | Status dot · name · folder · schedule |
| 2 | `02-list-empty.html` | First-time state + Browse templates / + New |
| 3 | `03-detail-active.html` | Prompt + right rail (Status / Next run / Last ran / Details) |
| 4 | `04-detail-run-history.html` | Detail with populated Previous runs |
| 5 | `05-create-modal.html` | Title + prompt + chip bar + Use template |
| 5b | `05b-agent-picker.html` | AgentSelect dropdown (Claude / Amp / Codex / …) |
| 6 | `06-schedule-picker-preset.html` | Preset popover + next-5 preview |
| 6b | `06b-schedule-picker-custom.html` | Raw RRule + TZ + DTSTART |
| 7 | `07-template-gallery.html` | Categorized templates (Phase 2, copy placeholder) |
| 8 | `08-edit-modal.html` | Pre-filled create modal |
| 9 | `09-delete-confirmation.html` | Cascade warning |
| 11a | `11a-paused-list-row.html` | Paused list row variant |
| 11b | `11b-paused-detail.html` | Paused detail (Resume button, Next run "—") |
| 12a | `12a-offline-banner-detail.html` | Amber banner, Run-now disabled |
| 12b | `12b-offline-list-dot.html` | Amber dot + tooltip on list row |
| 13 | `13-thread-detail.html` | Scheduled run inside workspace (nested route) |

Dropped from earlier iterations: `10-run-now-offline.html` (redundant — just disable the button).

Right rail order: **Device → Workspace → Repeats → Agent**. (Folder row dropped; Model/Reasoning merged into Agent preset.)

Mocks call out missing v1 fields clearly: duration and tokens are *not* shown on Previous runs. Status values shown are `completed` / `skipped` / `failed` in the mock — implementation will use `dispatched` / `skipped_offline` / `dispatch_failed`.

**Follow-up before shipping UI:** update the mock run-history rows to drop duration/token cells since v1 doesn't track those.

---

## Phases

### Phase 1 — MVP (backend + CLI, ~2-3 weeks)

Ordered by dependency:

1. **Extraction** — move `AgentLaunchRequest` + `agent-settings` to `packages/shared/src/agent-launch/`; move workspace-creation default utilities to `packages/shared/src/workspace-launch/`. Fix imports in `apps/desktop`. Zero logic changes.
2. **Paid-plan gate** — `useIsPaidPlan` hook + `paidPlanProcedure` tRPC middleware + reusable `getCurrentPlan(ctx)` helper.
3. **JWT minting** — verify Better Auth server signer; add helper if missing.
4. **Schema** — `automations` + `automation_runs` + enums + check constraint; migration on Neon branch.
5. **`automationRouter`** — all procedures, `paidPlanProcedure`-gated.
6. **Dispatcher + reconciler** — `apps/api/src/app/api/cron/automations/{dispatch,reconcile}/route.ts`, `vercel.json`, env.
7. **Terminal-over-relay validation** — send a test terminal agent through the full pipeline. If broken, triage before CLI.
8. **CLI** — `automations` subcommand tree; CLI_SPEC.md update.
9. **End-to-end smoke test** (see Verification).

Out of scope: desktop UI, completion tracking, webhooks, third-party MCPs, notifications, teammate-targeted automations, templates gallery.

### Phase 2 — Desktop UI + quality of life

- List / detail / create routes matching mocks
- Preset-based schedule picker + AgentSelect reuse + nested scheduled-run route
- Templates gallery (static curated set, `packages/trpc/src/router/automation/templates.ts`)
- Teammate-targeted automations (notify target, `v2_users_hosts` role check)

### Phase 3 — Completion + triggers + MCP

- Host-service → cloud `automation.reportRunCompletion` callback (populates "Last ran" / duration)
- Webhook triggers (`automation_trigger_tokens`, Linear-style signature)
- `user_mcp_credentials` design doc + implementation
- Per-automation cost caps + token-usage summary
- Notification destinations (Slack, push, email)
- `automation_runs` retention / archive after 90 days
- Dispatch jitter (±2 min) for thundering-herd smoothing

---

## Key Invariants

- `automations` is source of truth. Vercel Cron is dispatcher-only.
- RRule parsed only at create/update and after each fire. Dispatcher hot path is indexed lookup on `next_run_at`.
- Idempotency: unique `(automation_id, scheduled_for)` on `automation_runs`.
- Dispatch channel: cloud API → relay (HTTP + user JWT) → host-service tRPC. No Electric, no `agent_commands`, no renderer.
- At-least-once delivery. "Fired exactly once" assumptions are bugs.
- Host online = `v2_hosts.is_online`. Dispatcher never tries an offline host.
- Agent dispatch goes through the shared `AgentLaunchRequest` builder — no per-agent branching in the dispatcher.
- `next_run_at` advances regardless of dispatch outcome (no auto-retry on failure).

---

## Open Questions (Resolve During Phase 1)

1. **JWT minting mechanism.** Better Auth's JWT plugin — does it expose server-side `signJwt({ payload })` without a session cookie, or do we need a thin signer helper using the same JWKS key? Read `packages/auth/src/server.ts` on day 1. **Blocks the dispatcher.**
2. **Terminal-over-relay viability.** Does `terminal.create` on host-service work transparently through the relay, or does the existing launch flow reach into Electron main process state? Verify with a test dispatch; if broken, scope the fix.
3. **Fallback host when `target_host_id` is null.** Recommend: most-recently-updated online host for owner in the org.
4. **Owner deactivation.** Auto-disable automations when owner leaves org? Propose reconciler cascade; confirm with product.
5. **RFC 5545 subset accepted at validation time.** Allow `FREQ`, `INTERVAL`, `BYDAY`, `BYHOUR`, `BYMINUTE`, `BYMONTHDAY`, `BYMONTH`, `BYSETPOS`, `UNTIL`, `COUNT`. Reject `RDATE`, `EXDATE`, sub-minute precision in v1 with clear error.

---

## Verification

1. **Migration.** Neon branch, `bunx drizzle-kit generate --name="add_automations"`, inspect SQL, apply.
2. **Paid-plan gate.** Confirm `superset automations list` returns `FORBIDDEN` for a free-plan user; passes for a paid one. Same for the `/automations` route in the desktop UI (Phase 2).
3. **Shared extraction.** After moving `AgentLaunchRequest` + `agent-settings`, the desktop still compiles, the new-workspace modal still launches agents.
4. **Chat CRUD.** `superset automations create --name "smoke" --cron "*/2 * * * *" --prompt "hi" --project <id> --agent claude` → `list` shows next_run_at ~2 min out; stored rrule is `FREQ=MINUTELY;INTERVAL=2`.
5. **Terminal CRUD.** Same as above with `--agent codex` (or another terminal-kind preset).
6. **Dispatch happy path (chat).** At fire time:
   - `automation_runs` row: `status='dispatched'`, `session_kind='chat'`, `chat_session_id` populated, `v2_workspace_id` populated (auto-created if new-workspace mode)
   - `automations.next_run_at` advanced
   - Relay log shows `chat.sendMessage`; host-service runtime spawns
   - New workspace appears in the user's sidebar
7. **Dispatch happy path (terminal).** Same shape but `session_kind='terminal'`, `terminal_session_id` populated.
8. **Idempotency.** Rewind `next_run_at` and re-POST dispatch. Zero duplicate runs.
9. **Offline skip.** Shut down local host-service → `v2_hosts.is_online=false`. Trigger dispatch. `automation_runs.status='skipped_offline'`, no session/workspace created, `next_run_at` still advances.
10. **Dispatch failure.** Kill relay during a dispatch. `automation_runs.status='dispatch_failed'` with useful error. No auto-retry.
11. **RRule exhaustion.** Create automation with `UNTIL=<1 min ago>`; next dispatch flips `enabled=false`.
12. **Lookback self-heal.** Pause Vercel Cron for 3 min, resume. Missed minute caught.
13. **JWT scope claims.** Inspect Authorization header landing at relay: `scope: "automation-run"` and `runId` present.
14. **Deep-link into run.** Manually navigate to `/v2-workspace/<workspaceId>/scheduled-run/<runId>` and confirm the nested route component renders (Phase 2).

---

## Critical File Paths

**Schema**
- `packages/db/src/schema/automations.ts` (new) — `automations`, `automationRuns`, enums
- `packages/db/src/schema/index.ts` — re-export

**Shared extraction**
- `packages/shared/src/agent-launch/` (new) — moved from `apps/desktop/src/shared/utils/`
- `packages/shared/src/workspace-launch/` (new) — default utilities extracted from desktop/host-service

**tRPC**
- `packages/trpc/src/router/automation/automation.ts` (new)
- `packages/trpc/src/router/automation/schema.ts` (new)
- `packages/trpc/src/trpc.ts` — add `paidPlanProcedure`
- `packages/trpc/src/router/billing/hooks.ts` (new or inline) — `getCurrentPlan(ctx)` helper
- `packages/trpc/src/root.ts` — mount `automation` router

**Desktop hooks (Phase 1 for gating, Phase 2 for UI)**
- `apps/desktop/src/renderer/hooks/useIsPaidPlan/useIsPaidPlan.ts` (new)

**Auth**
- `packages/auth/src/server.ts` — confirm or add `mintUserJwt` helper

**API route handlers**
- `apps/api/src/app/api/cron/automations/dispatch/route.ts` (new)
- `apps/api/src/app/api/cron/automations/reconcile/route.ts` (new)
- `apps/api/src/env.ts` — add `CRON_SECRET`, `RELAY_URL`
- `apps/api/vercel.json` (new)

**CLI**
- `packages/cli/src/commands/automations/{list,create,update,delete,logs,run}/command.ts` (new)
- `packages/cli/CLI_SPEC.md` — rename `crons` → `automations`, switch to RRule-first + cron sugar

**Desktop (Phase 2)**
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/automations/{index,$id,new}.tsx` (new)
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/scheduled-run/$runId.tsx` (new — nested run-detail route)

**Dependencies**
- `rrule` — RFC 5545 parsing + next-occurrence with TZ
- `cron-parser` — `parseCron` helper (cron → RRule)
