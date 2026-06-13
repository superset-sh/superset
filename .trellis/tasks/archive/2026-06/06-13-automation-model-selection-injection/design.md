# Design

## Architecture

Automation model selection is a cross-layer feature:

1. Cloud database stores the user's selected provider/model reference on the
   Automation row.
2. Renderer reads cloud providers/models and shows a compact selector in the
   create dialog and detail sidebar.
3. Automation dispatch ensures the target host has synced provider credentials
   before asking the host-service to run the Automation.
4. Host-service resolves the selected provider/model from its local encrypted
   provider store, creates automation-local runner configuration inside the
   Automation task directory, and launches the agent with any required env
   overrides.

The host-service owns injection. The renderer and cloud API must never receive
or persist raw provider credentials beyond the existing model-provider sync
payload path.

Model selection is the first concrete Automation context injection path. The
same boundary should later support Skills, CLI tool selections, MCP servers,
attachments, and project context: cloud rows store portable references and
host-service materializes the selected context into the Automation task
directory before each run. Individual runs should keep only lightweight audit
artifacts and a context snapshot manifest, not full copied tool/config
installations.

## Data Model

Add nullable fields to `automations`:

- `modelProviderId`: cloud provider id selected for the Automation.
- `modelId`: provider model id selected for the Automation.
- `modelConfig`: JSON object reserved for runner-specific options such as
  Codex reasoning effort. Initial version can default to `{}`.

Existing Automation rows with null model fields keep current behavior.

DB migration rule: change Drizzle schema only, then generate migration through
`drizzle-kit generate`; do not hand-edit files under `packages/db/drizzle/`.

## Runner Family Resolution

The Automation stores an agent instance id or preset id. Host-service already
resolves this into `ResolvedHostAgentConfig`, including `presetId`. Model
support should be decided from the resolved preset/family, not the raw
Automation string.

Supported first-pass families:

| Family | Superset preset | Injection |
| --- | --- | --- |
| Claude | `claude` | Write only `<automationDir>/.claude/settings.local.json`; set `ANTHROPIC_MODEL`, `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL`, gateway token/base URL env, and Claude safety envs. Never write `~/.claude` or any user-global Claude settings. |
| Codex | `codex` | Write `<automationDir>/.codex/config.toml`; set process `CODEX_HOME=<automationDir>/.codex`; use `model_provider="superset"` and `[model_providers.superset]` with gateway base URL, selected model, responses wire API, and provider bearer token/token path according to what Codex accepts. |
| Gemini | `gemini` | Write `<automationDir>/.gemini/.env`; set process env to point Gemini at automation-local config when supported; also inject `GOOGLE_GEMINI_BASE_URL`, `GEMINI_API_KEY`, and `GEMINI_MODEL` directly as a fallback because the CLI reads env. |
| OpenCode | `opencode` | Write `<automationDir>/.config/opencode/opencode.json`; set `OPENCODE_CONFIG_DIR=<automationDir>/.config/opencode`; define a Superset provider with `options.baseURL`, `options.apiKey`, and selected model routing. |

Unsupported families should not show a selectable model in UI yet and should
run exactly as they do today.

## Gateway Tokens

Workspace model config currently uses `workspaceAgentModelConfigs` to mint a
gateway token. Automation needs the same principle but cannot reuse a workspace
row because runs are not necessarily tied to a workspace.

Create an Automation-specific token/config record in host-service local SQLite
or extend the existing config table with a scope. The preferred low-risk path is
a dedicated local table:

- `automationAgentModelConfigs`: id, automationId, agent, providerId,
  gatewayToken, modelId, createdAt, updatedAt.

The model gateway should accept tokens from both workspace and Automation
config tables. Tokens remain host-local and map to locally encrypted providers.

## Cloud-to-Host Sync

