# MCP Roadmap

Where this package is headed: what we adopt from the MCP 2026-07-28 spec /
SDK v2 line, and the target shape of the tool API. Current state: SDK 1.30.0,
stateless Streamable HTTP at `https://api.superset.sh/mcp` (legacy alias
`/api/v2/agent/mcp`), 31 flat tools, tools-only capabilities.

## Spec / SDK adoption

### Now usable (SDK 1.30.0)

- **Tasks extension** (`io.modelcontextprotocol/tasks`) — `ToolTaskHandler`
  ships in 1.30. This is the centerpiece for agent ergonomics: `agents_run`
  and `automations_run` return a task handle; clients drive `tasks/get` for
  status + transcript and `tasks/update` for follow-up input. Replaces
  polling `terminals_read` to follow an agent. Server-side only until major
  clients declare the capability at initialize; keep synchronous shapes as
  the fallback path.
- **MRTR (`input_required` results)** — mid-call user input without a
  bidirectional stream. Use for destructive confirmations
  (`workspaces_delete`, `automations_delete`) and host disambiguation.

### Waiting on SDK support

- **Cacheable list results** (`ttlMs`/`cacheScope` on `tools/list`) — not in
  1.30. Our catalog is static per deploy; declare a long TTL the moment the
  SDK exposes it. Keeps client prompt caches stable across reconnects.
- **SDK v2 (stateless core)** — beta only; migrate when a stable tag ships.
  We are already stateless (no `sessionIdGenerator`), so the migration is
  mostly mechanical: initialize handshake retired in favor of self-contained
  requests (`_meta` carries version/identity/capabilities), optional
  `server/discover`, and header-based routing (`Mcp-Method`/`Mcp-Name`) that
  lets gateways rate-limit per tool without parsing bodies. Do this after
  the toolset rework so the surface migrates once.

### Auth (tracked in the rework plan, gated on better-auth 1.7.0 stable)

- **Protected resources** — `/mcp` and the legacy alias declared as OAuth
  resources; resource-bound access tokens (~1h + refresh) replace 7-day
  audience-list tokens; `@better-auth/mcp` supplies RFC 9728 metadata and
  challenge helpers.
- **Real scopes** — per-toolset scopes (`tasks:*`, `workspaces:*`,
  `agents:*`, `terminals:*`, `automations:*`) enforced centrally in
  `defineTool`, replacing the hardcoded `mcp:full`. Automations `mcpScope`
  points at these.
- **CIMD** — spec-preferred client registration; blocked on better-auth
  (better-auth/better-auth#7184). Until then: open DCR + rate limiting.
- **Delegation token** — replace `mintUserJwt` host-call tokens with a
  dedicated-audience, actor-claimed, scope-carrying token (two-sided rollout
  with the relay).

### Explicitly not adopting

- **Roots, sampling, logging** — deprecated in 2026-07-28 (12-month window);
  we never used them.
- **HTTP+SSE transport** — deprecated; we are Streamable-HTTP-only.
- **MCP Apps** (interactive UI extension) — interesting later bet (live
  workspace/agent status card in-conversation), not part of the core rework.

## Target API layout

Principles: one-sentence tool descriptions (orchestration protocol lives in
server `instructions` + a `superset://guide` resource), `outputSchema` on
every tool, uniform `limit`/`offset` pagination, structured error codes,
opaque handles instead of ID ceremony (list tools return a `workspace`
handle embedding `host:workspace`; hosts stay explicit — no cross-host
fan-outs), and toolsets with a lean default exposure.

| Toolset | Exposure | Tools (target ~24) |
|---|---|---|
| Discovery | default | `hosts_list`, `projects_list`, `org_members_list` |
| Tasks | default | `tasks_list` (full CLI filter parity), `tasks_get`, `tasks_create`, `tasks_update`, `tasks_delete`, `tasks_statuses_list` |
| Workspaces | default | `workspaces_list` (+project/search filters), `workspaces_get` (new; embeds running agents + terminals), `workspaces_create`, `workspaces_update` (+taskId set/clear), `workspaces_delete` (MRTR confirm) |
| Agents | default | `agents_run` (start; returns task handle), `agents_send` (follow-up) — splits today's overloaded `agents_create` |
| Terminals | opt-in | `terminals_create`, `terminals_send`, `terminals_read`, `terminals_close` (`terminals_list` folds into `workspaces_get`) |
| Automations | opt-in | `automations_list`, `automations_get` (incl. prompt), `automations_create`, `automations_update` (incl. prompt + `enabled`, absorbing pause/resume), `automations_delete`, `automations_run` (task handle), `automations_logs` |

Usage data backing the consolidation (30d of `mcp_tool_called`):
`hosts_list` is the #1 tool (pure ID-resolution ceremony — handles attack
the top of the distribution), `terminals_read` is #4 (agent-polling — the
Tasks extension replaces it), the automations get/set-prompt/pause/resume
split serves <50 calls each, and `workspaces_delete` is heavily used
(confirmations are not theoretical).

Breaking changes ship as a clean break behind the same endpoint with one
changelog entry; removed tools return a descriptive "use X instead" error.
Renamed tools fragment PostHog series by `tool` property — segment by
`mcp_server_version` and annotate the cutover; no saved insight filters on
individual tool names today.

Sequencing lives in the rework plan: parity test (MCP↔CLI↔SDK manifest)
before any toolset churn, toolset consolidation next, auth train when
better-auth 1.7.0 goes stable, tasks extension last (client-gated).
