# Agent Lifecycle Hooks: User-Configurable Hook Design

Status: Design draft. Branch `agent-lifecycle-hooks`.

## Goal

Let a user configure their own command/webhook to run automatically when an agent's
lifecycle changes in a Superset workspace — "when an agent is **done**, play a sound /
text me / hit a webhook", "when an agent **needs input**, ping Slack", "when an agent
**fails**, open a ticket" — and hand that hook useful, structured parameters (which
workspace/project/branch, which agent, session id, timestamp) the same way tools like
Claude Code, git, and GitHub Actions already do for their own hook/event systems.

This is a **new capability** (arbitrary user-configured side effects), not a bigger
notification system. It sits next to the existing built-in notification pipeline and
reuses its event vocabulary, but must not be bolted onto the endpoint that pipeline
uses today — see [Security](#security-the-constraint-that-shapes-this-design).

## Prior art

### Already in this codebase

Superset already runs almost this exact pipeline internally — just to drive a chime
and a sidebar dot instead of a user's own command. Everything below is not
inspiration, it's the plumbing to extend:

| Piece | File | What it does |
| --- | --- | --- |
| Per-CLI native hook registration | `packages/agent-setup/src/agent-wrappers-*.ts` | At desktop boot, writes Superset's own hook command into each agent tool's *native* hook config (`~/.claude/settings.json`, `~/.codex/hooks.json`, `~/.factory/settings.json`, …). Superset doesn't invent a hook mechanism per tool — it registers itself as a consumer of each tool's own. |
| Shared normalizer script | `packages/agent-setup/templates/notify-hook.template.sh` | One dumb shell script every agent's native hook points at. Scrapes the tool-specific payload (stdin or argv), maps it to a small vocabulary, POSTs `{terminalId, eventType, agent?}` to host-service. Guarded to no-op outside Superset terminals (`SUPERSET_TERMINAL_ID`/`SUPERSET_TAB_ID` check) — see `HOOKS_INVESTIGATION.md` for why that guard exists and which integrations still lack it. |
| Ingress | `packages/host-service/src/trpc/router/notifications/notifications.ts` (`notifications.hook`) | Deliberately public/unauthenticated, deliberately low-capability: validates `terminalId` against real terminal sessions, derives `workspaceId` server-side (never trusts it from the caller), normalizes the event, broadcasts, returns. |
| Normalizer | `packages/host-service/src/events/map-event-type.ts` | `mapEventType()` collapses every tool's raw event name into `"Start" \| "Stop" \| "PermissionRequest" \| "Failed" \| "Attached" \| "Detached"`. This is the canonical event vocabulary — reuse it, don't reinvent it. |
| Wire event | `packages/host-service/src/events/types.ts` (`AgentLifecycleMessage`) | `{ type: "agent:lifecycle", workspaceId, eventType, terminalId, agent?: AgentIdentity, occurredAt }`. `AgentIdentity` (`packages/shared/src/agent-identity.ts`) = `{ agentId, sessionId?, definitionId? }`. |
| Consumer | `plans/20260422-v2-notification-hooks-client-side.md` + `V2NotificationController` | The design doc for the *built-in* consumer of this same event stream (chime, sidebar dot, click-to-focus). Its layering (dumb script → low-capability ingress → event bus → client controller) is the template this design follows, and it contains an explicit rule that matters a lot here (next section). |
| Config-sharing precedent | `packages/agent-setup/src/disabled-agent-hooks.ts` | Existing precedent for "a hooks-related user choice that must be visible to every provisioner on the machine" (desktop + any CLI-launched host-service): a small JSON mirror file (`~/.superset/agent-hooks.json`) plus an env-var override, desktop as source of truth. The new feature's config should follow the same shape. |
| Discriminated per-kind config | `packages/shared/src/automation-triggers.ts` + `automationTriggerKindValues` (`packages/db/src/schema/enums.ts`) | Automations already has a clean, extensible pattern for "one row, a `kind` enum, a `config: jsonb` discriminated union checked in Postgres" (`CHECK config->>'kind' = kind`). If a user-configured hook should ever be able to *trigger an automation* (not just run a shell command), this is the exact shape to add a new `"agent_lifecycle"` trigger kind to — see [Action types](#action-types). |
| Settings storage convention | `packages/cli/src/lib/settings/registry.ts` | Declarative `SettingDefinition[]` with a `store: "localDb" \| "hostService"` field — i.e. the codebase already distinguishes "lives in Electron's local SQLite" from "lives in host-service, reachable by CLI-only hosts too." Hook definitions need `hostService`, for the reason in [Where hooks run](#where-hooks-run). |

### Outside this codebase

| System | What it gets right | What to borrow |
| --- | --- | --- |
| **Claude Code hooks** (`~/.claude/settings.json`, the harness this very session runs under) | Rich, well-worn design: named lifecycle events (`Stop`, `SubagentStop`, `SessionStart`, `Notification`, …), a `matcher` to scope a hook to a subset of events, multiple **handler types** per hook (`command`, `http`, `mcp_tool`, `prompt`), structured JSON on stdin with both common fields (`session_id`, `cwd`, `hook_event_name`) and event-specific fields, and exit-code semantics (0 = proceed, 2 = block, with stderr as the reason) that let a hook be either fire-and-forget or opinionated. | The **event-name + matcher + typed-handler** shape (`{event: [{matcher, hooks: [{type, command, timeout, ...}]}]}`) is a better config model than a flat command list, and scales cleanly if webhook/automation action types are added later. The **JSON-on-stdin with a stable field set** is a better payload contract than parsing env vars for anything beyond simple identity. Do **not** borrow its exit-code-blocks-the-action semantics — Superset's agent has already finished its turn by the time a lifecycle hook fires; there's nothing left to block (see [Non-goals](#non-goals)). |
| **git hooks / Husky** | Zero-config convention: a script at a well-known path, argv/env for context, exit code for pass/fail. | Simplicity of the base case (one command, no config UI needed) — the v1 of this feature should feel this easy for the "just run one command" case. |
| **GitHub Actions `on:` triggers + job env** | Declarative trigger list per workflow, rich structured context (`github.event`, `github.sha`, …) injected as both env vars and a JSON context object, scoping by branch/path filters. | The **env-vars-for-simple-use + full-JSON-for-scripts** dual contract, and filter-by-branch as a familiar mental model for scoping a hook to specific projects/branches. |
| **npm lifecycle scripts** (`postinstall`, etc.) | Named lifecycle points, env vars (`npm_package_*`) for context, always fire-and-forget from npm's perspective. | Naming convention: short, present/past-tense event names (`done`, `started`, `failed`) read better to end users than the internal wire names (`Stop`, `Start`, `Failed`). |
| **Stripe webhooks** | Signed payload, an `event.type` string, `event.data.object` — consumer explicitly opts into which event types it wants. | Explicit per-hook event-type allowlist (not "fires on everything") as the default UX, and a signed/verifiable payload if this ever crosses a network boundary (relevant if a "webhook" action type posts to a user's own server — sign the body so *they* can verify it came from their own host-service). |
| **VS Code `activationEvents`** | Fine-grained scoping (`onCommand:x`, `workspaceContains:y`) rather than "always active." | Reinforces scoping hooks by project/workspace, not just globally. |

## Event vocabulary

Reuse `AgentLifecycleEventType` as the wire type. Expose a friendlier name to users
(closer to what they asked for — "done", "needs input") without inventing a second
source of truth:

| Wire (`mapEventType` output) | User-facing hook event | Fires when |
| --- | --- | --- |
| `Start` | `started` | Agent begins a turn (first prompt or resume). Noisy — fires once per turn, not once per session; most hook authors will filter this out. |
| `Stop` | `done` | Agent's turn ended cleanly. This is the "done" the feature is named for. |
| `PermissionRequest` | `needs-input` | Agent is blocked on a tool/exec/plan approval or a direct question. |
| `Failed` | `failed` | Turn ended in an error (e.g. Claude's `StopFailure`), distinct from a clean `done`. |
| `Attached` | `session-attached` | A resumable agent session bound to this terminal (session-lifetime, not turn-lifetime; advanced/optional). |
| `Detached` | `session-detached` | Agent process exited / terminal detached from its session. |

No new wire vocabulary needed — `map-event-type.ts` already normalizes every
supported CLI's raw events into exactly this set.

## Config shape

Modeled on the Claude Code shape (event → matcher → handlers) rather than a flat list,
so scoping and multiple action types fall out for free:

```jsonc
{
  "version": 1,
  "hooks": {
    "done": [
      {
        "id": "notify-done-sound",
        "enabled": true,
        // Scope: omitted/"any" = every project & workspace on this host.
        "scope": { "projectId": "proj_abc" },        // optional
        "action": { "type": "command", "command": "afplay ~/sounds/ding.aiff" }
      }
    ],
    "needs-input": [
      {
        "id": "ping-slack",
        "enabled": true,
        "action": {
          "type": "webhook",
          "url": "https://hooks.slack.com/services/…",
          "method": "POST"
        }
      }
    ],
    "failed": [
      {
        "id": "escalate",
        "enabled": true,
        "action": { "type": "automation", "automationId": "auto_123" }
      }
    ]
  }
}
```

- `scope` filters by `projectId` and/or `workspaceId` (list or "any", reusing the
  `triggerScopeSchema` tagged-union pattern from `automation-triggers.ts` rather than
  a bare `string[]` — an id space here is also user-controlled-ish enough that "any"
  should stay a real tag, not a magic string).
- `id` is stable and user-visible (CLI/UI list by it, logs reference it) — same reason
  automations rows have stable ids for run history.

## Params passed to a hook

Two channels, matching the GitHub Actions dual contract — env vars for the common
case, one JSON blob for scripts that want everything:

**Env vars** (always set, `command` and future in-process action types):

```
SUPERSET_HOOK_EVENT=done
SUPERSET_WORKSPACE_ID=ws_...
SUPERSET_WORKSPACE_NAME=my-feature
SUPERSET_PROJECT_ID=proj_...
SUPERSET_PROJECT_NAME=superset
SUPERSET_BRANCH=agent-lifecycle-hooks
SUPERSET_TERMINAL_ID=term_...
SUPERSET_AGENT_ID=claude              # BuiltinAgentId, from AgentIdentity
SUPERSET_AGENT_SESSION_ID=sess_...    # when known
SUPERSET_OCCURRED_AT=2026-09-09T18:04:00.000Z
SUPERSET_HOOK_ID=notify-done-sound
```

**`SUPERSET_HOOK_EVENT_JSON`**: the same fields as one JSON object, for hooks that'd
rather not parse fifteen env vars. Mirrors `AgentLifecycleMessage` plus the resolved
`WorkspaceSnapshot`/`ProjectSnapshot` fields (name, branch, repo) already broadcast
elsewhere in the event bus — don't invent new field names for data that already has a
name on the wire.

`webhook` actions get the JSON blob as the POST body instead of env vars, signed the
way Stripe signs webhook bodies (HMAC over a host-local secret the user can copy from
Settings) so a receiving server can verify the request actually came from their own
host-service.

Two things deliberately **not** included, both per the v1-notification design's own
rule (`plans/20260422-...md`, "Non-Goals"): no agent-authored free text (transcript
excerpt, "summary") in the payload. The agent's own output is not a trusted source for
a string that ends up in a shell command or a Slack message unescaped — hooks get
structured identity, not narrative content, at least in v1.

## Where hooks run

**Not** inside `notifications.hook`. That endpoint has an explicit, written rule
(`plans/20260422-v2-notification-hooks-client-side.md`, bottom):

> Any future change that makes `notifications.hook` do more than broadcast generic
> lifecycle attention must re-open the auth design... Do not add state mutation, data
> reads, arbitrary user-visible content, or **command execution** behind the same
> unauthenticated route.

It's public and unauthenticated on purpose — anything that can guess or read a
`terminalId` can already POST a fake `Stop` event to it today, and the only blast
radius accepted so far is "a chime plays and a forward-only task nudge fires." Wiring
arbitrary command execution / webhook delivery to that same route turns a
same-machine annoyance into a genuine trigger-on-demand primitive for a remote
attacker on any host-service reachable over relay.

Instead: **host-service runs hooks as an internal consumer of its own already-broadcast
event**, not as a side effect of the ingress mutation. Concretely, add a `HookRunner`
that `notifications.hook` calls *after* `ctx.eventBus.broadcastAgentLifecycle(...)` —
same trust boundary as the event bus's other authenticated consumers, but in-process
rather than over the WS the client controller uses. Host-service is the right place
(not Electron main, unlike ringtone playback) because:

- it's the layer that first learns of the event, regardless of whether a desktop
  window is even open — "run a script when done" should work headlessly, the way
  Claude Code's own `Stop` hook does;
- it already has trusted local execution privileges (it spawns every agent's PTY);
  adding "spawn one more user-configured process on an event" isn't a new trust
  boundary for host-service the way it would be for the public ingress route;
- hook *definitions* need to be visible to a CLI-only host with no desktop ever
  attached — same reasoning as `disabled-agent-hooks.ts`'s shared-file precedent.

Storage: a host-service-owned table (or the same JSON-mirror-file pattern as
`agent-hooks.json` for v1, promoted to a real table once scoping/CLI CRUD lands), not
Electron's `local.db` — the CLI settings registry's `store: "hostService"` field
exists for exactly this split.

## Security

This is the section that actually decides the design, not an afterthought:

1. **Config writes require local trust.** Creating/editing a hook needs the same
   authenticated-local-app access as, e.g., writing git settings — never expose hook
   CRUD over the relay-reachable surface without the same paywall/confirm gate
   `exposeHostServiceViaRelay` already has.
2. **Never shell-interpolate untrusted fields.** `agentId`/`sessionId` on the wire
   payload originate from the public, unauthenticated ingress POST body. A `command`
   action must pass them as env vars / argv entries (exec form), never build a shell
   string by concatenation — the exact exec-form-vs-shell-form distinction Claude
   Code's own hook config already makes.
3. **Rate-limit execution per hook.** The ingress is still unauthenticated and still
   only requires a valid `terminalId` — bound replay abuse (a remote actor spamming
   the same real terminal's event) with a per-`(hookId, terminalId)` cooldown, same
   spirit as the "per-workspace rate limiting" already called out as a TODO on the
   ingress itself.
4. **Default OFF, explicit opt-in per hook.** No hook fires until a user configures
   one; there is no "on by default" hook.
5. **Fire-and-forget, bounded timeout, never blocks the agent.** Matches the existing
   "hook failures never block the agent" principle — a hanging or failing user command
   must never delay or affect the agent session it fired from.
6. **Webhook bodies are signed** (see above) so the feature doesn't quietly become an
   unauthenticated-request generator against arbitrary URLs the user configured.

## Action types

Start with one, design the config so more slot in without a shape change:

1. **`command`** (v1) — spawn a local process with the env vars above. Covers sounds,
   `terminal-notifier`/`notify-send`, `curl`, small scripts.
2. **`webhook`** (v1 or fast-follow) — POST the signed JSON payload to a URL. Covers
   Slack/Discord/custom endpoints without asking the user to run a local listener.
3. **`automation`** (later) — hand the event to an existing Superset automation
   instead of a raw command, so "when Agent A finishes, spawn Agent B to review it"
   reuses automations' existing dedup/debounce/run-history machinery rather than
   reinventing it here. This is the natural point to add `"agent_lifecycle"` to
   `automationTriggerKindValues` (`packages/db/src/schema/enums.ts`) with a
   `TriggerConfig` variant carrying `{ events: HookEvent[], scope: TriggerScope }` —
   same discriminated-union pattern every other trigger kind already uses.

## Config surfaces

- **Desktop Settings** — a new section (own divider group, not folded into
  Notifications) listing configured hooks, add/edit/delete, a "send test event"
  button per hook (fires the action once with synthetic params — the fastest way for
  a user to confirm their command/webhook actually does what they think).
- **CLI** — `superset hooks list/add/edit/remove/test`, structural sibling of
  `packages/cli/src/commands/automations/` (list/create/update/delete/run) rather
  than the flatter `settings get/set`, since a hook is a multi-field record with an
  id, not a scalar setting. Not a fast-follow behind the UI — ship both from v1, since
  a headless host (no desktop ever attached) has no other way to configure one. Flags
  mirror the record 1:1, so the Settings UI can always show the equivalent command:

  ```
  superset hooks add "Completion chime" \
    --event done \
    --scope any \
    --run "afplay ~/Sounds/done.aiff"

  superset hooks add "Escalate failures" \
    --event failed \
    --scope project:superset \
    --automation "Escalate to on-call"

  superset hooks edit hook_9f2c1e --event done --event failed   # repeatable, additive
  superset hooks test hook_9f2c1e
  superset hooks list --project superset
  superset hooks remove hook_9f2c1e
  ```

  `--scope` takes `any`, `project:<name>`, or `workspace:<name>`; the action is
  exactly one of `--run <command>`, `--webhook <url>`, or `--automation <name>`.
- **Per-project override** — a project's own hooks layer on top of global ones (both
  fire), matching how `scope` is additive rather than exclusive elsewhere in the repo.

## Non-goals

- Blocking or altering agent behavior from a hook (Claude Code's exit-code-2 semantics
  don't apply — by the time `done`/`failed`/`needs-input` fires, the turn has already
  ended or is already blocked on the user, there's nothing left in-flight to veto).
- Agent-authored content (transcript text, summaries) in the hook payload, v1.
- Hooks firing for subagent activity — subagent events are explicitly excluded from
  terminal-level lifecycle today (`notifications.ts`'s `subagentId` branch) and should
  stay excluded here for the same reason: it's not the terminal's lifecycle.
- Retrofitting this onto `notifications.hook` itself.

## Phasing

1. **v1**: `command` action only, global scope, `done`/`needs-input`/`failed` events,
   env-var params, desktop Settings UI **and** `superset hooks` CLI together (a
   headless host has no other way to configure one — see Config surfaces),
   host-service-local JSON file storage (mirrors `agent-hooks.json`), rate limiting +
   opt-in-per-hook from day one (not a fast-follow — see Security).
2. **v2**: per-project/workspace `scope`, `webhook` action + signing, promote storage
   to a real host-service table.
3. **v3**: `automation` action type via a new `automationTriggerKindValues` entry;
   `started`/`session-attached`/`session-detached` events for power users.

## Testing plan

- `mapEventType` → user-facing event name table is exhaustive (every wire value maps
  to exactly one hook event name).
- Hook matching: scope filters (`any`/project/workspace list) match/reject correctly,
  disabled hooks never fire, per-`(hookId, terminalId)` cooldown suppresses a replay
  within the window and allows one after it expires.
- `command` action never passes user-controlled fields through a shell (`argv` array
  in, not a concatenated string) — a regression test with an `agentId` containing
  shell metacharacters should not execute them.
- A failing/hanging hook command does not delay or fail the triggering
  `notifications.hook` call (assert the mutation still returns promptly and
  successfully).
- Webhook signature: a tampered body fails verification with the documented secret.
- E2E: real terminal → real `Stop` event → configured `command` hook actually runs,
  observed via a marker file the test command writes.