Automation dispatch runs server-side, so it cannot rely on the renderer-only
`syncCloudModelProvidersToHost` helper. Dispatch should fetch the cloud
`modelProvider.syncPayload` equivalent on the API side or add a small internal
helper that returns the same decrypted provider payload for the Automation
owner/org, then relay it to the target host's `modelProviders.syncFromCloud`
before `agents.runAutomation`.

If sync fails or the host rejects the provider payload, fail the Automation run
with a concise failure reason.

## UI

Create a shared Automation model selector component that:

- Reuses the existing model switching Picker interaction and primitives:
  `ModelSelector`, `ModelPicker` / `VirtualizedModelList` patterns,
  `modelOptions` grouping/search/sort helpers, and `ModelProviderIcon`.
- Filters to providers that are enabled, have credentials, and contain enabled
  models.
- Shows a single provider/model selection, not Haiku/Sonnet/Opus slots.
- Uses the selected agent's family to decide whether model selection is
  available.
- Clears the selected model when switching to an unsupported agent family.

Claude-specific execution mapping: Automation exposes one model choice. When
the runner family is Claude, execution should follow the same behavior as the
Code/Workspace Models Tab after selection: write `.claude/settings.local.json`.
Automation expands that one selected model into Anthropic default model plus
Haiku, Sonnet, and Opus all set to the same model. The Code/Workspace Models
Tab can keep its advanced three-slot UI; Automation intentionally presents the
simpler scheduled-run default.

Create dialog placement: alongside Device, Project, Schedule, and Runner. If
space is tight, wrap the left footer controls rather than squeezing buttons off
screen.

Detail sidebar placement: add a `Model` row near `Runner`. Changing either
Runner or Model should persist through `automation.update`.

## Errors

Run-facing errors should be short:

- `Model provider is disabled`
- `Model provider credential is required`
- `Model is not configured for provider`
- `Model selection is not supported for this runner`
- `Failed to sync model providers to target host`

Raw relay errors, SQL dumps, secrets, and stack traces should not appear in the
Automation run result.

## Automation-Local Claude Settings Contract

Claude Code model selection is applied through the Automation task directory,
not through a user-global CLI configuration. For a selected model such as
`gpt-5.5(xhigh)`, host-service must write:

```json
{
	"env": {
		"ANTHROPIC_AUTH_TOKEN": "<host-local gateway token>",
		"ANTHROPIC_BASE_URL": "<host-service>/model-gateway",
		"ANTHROPIC_DEFAULT_HAIKU_MODEL": "gpt-5.5(xhigh)",
		"ANTHROPIC_DEFAULT_SONNET_MODEL": "gpt-5.5(xhigh)",
		"ANTHROPIC_DEFAULT_OPUS_MODEL": "gpt-5.5(xhigh)"
	}
}
```

The actual path is `<automationDir>/.claude/settings.local.json`, where
`<automationDir>` is the stable directory returned for the Automation id, for
example `~/.superset/dev/automations/<automationId>`. Individual executions keep
their audit artifacts as files under `<automationDir>/runs/<runId>.*`. This
mirrors the Workspace Models Tab behavior while avoiding one full working
directory per run.

Future context integrations should follow the same shape:

- automation-scoped materialization under `<automationDir>` for reusable config,
  caches, Skills, CLI wiring, MCP config, and model adapter files.
- run-scoped artifacts under `<automationDir>/runs/<runId>.*` for prompt,
  metadata, stdout/stderr, result, and a small context snapshot.
- no writes to user-global tool config directories and no raw secrets in run
  metadata, prompt text, or logs.

## Trade-Offs

Automation-local config is slightly more work than global config mutation, but it
avoids corrupting a user's normal Claude/Codex/Gemini/OpenCode setup and makes
scheduled Automation runs deterministic.

Supporting only confirmed runner families keeps this shippable without
pretending every CLI has the same configuration semantics.

Reusing the existing model switching Picker keeps the Automation selection
experience consistent with Chat/Code. Referencing the Code Models Tab only for
Claude settings write behavior avoids copying the wrong three-slot sidebar UI
into Automation.
