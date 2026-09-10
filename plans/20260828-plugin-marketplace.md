# Plugin Marketplaces, Manifests & the Integration Proxy

Phase 1 of the plugin system: a marketplace format anyone can publish, a plugin manifest that
conforms to the Agent Plugins standard, a CLI that materializes installed plugins into every agent
on the machine, and a server-side proxy that holds credentials and fronts every MCP server.

Access management (org enable/disable, team scoping) is deliberately **out of scope here** and
specified in [20260818-org-plugin-governance.md](20260818-org-plugin-governance.md). Section 10
lists the three shapes phase 1 must carry so that work stays additive.

## 1. Scope

In phase 1, every user has access to every plugin in every marketplace they can see. There is no
policy engine, no org toggle, no team scoping.

What ships:

| Component | Where it lives |
| --- | --- |
| Marketplace format | `.agent-marketplace.json`, published from any git repo |
| Plugin manifest | one `plugin.json` + optional `skills/` per plugin |
| SDK | `@superset/plugin-sdk`, published; resolution, auth, tools, skills |
| Local orchestration | `superset plugins` CLI, on top of the SDK |
| Integration proxy | New MCP proxy route in `apps/api`, credentials server-side |

The result is a real product on its own: browse a marketplace, install a plugin, connect your
account, and the tools and skills work in every agent CLI on the machine. That is the free-tier
top-of-funnel the public roadmap already commits to
(`apps/marketing/src/app/roadmap/data.ts:127`).

## 2. Concepts

| Term | Definition |
| --- | --- |
| **Marketplace** | A published list of plugins. One git repo, one `.agent-marketplace.json`. Superset ships a first-party one; companies publish their own. |
| **Plugin** | The installable unit: a directory with `plugin.json` and optional `skills/`. |
| **Skill** | A `SKILL.md` folder, per the Agent Skills spec. Materialized to disk by the CLI. |
| **MCP server** | A remote HTTPS tool server (`streamable-http`), or — first-party marketplace only — a bundled module the host imports. No stdio, no binaries. |
| **Connection** | One user's authorization for one plugin. Held server-side, never on the user's disk. |

## 3. Conform below, own above

Agent Plugins 1.0 (agent-plugins.org) is a vendor-neutral packaging standard already shipping in
Claude Code, VS Code, and Vercel. It defines `plugin.json`, `skills/`, and `mcp.json` — and
explicitly declines to define authentication, distribution, marketplaces, enterprise policy,
provenance, or audit. Its own framing: by refusing to define a marketplace, discovery is left to
"whoever builds the best answer".

That is the split this plan takes:

- **Packaging — conform exactly.** Cost is near zero: 17 of the 19 entries in today's
  `PLUGIN_CATALOG` are already just a name and a URL. Free side effect: Superset plugins load in
  any conformant client. That is upside, not an obligation — nothing in this design requires a
  plugin to work outside Superset.
- **Marketplace, auth, and policy — define them ourselves.** This is the unowned layer. Names
  should be neutral so others can implement them.

### What the standard constrains

Three rules from the spec shape the design more than anything else:

1. **`plugin.json` has a closed field list** — `$schema`, `name`, `version`, `description`,
   `author`, `homepage`, `repository`, `license`, `keywords`, `extensions`. Nothing else.
   Superset-specific data goes in `extensions`, which the spec designates for exactly this:
   *"Agent Plugins assigns no semantics to namespace object contents."* We key ours as
   `superset`. The spec's description says reverse-domain, but the schema places no
   `propertyNames` constraint on the key, so a bare name validates.
2. **`mcp.json` forbids credentials.** Remote servers take *"no credentials in headers, no
   placeholder expansion"*, and stdio servers expand only `PLUGIN_ROOT` and `PLUGIN_DATA` —
   *"Clients MUST NOT perform any other placeholder or environment-variable expansion."* There is
   no conformant way to inject a token into a materialized config file. This is what forces the
   proxy in §8.
3. **Paths must stay inside the plugin root**, after symlink resolution. Loading is
   fail-soft everywhere else: a bad server is skipped, a bad skill is skipped, unknown top-level
   fields are reported and ignored.

## 4. Marketplace format

A marketplace is a git repo with **`.agent-marketplace.json`** at its root. The format mirrors
Claude Code's `.claude-plugin/marketplace.json` field for field — that design is proven at scale
(the official Anthropic marketplace carries 291 entries), and mirroring it means one repo can be
published into both ecosystems.

