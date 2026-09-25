# Org-Governed Plugins: Skills, MCP Servers & Connectors

Feature spec for a Superset plugin system with a **Codex-class user experience** (one installable unit bundling skills, MCP servers, and app connectors, browsable in-app) and a **MintMCP-class governance plane** (org-managed catalogs, authorization, per-role policy, audit, and adoption tracking).

Research inputs: [docs/codex-plugins-research.md](../docs/codex-plugins-research.md), [docs/mintmcp-feature-set.md](../docs/mintmcp-feature-set.md), `packages/mcp/docs/ROADMAP.md`, and an architecture audit of this repo (seams cited inline).

## 1. Positioning & packaging

- **Individuals (free):** browse the catalog, install plugins, get skills + MCP config materialized into their local agent CLIs. This replaces today's hand-editing of `.codex/config.toml` / `opencode.json` / `.mcp.json` and is the top-of-funnel.
- **Orgs (paid — pro/enterprise via `subscriptions.plan`):** everything governance-related. Org marketplace, policy states, role/team scoping, connector authorization, brokered credentials, audit, adoption dashboards. This mirrors how Codex (Enterprise workspace controls) and MintMCP (contact-sales) both monetize the admin plane, not the client.
- Public roadmap already commits to the community half: `apps/marketing/src/app/roadmap/data.ts:127` ("Plugin marketplace — browse and install skills, MCP servers, and agent configs", status `next`).

Plan gating uses the existing `isPaidPlan()` (`packages/shared/src/billing.ts`) + `subscriptions` table (`packages/db/src/schema/schema.ts:261`); no new entitlement system in v1. Add one helper (`requirePaidOrgPlan(ctx)`) beside `verifyOrgAdmin` in `packages/trpc/src/router/integration/utils.ts`.

## 2. Concepts

| Term | Definition |
| --- | --- |
| **Plugin** | The installable unit. A versioned bundle of any of: skills, MCP server configs, connector requirements. Manifest-driven. |
| **Skill** | `SKILL.md` folder (existing format; `name`, `description`, optional `argument-hint`, optional `agents/openai.yaml` sidecar). Instruction-only skills get the low-risk review lane; a skill bundling `scripts/` is executable code and reviews in the gated lane like MCP servers until sandboxing/signing is defined. |
| **MCP server** | Remote (`url` + auth) or local (`command`/`args`) tool server entry the plugin ships. Remote-first for org plugins. |
| **Connector** | A required org integration (`integration_connections.provider`) the plugin's MCP servers depend on, e.g. "needs Linear". Declared, not embedded. |
| **Marketplace scope** | Where a plugin is published: **Superset-curated** (public registry), **Org** (private to one org), **Personal/local** (a repo or directory the user points at). Same three-tab model as Codex. |
| **Policy state** | Per org, per plugin: `installed_by_default` \| `available` \| `not_available`. Scoped to roles and/or teams. |
| **Bundle** | A named set of plugins + policy, assignable to a role/team ("Backend eng gets: Linear, Sentry, Neon"). The MintMCP "Virtual MCP" analogue, phase 2+. |

## 3. Plugin manifest

Superset-native manifest, deliberately isomorphic to the Codex/Claude plugin shape so third-party plugins port trivially (we already ship one: `plugins/superset/.claude-plugin/plugin.json`, published via `.claude-plugin/marketplace.json`).

```jsonc
// <plugin-root>/superset-plugin.json  (falls back to .claude-plugin/plugin.json for skills-only plugins)
{
  "name": "linear-workflows",          // stable kebab-case id, unique per marketplace scope
  "version": "1.2.0",                  // semver; acts as cache/reinstall key (Codex convention)
  "description": "Linear triage skills + MCP tools",
  "skills": "./skills/",               // dir of SKILL.md folders
  "mcpServers": "./mcp.json",          // map of { name: { url | command/args, env, enabled } }
  "connectors": ["linear"],           // integration_connections.provider values this plugin needs
  "interface": { "displayName": "Linear Workflows", "icon": "…", "categories": ["pm"] }
}
```

Rules carried over from Codex research: relative `./` paths only — and a `./` prefix is necessary, not sufficient: the materializer canonicalizes every resolved target (symlinks included) and rejects anything outside the plugin root; version bump forces re-materialization; MCP tool names get namespaced per server to avoid collisions. Org-scope plugins may only declare **remote** MCP servers unless an org admin explicitly allows stdio (`command`) servers — arbitrary local processes are the highest-risk component and default-off for pushed plugins.

