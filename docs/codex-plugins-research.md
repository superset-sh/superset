# Codex App Plugin System (Apps / MCPs / Skills) — Research

> Research notes compiled 2026-07-24. Goal: understand how OpenAI's Codex app implements its plugin experience so Superset can build a similar surface, layered with MintMCP-style org permission & authorization management (see [mintmcp-feature-set.md](./mintmcp-feature-set.md)).
>
> Primary sources: [Codex plugins docs](https://learn.chatgpt.com/docs/plugins), [Build skills docs](https://learn.chatgpt.com/docs/build-skills.md), [Codex CLI plugin system deep-dive](https://codex.danielvaughan.com/2026/03/30/codex-cli-plugin-system/), [Enterprise admin rollout guide](https://learn.chatgpt.com/docs/enterprise/admin-setup), [OpenAI admin controls for plugins/apps](https://help.openai.com/en/articles/11509118-admin-controls-security-and-compliance-for-plugins-and-apps).

## 1. The product model

A **plugin** is the installable unit. It bundles one or more of: **Skills**, **Connectors (Apps)**, **MCP servers** — plus browser extensions, hooks, and scheduled-task templates. The three the UI leads with:

| Component | What it is | Weight |
| --- | --- | --- |
| **Skill** | A folder of markdown instructions (`SKILL.md`) + optional scripts, loaded on demand via progressive disclosure | Lightest — no process, no auth |
| **App (Connector)** | OAuth2 integration with a SaaS platform (GitHub, Slack, Google Drive…), bidirectional read/write, token refresh managed by the platform | Medium — auth-centric, account-linked |
| **MCP server** | A stdio process or remote HTTP server exposing arbitrary tools | Heaviest — arbitrary code, stateful |

Distribution is a **universal plugin directory shared between ChatGPT and Codex**, surfaced in the app as tabs: **OpenAI (curated) / workspace / personal** marketplaces. Users browse & install in the GUI or via `/plugins` in the CLI. Some plugins authenticate at install (`ON_INSTALL`), others on first use (`ON_FIRST_USE`). Invocation is natural language, or explicit via `@plugin` (ChatGPT) / `$skill` (Codex CLI). Codex Desktop v26.415 shipped with 90+ plugins across communication, PM, CI/CD, databases, security, and design categories.

## 2. Implementation details

### 2.1 Plugin manifest & layout

Entry point is `.codex-plugin/plugin.json`:

```jsonc
{
  "name": "my-plugin",            // stable kebab-case id
  "version": "1.0.0",             // semver; acts as cache key — bumps force reinstall
  "description": "Plugin purpose",
  "skills": "./skills/",          // dir of SKILL.md folders
  "mcpServers": "./.mcp.json",    // optional
  "apps": "./.app.json",          // optional app connectors
  "interface": { }                // display name, icons, brand colors, default prompts
}
```

```text
plugin-name/
├── .codex-plugin/plugin.json   # required manifest
├── skills/<skill-name>/SKILL.md
├── .mcp.json                   # stdio (command/args/env) or HTTP (url/bearer/headers) servers
├── .app.json                   # connector references
└── assets/                     # icons, screenshots
```

### 2.2 Install flow

1. User opens `/plugins` (or the GUI directory)
2. **Policy evaluation** — the plugin's installation policy is checked: `INSTALLED_BY_DEFAULT` | `AVAILABLE` | `NOT_AVAILABLE`
3. Resolved bundle cached to `~/.codex/plugins/cache/<marketplace>/<plugin>/local/`
4. Entry written to `~/.codex/config.toml`:
   ```toml
   [plugins."plugin-name@marketplace-name"]
   enabled = true    # false disables but preserves credentials
   ```
5. On next session start, a `PluginsManager` hands the `LoadedPlugin` set to the skill, MCP, and app managers simultaneously. **No hot reload** — changes need a new session.

Config respects the standard hierarchy: CLI args > env vars > project config > user-global config.

### 2.3 Marketplaces

Three scopes, all the same `marketplace.json` format:

- **OpenAI curated** — built-in directory
- **Repository** — `.agents/plugins/marketplace.json` committed to the repo; supports `INSTALLED_BY_DEFAULT` so teammates auto-receive team plugins on clone
- **Personal** — `~/.agents/plugins/marketplace.json`

Marketplace entries point at plugin sources (local paths or remote) and carry the installation policy. Trust model is thin: "if it's in a marketplace you can see, it's trusted" — curation and policy are the only gates.

### 2.4 Skills

- A skill = directory with `SKILL.md` (frontmatter: `name`, `description` — the description doubles as the routing trigger), optional `scripts/`, `references/`, `assets/`, and `agents/openai.yaml` (UI metadata, invocation policy, tool dependencies).
- **Discovery scopes**, nearest wins: REPO (`.agents/skills` from cwd up to repo root) → USER (`~/.agents/skills`) → ADMIN (`/etc/codex/skills`) → SYSTEM (bundled). Symlinks supported. Note the ADMIN scope — a machine-managed hook orgs can use.
- **Progressive disclosure**: only name/description/path are in context initially, capped at 2% of the context window or 8,000 chars (descriptions abbreviated for large sets); full `SKILL.md` loads only when the skill is chosen.
- Invocation: implicit (model matches prompt to description) or explicit (`$skill` / `@`).
- Management: `$skill-installer` adds curated skills; disable via `[[skills.config]]` in `~/.codex/config.toml`; restart required.

### 2.5 MCP servers

- Declared in `.mcp.json` — stdio (local `command` + `args` + env) or HTTP (remote `url` + bearer/custom headers).
- Tools namespaced as `mcp__<server>__<tool>` to avoid cross-plugin collisions.
- Per-server startup timeout, tool timeout, enable/disable toggles.

### 2.6 Apps (Connectors)

- Referenced via `.app.json`; the actual OAuth grant lives with the user's ChatGPT account ("ChatGPT Apps" connector layer), so Codex Desktop/CLI reuse the platform-managed link — token refresh is automatic, credentials never touch the repo.
- Admin approval can be required to enable a connector in a workspace.
- **Known weak spots** (useful for us): OAuth link state is account-global — revoking/reconnecting a different Slack workspace leaves stale links ([openai/codex#19669](https://github.com/openai/codex/issues/19669)), and there's no support for multiple named accounts per connector ([openai/codex#20500](https://github.com/openai/codex/issues/20500)). Multi-org/multi-account is an unsolved pain point.

### 2.7 Authoring spec details (from developers.openai.com/plugins/build/plugins)

The canonical plugin-authoring doc adds precision beyond the overview pages:

- **Marketplace entry `source` is a typed union**: `local` (path), `url` (git repo + `ref`), `git-subdir` (repo + `path` + `ref`), or `npm` (`package`, optional `version` range and `registry`). NPM installs **never run lifecycle scripts**. Git-backed entries that fail to resolve are *skipped silently* rather than failing the whole marketplace.
- **Policy lives on the marketplace entry**, with two axes: `policy.installation` (`AVAILABLE` | `INSTALLED_BY_DEFAULT` | `NOT_AVAILABLE`) and `policy.authentication` (`ON_INSTALL` | `ON_FIRST_USE`).
- **`.claude-plugin/marketplace.json` is read as a legacy-compat marketplace path**, and hook commands get `CLAUDE_PLUGIN_ROOT`/`CLAUDE_PLUGIN_DATA` env aliases beside `PLUGIN_ROOT`/`PLUGIN_DATA` — Codex is deliberately Claude-plugin-compatible. (Consequence: the marketplace file this repo already ships is consumable by Codex users today.)
- **`.mcp.json` accepts both shapes**: a direct `{ name: { command/args | url } }` map or wrapped under a `mcp_servers` key.
- **Per-tool control exists client-side**: `~/.codex/config.toml` supports `[plugins."name".mcp_servers.<server>]` with `enabled`, `enabled_tools`, `default_tools_approval_mode`, and per-tool `[….tools.<tool>] approval_mode`. So tool-granular policy is expressible in Codex's own config — what's missing is only the org-managed distribution of it (refines the §4 gap table, which credits per-tool exposure entirely to the MintMCP side).
- **Full `interface` field list**: `displayName`, `shortDescription`, `longDescription`, `developerName`, `category`, `capabilities` (`Read`/`Write`), `websiteURL`/`privacyPolicyURL`/`termsOfServiceURL`, `defaultPrompt[]`, `brandColor`, `composerIcon`, `logo`, `screenshots[]`.
- Workspace publishing requires workspace-admin; orgs can disable sharing via `requirements.toml` (`features.plugin_sharing = false`). A built-in `@plugin-creator` skill scaffolds manifests and marketplace entries.

## 3. Enterprise / admin controls (what Codex has today)

- **Default-off**: in Enterprise/Edu workspaces, plugins and their underlying apps are disabled by default.
- **Workspace settings › Plugins**: admins mark each plugin *Available* or *Installed* per eligible role (RBAC scoping). **Workspace settings › Apps** separately governs the underlying connector/app access.
- **JSON policy allowlist** pushed via the admin API is the primary authorization control — a plugin not on the allowlist can't be installed; domain allowlists with allowed HTTP methods constrain network access.
- **Local runtime policy**: orgs ship managed `requirements.toml` files constraining the desktop app, CLI, and IDE extension (permission profiles rather than legacy sandbox modes).
- **Audit**: every plugin invocation logged with actor, timestamp, plugin name, action, parameters (redacted at policy-defined sensitivity), response status — exportable to SIEM; workspace analytics + Compliance API for reporting.
- Rollout guidance: before approving a plugin, confirm source, accountable owner, intended audience, review date; review bundled components and required permissions.

> ⚠️ Source conflict: one third-party guide ([RockB](https://baeseokjae.github.io/posts/openai-codex-plugins-guide-2026/)) describes skills as "JSON-schema function wrappers." The official docs are unambiguous that skills are markdown instruction folders; treat the RockB description of skills as wrong (its enterprise-policy and CLI details cross-check with other sources).

## 4. Gap analysis: Codex model vs. the MintMCP layer we want

What Codex's model gives us for free (worth copying):

- **One installable unit** (plugin) bundling skills + connectors + MCP config — users think in capabilities, not transport
- **Three-scope marketplace** (curated / org / personal) with `INSTALLED_BY_DEFAULT` for org push
- **Progressive disclosure** for skills — scales to large catalogs without context bloat
- **Separation of plugin availability from app (auth) access** — two admin switches, not one

Where Codex stops and MintMCP-style governance begins (the opportunity):

| Concern | Codex today | MintMCP-style target |
| --- | --- | --- |
| Tool granularity | Enable/disable whole plugin or server | Per-tool exposure via virtual bundles per role |
| Credentials | Per-user OAuth links, stored client-side (OS keystore) | Centrally brokered OAuth; pre-configured after SSO; nothing on the client |
| MCP hosting | Runs stdio servers on the user's machine | Gateway-hosted servers; client only speaks to gateway |
| Agent identity | Runs as the human user | Dedicated agent identities w/ M2M auth + own audit trail |
| Multi-account/org | Broken (stale OAuth links, single account per connector) | Org-scoped connections, per-workspace identity |
| Runtime monitoring | Approval prompts + logs | Live rule-based detection/blocking, PII & secret scanning |
| Provisioning | Manual role assignment | SCIM-driven membership |

### Sketch for Superset

**Packaging constraint: this is an org feature — teams-only, paid.** The governance layer (org marketplace, gateway, admin policy plane, agent identities, audit) is gated to team/org plans. Individual users keep today's local conventions (`.agents/skills/`, `.mcp.json`, personal config) for free — the paid tier is what centralizes and governs them, mirroring how both Codex (Enterprise workspace controls) and MintMCP (contact-sales) monetize the admin plane rather than the client experience.

1. **Catalog UX like Codex**: one "Plugins" surface with Apps / MCPs / Skills tabs; org + personal marketplaces; repo-scoped `.agents/plugins/marketplace.json` we already half-align with (`.agents/skills/`, `.mcp.json` conventions in this repo).
2. **Gateway underneath like MintMCP**: every MCP entry in an installed plugin resolves to a Superset-gateway URL, not a local stdio command — the gateway does OAuth brokering, per-role tool filtering (virtual bundles), and tool-call audit logging.
3. **Org policy plane**: admin console with plugin states (`INSTALLED_BY_DEFAULT` / `AVAILABLE` / `NOT_AVAILABLE`) per role, separate app-authorization approvals, and audit export. Skills are low-risk (instructions only) → lighter review lane; MCP/apps → auth'd, gated lane.
4. **Agent identities**: sessions launched by Superset agents get their own credentialed identity at the gateway rather than impersonating the user — fixes the multi-account pain Codex users hit.

## Sources

- [Build plugins — canonical authoring spec](https://developers.openai.com/plugins/build/plugins) (manifest fields, marketplace source types, per-tool config)
- [Plugins — official docs](https://learn.chatgpt.com/docs/plugins) (redirected from developers.openai.com/codex/plugins)
- [Build skills — official docs](https://learn.chatgpt.com/docs/build-skills.md)
- [Codex CLI Plugin System deep-dive — codex.danielvaughan.com](https://codex.danielvaughan.com/2026/03/30/codex-cli-plugin-system/)
- [Enterprise admin rollout guide](https://learn.chatgpt.com/docs/enterprise/admin-setup)
- [Admin controls, security & compliance for plugins and apps — OpenAI Help Center](https://help.openai.com/en/articles/11509118-admin-controls-security-and-compliance-for-plugins-and-apps)
- [Plugin support announcement coverage — alternativeto.net](https://alternativeto.net/news/2026/3/openai-introduces-plugin-support-in-codex-with-app-integrations-skills-and-mcp-servers)
- [Codex Desktop plugins guide — digitalapplied.com](https://www.digitalapplied.com/blog/openai-codex-desktop-computer-use-plugins-guide)
- [90+ enterprise plugin guide — RockB](https://baeseokjae.github.io/posts/openai-codex-plugins-guide-2026/) (skills description unreliable, see §3 note)
- [Stale Slack OAuth issue — openai/codex#19669](https://github.com/openai/codex/issues/19669) · [multi-account request — openai/codex#20500](https://github.com/openai/codex/issues/20500)