```jsonc
// .agent-marketplace.json, at the root of a git repo
{
  "$schema": "https://superset.sh/schemas/marketplace/1.0.0.json",
  "name": "superset",
  "description": "First-party Superset plugins",
  "owner": { "name": "Superset", "url": "https://superset.sh" },
  "plugins": [
    {
      "name": "linear",
      "description": "Plan and build products",
      "author": { "name": "Superset" },
      "category": "productivity",
      "source": "./plugins/linear"
    },
    {
      "name": "acme-internal",
      "description": "Acme's internal tooling",
      "category": "development",
      "source": {
        "source": "git-subdir",
        "url": "https://github.com/acme/agent-plugins.git",
        "path": "plugins/internal",
        "ref": "v1.5.5",
        "sha": "30287f5e3f122a646d1ac5ca3ab96e130c52a3ad"
      }
    }
  ],
  "featured": ["linear", "github", "notion", "sentry"],
  "renames": {}
}
```

**`source` is either a string or an object, and both resolve to a plugin directory** — one code
path, no special cases:

- **String** — a subdirectory of this marketplace's own repo.
- **Object** — a pointer into another repo: `url` + `path`, versioned by `ref` (tag or branch) and
  pinned by `sha`. This is how a marketplace curates plugins it does not host, and it is the
  version-resolution mechanism: `ref` names the version, `sha` makes the fetch reproducible and
  auditable.

`plugins` is an **array**, not a map — each entry carries its own `name`, matching the format being
mirrored. `renames` maps old plugin names to new ones so a rename does not orphan existing
installs.

`featured` is an ordered array at the marketplace level rather than a per-plugin boolean. Curation
is a property of the list, not of the plugin — today's code already says so
(`packages/shared/src/plugins/index.ts:64`) — and an array carries order, which a boolean cannot.

Every plugin, local or remote, resolves to a directory laid out per §5. A plugin that ships a
custom MCP implementation ships it in that same directory and it is fetched along with everything
else.

Adding a marketplace is `superset plugins marketplace add <github-url>`; the first-party
marketplace is present by default.

### Resolution and cache layout

Also mirrored, because this shape is load-bearing rather than incidental:

```
~/.superset/plugins/
├── known_marketplaces.json   # name → { source: { source: "github", repo }, installLocation, lastUpdated }
├── installed_plugins.json    # "<plugin>@<marketplace>" → [{ scope, installPath, version, installedAt, gitCommitSha }]
├── marketplaces/<name>/      # git clone of the marketplace repo
└── cache/<marketplace>/<plugin>/<version>/
```

Versions coexist under `cache/` instead of overwriting, so rollback is a pointer change and two
things can depend on different versions of the same plugin. Recording `gitCommitSha` per install
makes "what exactly is on this machine" answerable — which becomes a security property rather than
a nicety once org-published marketplaces exist.

## 5. Plugin manifest

```jsonc
// plugins/github/plugin.json — valid Agent Plugins 1.0, single file
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "github",
  "version": "1.0.0",
  "description": "Work with issues, pull requests, and CI",
  "license": "MIT",
  "extensions": {
    "superset": {
      "interface": { "displayName": "GitHub", "category": "Developer tools" },
      "auth": {
        "type": "oauth2",
        "provider": "github",
        "authorization_url": "https://github.com/login/oauth/authorize",
        "token_url": "https://github.com/login/oauth/access_token",
        "scopes": ["repo", "read:org", "workflow"],
        "scope_separator": " ",
        "identity": {
          "url": "https://api.github.com/user",
          "headers": { "Authorization": "Bearer ${config.access_token}" },
          "id": "$.id",
          "label": "$.login"
        }
      },
      "bind": { "headers": { "Authorization": "Bearer ${config.access_token}" } },
      "mcp": { "type": "streamable-http", "url": "https://api.githubcopilot.com/mcp/" }
    }
  }
}
```

Everything Superset-specific lives under `extensions.superset`, which keeps the manifest valid
against the closed top-level field list. There is no `mcp.json`: `mcp` is a **single object, not a
map**, so the one-server rule is structural rather than validated. A plugin with a bundled server
omits it. `superset plugins check` rejects a plugin that declares both.

### Auth

`auth.type` is `oauth2` or `api_key`, and both share `inputs` — values the user supplies, which any
URL or header can template as `${inputs.<name>}`:

- **`oauth2`** needs `authorization_url` and `token_url`. Inputs cover per-tenant providers where
  the URL itself is unknown until the user names their host — a self-hosted Jira or GitLab.