## 4. User experience

### 4.1 Individual (free tier)

- **Catalog surface:** the MVP (PR #6722) shipped this as a sidebar page at `apps/desktop/src/renderer/routes/_authenticated/_dashboard/plugins/` backed by a desktop-local electron tRPC router (`apps/desktop/src/lib/trpc/routers/plugins/`), not the settings section originally sketched here — tabs **Superset / Org / Personal** and the cloud `plugin` router below remain future work. Web mirror later; desktop first since materialization is host-local.
- **Install:** one click → plugin resolved, cached under `~/.superset/plugins/<scope>/<name>/<version>/`, then **materialized** into every agent CLI the user has (see §5.2). Uninstall/disable reverses it without touching user-owned files.
- **Invocation:** unchanged — skills surface through each agent's native discovery (`.agents/skills/`), MCP tools through each agent's native config. We manage config, not runtime.
- **CLI parity:** `superset plugins list|install|remove|sync` (no `mcp`/`plugins` command exists today across the 16 CLI command dirs).

### 4.2 Org member (paid org)

- The **Org tab** shows plugins the org has published or approved, filtered by the member's role/team policy. `installed_by_default` plugins appear pre-installed and are provisioned automatically at host startup — same hook where `createManagedSkills()` already runs (`apps/desktop/src/main/index.ts:486`, `packages/host-service/src/runtime/agent-provisioning.ts:51`).
- Plugins needing a connector show its authorization state; if the org connection exists, the member configures nothing — tokens never reach their machine (§5.3).
- `not_available` plugins are hidden or shown greyed with "blocked by your organization" (admin-configurable, Codex-style).

### 4.3 Org admin

New **Plugins** area in org settings (web app, next to `(dashboard-legacy)/integrations/`):

1. **Catalog management** — publish private plugins (from a git repo/tarball), approve curated ones, set each plugin's policy state, scope by role (`member`/`admin`/`owner`, from `ROLE_HIERARCHY`) and/or team (`auth.teams`).
2. **Connector authorization** — approve which providers plugins may use; connect org-level OAuth (existing `integration_connections` flow); see which plugins depend on which connection.
3. **Adoption dashboard** — per plugin: installs vs eligible seats, active users (7/30d), tool-call volume, top skills invoked. Per member: what's installed, last activity.
4. **Audit view** — filterable event stream (§7) with CSV export; SIEM export is an enterprise-plan follow-on.

Admin actions gate on `verifyOrgAdmin` (`packages/trpc/src/router/integration/utils.ts:7`) + `requirePaidOrgPlan`.

## 5. Architecture

### 5.1 Registry & policy service

New tRPC router `plugin` in `packages/trpc/src/router/plugin/` (one import + one key in `root.ts`; add to `CLOUD_TRPC_ROUTER_ROOTS` for desktop React Query). Procedures split: `protectedProcedure` for browse/install state, `jwtProcedure` for host-service/CLI sync, admin mutations behind `verifyOrgAdmin`.

The registry stores manifests + resolved content hashes; plugin **content** is fetched from source (git ref / tarball URL / the existing agentskills.io-style digest manifest — `apps/marketing/src/app/.well-known/agent-skills/index.json` already serves per-skill sha256 digests). Content-address everything so hosts can verify what they materialize.

### 5.2 Materialization engine (the free-tier core)

Extend `packages/agent-setup` — the machinery that already pushes org-controlled content into 13 heterogeneous agent configs with ownership markers, user-file guards, and reapers:

- `managed-skills.ts` (`createManagedSkills()`, `MANAGED_SKILL_MARKER`, `isUserOwnedFile()`, `reapStaleSkillDirs()`) → generalize from the single hardcoded `plugins/superset` source to N installed plugins.
- `managed-json-hooks.ts` → **net-new capability: write `mcpServers` blocks** into Claude/Codex(json)/Droid/Mastra/Cursor/Gemini configs. `managed-toml-block.ts` → same for Codex `config.toml` (`[mcp_servers.<name>]`), Kimi, Vibe, Grok. The write matrix is already documented by the committed configs at repo root (`.codex/config.toml`, `opencode.json`, `.mastracode/mcp.json`) plus `docs/agent-tooling.md`.
- Sync triggers: desktop main startup, host-service agent provisioning, `superset plugins sync`, and on policy-change push (orgs). Never clobber user-owned entries — same sentinel model as skills.
- Per-agent env (gateway URLs, `CODEX_HOME`, tokens) rides the already-plumbed-but-unused `host_agent_configs.env_json` → `envOverlayPrefix()` path (`packages/host-service/src/trpc/router/agents/agents.ts:270`) — zero new launch plumbing.

### 5.3 Credential brokering & the MCP gateway (the paid-tier core)

Phase 2 introduces a **gateway endpoint** in `apps/api` (e.g. `/mcp/g/<org>/<server>`): org-scope plugins' MCP entries materialize as gateway URLs instead of direct server URLs. The gateway:

- authenticates the caller with the existing better-auth `oauthProvider` / API-key stack — `resolveMcpContext()` (`packages/mcp/src/auth.ts:169`) already does membership cross-check + **re-mints a JWT narrowed to one org**, exactly the pattern to reuse;
- attaches the org's provider credential server-side from `integration_connections` — tokens never reach laptops, closing the gap where automation triggers deliver **no provider credentials** to agents (`packages/trpc/src/router/automation/dispatch.ts`);
- enforces per-tool policy (allow/deny lists per plugin per role — replaces the hardcoded `"mcp:full"`; adopt the per-toolset scopes from `packages/mcp/docs/ROADMAP.md`);
- writes one audit event per tool call (§7).

**Hard prerequisite:** encryption at rest for `integration_connections.access_token`/`refresh_token` (currently cleartext; the old `secrets` table with `encrypted_value` was dropped in migration 0067). KMS-keyed AES-GCM column encryption lands before any gateway traffic.

**Connector identity limitation to fix en route:** today one connection per org per provider (load-bearing per `dispatchMatchingTriggers.ts:82`). Gateway needs per-user grants for user-attributed tools (phase 2.5: `connection_grants` keyed by user, falling back to the org connection).

### 5.4 Agent identities (phase 3)

Sessions launched by Superset agents authenticate to the gateway as a **dedicated agent identity** (delegation token with actor claims — already sketched in `packages/mcp/docs/ROADMAP.md` as the `mintUserJwt` replacement), giving per-agent audit trails and fixing the multi-account pain Codex users hit (openai/codex#19669, #20500).

## 6. Data model (new tables, `packages/db/src/schema/plugins.ts`)

Follow house conventions: uuid PK `defaultRandom()`, `organizationId` FK cascade + `<table>_organization_id_idx`, `timestamp({withTimezone:true})`, org-scoped natural keys via `unique("<table>_org_<key>_unique")`.

| Table | Purpose / key columns |
| --- | --- |
| `plugins` | Registry entry. `scope` enum (`curated`/`org`), `organization_id` (null for curated), `name`, `source` jsonb (git/tarball/registry ref), latest `version`, `manifest` jsonb, `content_hash`, `published_by_user_id`, `archived_at`. Unique `(organization_id, name)` for org rows plus a partial unique index on `name` where `organization_id IS NULL` — Postgres treats NULLs as distinct, so curated names need their own uniqueness guarantee. |
| `plugin_versions` | Immutable version rows: `plugin_id`, `version`, `manifest` jsonb, `content_hash`. Enables rollback + install pinning. |
| `plugin_policies` | `organization_id`, `plugin_id`, `state` pgEnum (`installed_by_default`/`available`/`not_available`), `roles` text[] (null = all), `team_ids` uuid[] (null = all), `allow_stdio_servers` bool default false, `updated_by_user_id`. |
| `plugin_installs` | Adoption source of truth. `organization_id` (nullable — free users), `user_id`, `plugin_id`, `version`, `origin` enum (`user`/`policy`), `status` enum (`installed`/`disabled`/`removed`), `last_synced_at`, `host_fingerprint`. |
| `plugin_tool_policies` | Phase 2. `plugin_id`, `server_name`, `tool_name`, `effect` (`allow`/`deny`), role/team scoping — the Virtual-MCP-bundle granularity. |
| `audit_events` | Greenfield (no audit table exists anywhere today). `organization_id`, `actor_type` enum (`user`/`agent`/`system`), `actor_id`, `event_type` (e.g. `plugin.policy_changed`, `plugin.installed`, `connector.authorized`, `tool.called`), `subject` jsonb, `metadata` jsonb (params redacted per sensitivity policy), `created_at`. Partition/retention strategy decided at implementation. |

Roles stay better-auth free-text validated against `ROLE_HIERARCHY`; teams reference `auth.teams` (grouping semantics per `plans/20260510-teams-model.md` — team scoping here is *distribution* targeting, not visibility control, consistent with that model).

## 7. Audit & adoption tracking

Two complementary planes:

- **Durable audit (`audit_events`)** — compliance-grade, org-visible, queryable, exportable. Written by the plugin router (policy/install/connector events) and the gateway (tool calls: actor, plugin, server, tool, redacted params, latency, status). Modeled on Codex enterprise logging (actor / timestamp / action / redacted params / status).
- **Product analytics (PostHog)** — adoption dashboards. Fix the known gap first: only 3 call sites pass `groups: {organization}` and `groupIdentify` is never called, so org-level analysis is currently impossible. Add `posthog.groupIdentify` on org create/update and thread `groups` through `captureEvent` (`packages/trpc/src/lib/analytics.ts`). New events: `plugin_installed`, `plugin_synced`, `skill_invoked` (where detectable), `gateway_tool_called`. Admin dashboard reads installs/eligibility from `plugin_installs` (server truth) and activity from PostHog + `audit_events`.

## 8. Phasing

| Phase | Ships | Tier |
| --- | --- | --- |
| **0 — Foundations** | Manifest format; `plugins`/`plugin_versions`/`plugin_installs` tables; `plugin` router; curated registry seeded with our own plugin + the `superset-sh/skills` set (unifying the two drifting distribution paths); agent-setup writes MCP config (the net-new writer); desktop `settings/plugins` catalog; `superset plugins` CLI. | Free |
| **1 — Org governance** | Org marketplace scope + private publishing; `plugin_policies` with role/team scoping + `installed_by_default` auto-provisioning; connector-requirement surfacing; admin Plugins area; `audit_events` for management actions; PostHog groups fix + adoption dashboard v1. | Paid |
| **2 — Gateway** | Token encryption at rest; gateway endpoint with org-credential injection; per-tool policies (`plugin_tool_policies`, scopes per `packages/mcp` roadmap); tool-call audit; bundles UI. | Paid |
| **3 — Agent identities & guardrails** | Delegation tokens with actor claims; per-agent audit trails; rule-based blocking / PII & secret scanning at the gateway (MintMCP "Agent Monitor" analogue). | Paid (enterprise) |

Phase 0 is independently valuable and de-risks everything above it; each later phase only changes *where MCP entries point and who holds credentials*, never the client UX.

## 9. Risks & open questions

- **Stdio servers in org plugins** — pushed local processes are an RCE-shaped surface. Default-off (`allow_stdio_servers`), require explicit admin opt-in per plugin; long-term prefer gateway-hosted.
- **Materialization drift** — users edit agent configs by hand; the sentinel/reaper model handles ownership but conflict UX (user renamed our entry) needs design.
- **Agent coverage** — 15 built-in agents, ~4 config dialects; matrix maintenance is ongoing cost. Ship claude/codex/cursor/opencode first; the rest follow the toml/json writers.
- **Adoption telemetry from local-first hosts** — workspaces are hard-deleted and uncounted server-side today (`packages/shared/src/constants.ts:129`); `plugin_installs.last_synced_at` heartbeats are the reliable signal, not workspace state.
- **Skill invocation detection** — implicit skill loads happen inside third-party CLIs; we may only observe explicit `$`/slash invocations and MCP calls. Set dashboard expectations accordingly.
- Open: org plugin publishing UX (git-ref pull vs upload)? Bundles as first-class objects vs saved policy presets? Where does the community marketplace (`/marketplace/agents` stub) intersect the curated registry? SCIM (MintMCP parity) — defer until enterprise pull?

## 10. Stale docs to correct during implementation

- `AGENTS.md` — "packages/chat discovers slash commands from `.claude/commands`" (code deleted in #6461)
- `apps/docs/content/docs/mcp-server.mdx:364` — `/mcp` slash command no longer exists (recover from git history as prior art for config reading)
- `docs/agent-tooling.md` MCP section — repo *does* commit MCP servers in `.codex/config.toml`, `opencode.json`, `.mastracode/mcp.json`
- `docs/skill-preload-feature.md:17` — points at deleted `SkillToolCall/`