- **`api_key`** has no URLs. `credential_input` names which input holds the secret.

Whichever type a plugin uses, the credential lands in the same place, so `bind` is always
`${config.access_token}` and the proxy never branches on auth type. Input values are stored on the
connection as `config` jsonb, so templates re-resolve on every refresh and tool call.

`identity` is optional and declares how to learn which account a connection belongs to:
`url`, `method`, `headers`, `body`, and JSONPath-lite `id` / `label` paths into the response
(`$.a.b[0].c`). `body` exists because some providers only answer over GraphQL — Linear's identity
is a POST. **Without `identity`, a connection gets a generated id and no label**, which is fine
until one user needs two connections to the same plugin.

Its real value is not multi-account: it verifies the token works the moment auth completes rather
than on the first tool call, and gives the UI something true to show.

`bind` describes how the credential reaches the single server, so it needs no server key. A plugin
with no `bind` needs no credential and is proxied plain. `${config.access_token}` is resolved
**inside the proxy**, never written to disk.

`auth.provider` is optional and matches the `integration_provider` enum. When present, the plugin
reuses the org's existing `integration_connections` record instead of asking the user to authorize
a second time — see §9.

`clientId` and `clientSecret` are deliberately absent from the manifest. They are per-deployment
config, keyed by plugin name, alongside the existing `env.LINEAR_CLIENT_ID`.

### Phase 1 restrictions

- **No `stdio`, no bundled binaries.** A plugin's tools come from a `streamable-http` server or,
  for the first-party marketplace only, a bundled module the host imports (§6.3). This drops an
  entire class of failure — version drift, multi-hundred-megabyte background downloads, registry
  lookups on every server spawn, and arbitrary npm code execution triggered by a manifest.
- **Plugins needing a local binary ship as skills instead.** The skill documents how to drive the
  tool; the user installs it. `plugins/superset/skills/browser/SKILL.md` already works exactly this
  way, driving browsers through `superset browser` verbs rather than an MCP server.
- Cost of both restrictions: **2 of 19** current catalog entries — `playwright` and
  `chrome-devtools`, both `npx`-based browser automation already covered by the `browser` skill.

### Worked example: why not stdio

`npx -y @playwright/mcp@latest` looks like it self-installs. It does not. `playwright`'s published
`package.json` has no `scripts` field at all — the postinstall browser download was removed — and
`@playwright/mcp@0.0.79` exposes no `browser_install` tool, so the model cannot self-heal. Worse,
it pins an exact Chromium build through its bundled `playwright-core`: 0.0.79 demands
`chromium-1237`, while a machine with Playwright already installed for this repo carries 1208 and
1223. It fails there too. See [playwright-mcp#1091](https://github.com/microsoft/playwright-mcp/issues/1091),
still open. A manifest format that permits this inherits every one of those failures.

## 6. The SDK

One package, `@superset/plugin-sdk`, published for plugin authors and used by our own server and
CLI. Two entry points so authoring dependencies never reach the host and vice versa:

- `@superset/plugin-sdk` — types and helpers a plugin author writes against.
- `@superset/plugin-sdk/host` — resolution, credential handling, and execution. Used by `apps/api`
  and by the `superset plugins` CLI, so both behave identically.

### 6.1 Marketplace resolution

```ts
addMarketplace(githubUrl: string): Promise<Marketplace>       // clone → parse .agent-marketplace.json
listPlugins(marketplace: string): Promise<PluginEntry[]>
resolvePlugin(name: string, marketplace: string): Promise<ResolvedPlugin>
```

`resolvePlugin` materializes a plugin into `cache/<marketplace>/<plugin>/<version>/` and returns
its parsed manifest plus an absolute path. For a string `source` the contents come from the
already-cloned marketplace repo. For a `git-subdir` source it is a sparse checkout of `path` at
`ref`, with the resulting commit verified against `sha` before anything is written — a mismatch is
a hard failure, not a warning, since `sha` is the only provenance signal in the format.

Resolution is idempotent and content-addressed by version: if the target directory already exists,
nothing is refetched.

### 6.2 OAuth

Auth is **declared** by the author and **executed** by the host. The declaration adopts core's
`OAuth2Params` shape (`packages/types/src/oauth/params.ts` in `redplanethq/core`) rather than a
reduced one, because each of its fields exists to accommodate a real provider:
`scope_separator` (Linear uses commas where most use spaces), `token_request_auth_method` (HTTP
Basic vs form-post client auth), `token_response_metadata` (fields like Slack's team id that must
be persisted from the token response), `token_expiration_buffer`. Three auth types are supported:
`OAuth2`, `api_key`, and `mcp`.

```ts
buildAuthorizationUrl(spec: AuthSpec, ctx): string
exchangeCode(spec: AuthSpec, code: string, ctx): Promise<Credential>
refresh(spec: AuthSpec, credential: Credential): Promise<Credential>
```

The host stores credentials encrypted, reusing better-auth's `setTokenUtil` / `decryptOAuthToken`.
better-auth's `generic-oauth` plugin is deliberately **not** used: its `config` is a static array
fixed at `betterAuth()` init, which cannot express marketplaces added at runtime; it writes to
`auth.accounts`, the sign-in table, which has no `organization_id` and couples plugin disconnects
to authentication rows; and its `GenericOAuthConfig` is strictly less expressive than
`OAuth2Params`. This evaluation is recorded so it is not re-litigated.

### 6.3 Tool calling

A plugin exposes tools one of two ways, and the SDK presents one interface over both:

```ts
getTools(plugin: ResolvedPlugin, config: Config): Promise<Tool[]>
callTool(plugin: ResolvedPlugin, name: string, args: unknown, config: Config): Promise<Result>
```

- **Remote** — the manifest's `mcp` field names a `streamable-http` server. The host proxies (§8).
- **Bundled module** — the plugin directory ships a JS entrypoint exporting `run(payload)`,
  dispatched on `GET_TOOLS` / `CALL_TOOL`. This is core's model
  (`apps/webapp/app/services/integrations/integration-runner.ts`): the host dynamic-imports the
  bundle, caches it by slug, and busts that cache with a `?v=<n>` query suffix since an ESM module
  cannot be un-imported. Credentials travel in the payload's `config`, so the host holds tokens and
  injects them per call.

The bundled form is what makes a *custom* MCP possible without shipping binaries, and it is the
only form that can also serve non-tool events (setup, scheduled sync, webhook processing) — which
is what integrations need when they fold into plugins (§9).

**It is also the main security boundary in this design.** A bundled module runs in-process with
full host privileges. Acceptable for first-party plugins; not acceptable for arbitrary
marketplaces. Phase 1 therefore permits bundled modules **only from the first-party marketplace**,
and third-party marketplaces are restricted to remote `streamable-http` servers. Sandboxing is the
prerequisite for lifting that, and is out of scope here.

### 6.4 Skills

```ts
listSkills(plugin: ResolvedPlugin): Promise<SkillSummary[]>
readSkill(plugin: ResolvedPlugin, name: string): Promise<SkillBundle>
materializeSkills(plugin: ResolvedPlugin, targets: AgentTarget[]): Promise<void>
```

A `SkillBundle` is the **whole folder**, not just markdown: `SKILL.md` plus `scripts/`,
`references/`, and any other files the skill carries. This is the gap in core's implementation,
whose `list_skills` / `get_skill` tools (`apps/webapp/app/utils/mcp/skill.ts`) return skill content
only — enough to read instructions, not enough to run a skill that shells out to its own script.

`materializeSkills` is what the CLI calls, and it is the existing `managed-skills.ts` logic
generalized: copy the tree, insert the managed-skill marker, write the sentinel, reap stale
directories, and never overwrite a user-owned file.

## 7. CLI orchestration

The CLI is a thin consumer of `@superset/plugin-sdk/host`, so skills and MCP config are shared
across every agent on the machine rather than configured per agent.

```
superset plugins list
superset plugins install <plugin>
superset plugins remove <plugin>
superset plugins sync
superset plugins connect <plugin>
superset plugins marketplace add|remove|list <repo>
```

No `plugins` or `mcp` command exists today across the 19 command directories in
`packages/cli/src/commands/`, so this is a new surface — but not new machinery. Both materializers
already exist and are generalized rather than written:

- **Skills** — `packages/agent-setup/src/managed-skills.ts` already writes to
  `~/.claude/skills/<plugin>/`, `~/.agents/skills/<plugin>-<name>/SKILL.md`, and
  `~/.agents/commands/<plugin>/<name>.md`, with sentinel-guarded reapers and `isUserOwnedFile`
  checks. Today it is hardcoded to the single bundled `plugins/superset` directory; phase 1 makes
  its source any installed plugin.
- **MCP config** — `packages/agent-setup/src/managed-mcp-servers.ts` already writes Claude's
  `~/.claude.json` `mcpServers` map and Codex's marker-delimited block in `~/.codex/config.toml`,
  with ownership tracked in `~/.superset/plugins/mcp-ledger.json` and a read-then-recheck
  concurrency guard. Phase 1 changes only *what URL* it writes.

`superset plugins sync` is the single reconciler: read installed plugins, materialize skills, write
one `streamable-http` entry per server pointing at the proxy, and reap anything stale. The desktop
app calls the same code path it calls today at `apps/desktop/src/main/index.ts:554`.

Install state stays where it is — `installedPlugins` on the local-db settings singleton
(`packages/local-db/src/schema/schema.ts:264`) — extended with the marketplace each plugin came
from.

## 8. The integration proxy

Because a materialized MCP config cannot carry credentials, a URL Superset serves is the only way to
authenticate a server. The proxy is therefore not an optimization; it is the mechanism.

```
agent → https://mcp.superset.sh/g/{org}/{plugin}    ← what lands in the agent's MCP config
          ├─ authenticate the caller        → which user, which org
          ├─ canUsePlugin(user, org, plugin) → returns true in phase 1
          ├─ resolve the connection          → this user's token for this plugin
          ├─ apply bind                      → attach header per the manifest
          └─ proxy → https://mcp.linear.app/mcp
```

Consequences worth stating plainly:

- **No credential ever reaches the user's disk.** The materialized config contains a Superset URL
  and nothing else.
- **Revocation is immediate.** Disconnect, and the next call fails. Compare with a materialized
  token, where revocation depends on rewriting a file on a laptop that may be offline for a week.
- **It is the natural enforcement point** for the policy work in phases 2 and 3, evaluated per
  call rather than per install.
- **It is a new availability dependency.** Every proxied tool call now depends on Superset being
  up. This is the main cost of the design and is called out again in §11.

Transport is stateless Streamable HTTP, matching the existing Superset MCP server
(`packages/mcp/docs/ROADMAP.md` records that SSE was considered and not adopted).

## 9. Auth and data model

### Flow

1. User installs a plugin whose manifest declares `auth`.
2. `superset plugins connect linear` (or the desktop button) opens the browser to a Superset route
   that builds the provider's authorize URL from `authorizationUrl` + `scopes` + the deployment's
   client id.
3. The callback exchanges the code at `tokenUrl` and stores the result.
4. `superset plugins sync` writes the proxy URL into every agent config.

Steps 2 and 3 are a generalization of code that already exists per provider. Compare
`apps/api/src/app/api/integrations/linear/connect/route.ts` — `authorizationUrl`,
`scope=read,write,issues:create`, and `env.LINEAR_CLIENT_ID` are hardcoded there and become manifest
data here.

**What does not generalize:** the per-provider tail in each callback. Linear's constructs a
`LinearClient`, reads `viewer.organization` to resolve `externalOrgId`/`externalOrgName`, calls
`upsertIdentity` with Linear-specific viewer fields, and queues an initial-sync job. A manifest can
describe an OAuth handshake; it cannot describe "call the vendor SDK to find the workspace id."
That tail stays provider-specific code, which is why `auth.provider` exists.

### Two credential planes

| Plane | Holds | Used by |
| --- | --- | --- |
| `integration_connections` | The 7 deep integrations: linear, github, slack, sentry, microsoft_teams, google, notion | Webhooks, sync jobs, identity linking — and plugins whose manifest sets `auth.provider` |
| `plugin_connections` (new) | Everything else | The proxy |

```
plugin_connections
  id             uuid pk
  organization_id uuid null      -- null for users with no org
  user_id        uuid not null   -- connections are always per-user in phase 1
  plugin_name    text not null   -- text, never an enum
  marketplace    text not null
  access_token   text not null
  refresh_token  text
  token_expires_at timestamp
  scopes         text[]
  created_at, updated_at
  unique (organization_id, user_id, plugin_name)
```

`plugin_name` is **text, not an enum**. This is the point: adding a plugin is a marketplace edit,
never a database migration. Every provider added to `integration_connections` today costs an enum
migration, which is exactly what makes that table the wrong home for plugin credentials.

Token refresh reuses the existing pattern in
`packages/trpc/src/router/integration/token-refresh.ts` — a five-minute buffer and a DB advisory
lock so concurrent refreshes serialize.

### Encryption

`integration_connections.access_token` and `refresh_token` are stored **cleartext** today; the
`secrets` table with `encrypted_value` was dropped in migration 0067. `plugin_connections` should
not repeat that. Column encryption is a prerequisite for phase 2 regardless, since org-scoped
credentials raise the blast radius, and it is cheaper to add before the table has rows.

## 10. What phase 1 must carry for later phases

Access management is deferred. Three shapes are not, because retrofitting them means touching
every installed machine or performing an ambiguous backfill:

1. **The org segment in the proxy URL** — ship `/g/{org}/{plugin}/{server}` with a placeholder for
   org-less users. This URL is written into agent MCP config on every machine a user owns. Adding the
   segment later means rewriting config on machines that may be offline.
2. **`organization_id` on `plugin_connections`** — nullable and unused in phase 1. Backfilling it
   later has no reliable answer for anyone in more than one org.
3. **`canUsePlugin(userId, orgId, pluginName)` returning `true`** — called by the proxy on every
   request and by `sync`. Phase 2 edits one function instead of hunting call sites.

Nothing else needs anticipating. `plugin_policies`, the org enable/disable UI, `scope_type` /
`scope_id`, and precedence rules are all additive to a table that does not yet exist.

| Phase | Scope |
| --- | --- |
| 1 | This document. Everyone has access. |
| 2 | Org enable/disable — add `plugin_policies`, fill in `canUsePlugin`. |
| 3 | Team scoping — add `scope_type`/`scope_id` to a table that by then exists. |

Teams are already real and populated: `auth.teams` and `auth.team_members` exist (migrations
`0049_add_teams.sql`, `0053`, `0087`), better-auth has `teams.enabled` with `maximumTeams: 25`, and
every org gets an auto-created "Default Team". Nothing is access-scoped by team today, so phase 3
writes the first such resolver — it belongs beside `verifyOrgAdmin` in
`packages/trpc/src/router/integration/utils.ts`, not inside the plugin router. It must resolve
**all** of a user's teams, not `sessions.active_team_id`, which is a UI focus concept.

## 11. Risks

- **Proxy availability.** Every proxied tool call depends on Superset. Mitigation: the proxy is
  stateless and horizontally scalable, and plugins with no `bind` entry may be materialized as
  direct upstream URLs for personal-scope installs.
- **Vendor OAuth compatibility.** A vendor MCP server that runs its own OAuth may reject a token we
  minted against the same provider. This needs empirical confirmation per plugin before it ships;
  Linear is the first to verify.
- **Cleartext precedent.** Landing `plugin_connections` without column encryption repeats the
  mistake `integration_connections` is already living with.
- **Marketplace trust.** Any git repo can publish a marketplace. Phase 1 has no signing or
  provenance; a third-party marketplace can point a plugin at any URL. Acceptable while
  marketplaces are added by hand, not once they are org-pushed.
- **Standard drift.** Agent Plugins is 1.0.0 and young. Conformance is cheap now and could get
  expensive if the spec moves; the `superset` extension namespace is the insulation.

## 12. Build order

1. Schemas for `.agent-marketplace.json` and the `superset` extension; publish under
   `superset.sh/schemas/`.
2. `@superset/plugin-sdk` skeleton with both entry points and the shared types.
3. **SDK §6.1** — marketplace resolution: clone, parse, `git-subdir` sparse checkout with `sha`
   verification, cache under `~/.superset/plugins/`.
4. Convert `PLUGIN_CATALOG`'s 19 entries into the first-party `.agent-marketplace.json`; generate
   the in-code catalog from it at build time so the desktop UI keeps working unchanged.
5. **SDK §6.4** — skills: `listSkills` / `readSkill` returning whole folders, and
   `materializeSkills` generalizing `managed-skills.ts` from the bundled plugin to any installed
   one. Same generalization for `managed-mcp-servers.ts`.
6. `superset plugins` CLI on top of the SDK.
7. **SDK §6.2** — OAuth: `OAuth2Params`-shaped declarations, the `plugin_connections` table with
   encryption, and generic connect/callback/refresh routes.
8. **SDK §6.3** — tool calling: the remote path plus the proxy route (§8), with `canUsePlugin`
   stubbed to `true`. The bundled-module path lands last, first-party marketplace only.
9. Point the desktop Plugins page at the SDK.

Steps 1–6 are useful before 7–9 land: skills-only plugins with no `auth` work end to end without
either the proxy or the credential store existing. That is also the smallest slice worth releasing
the SDK on, since it exercises marketplace resolution and skill materialization — the two pieces
every later phase depends on.
