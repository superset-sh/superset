# Model Provider Configuration Center Design

## Architecture

Use a provider registry as the single product concept, with adapter-specific
runtime writers around it.

The registry should be owned by the host-service layer, not by renderer-only
state, because terminal agents, worktree dotfiles, and chat runtimes are local
machine concerns. The desktop renderer should reach it through existing
host-service tRPC client patterns. This also keeps the future remote-host story
straight: the workspace's host applies settings to that workspace's filesystem.

Proposed host-service concepts:

- `ModelProvider`
  - `id`
  - `name`
  - `protocol`: `anthropic`, `openai-chat`, `openai-responses`
  - `baseUrl`
  - `enabled`
  - `credentialRef` or encrypted credential payload
  - `createdAt`, `updatedAt`
- `ModelProviderModel`
  - `id`
  - `providerId`
  - `modelId`
  - `displayName`
  - `enabled`
  - optional capability JSON
- `ProviderModelRef`
  - stable app-facing reference for selections
  - should include provider id and provider-local model id so duplicate model
    names across providers are unambiguous
- `WorkspaceAgentModelConfig`
  - `workspaceId`
  - `agent`: initially `claude`
  - selected provider/model refs by agent-specific slot
  - for Claude Code: `haiku`, `sonnet`, `opus`

The existing `ModelProviderRuntimeResolver` in host-service should be extended
or wrapped to read the registry. It currently prepares process env from local or
cloud credentials but does not expose CRUD, model lists, or per-workspace agent
mappings.

## Data Flow

Settings > Models:

1. Renderer loads providers from host-service model provider router.
2. User creates/edits a provider and its model list.
3. Credentials are accepted on write, redacted on read.
4. The provider list becomes the source for Chat and agent model selectors.

Chat:

1. Chat UI requests enabled provider models.
2. Model picker groups models by provider display name.
3. Selection stores/sends a stable provider/model ref.
4. Chat runtime resolves the ref into the provider protocol, base URL,
   credential, and model id.
5. Runtime switches model with the correct downstream model id and provider
   runtime env.

Claude Code workspace config:

1. Workspace model tab loads enabled provider models.
2. User selects one provider and model mappings for Haiku/Sonnet/Opus.
3. Save resolves the selected provider credential/base URL.
4. Host-service writes `<worktree>/.claude/settings.local.json`.
5. The JSON merge updates only Superset-managed env keys and preserves unrelated
   user settings.

## Protocol Strategy

There are two separate problems:

- Direct provider use for Superset Chat.
- Making terminal agents consume providers through their native config formats.

Claude Code can directly consume Anthropic-compatible providers through
`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, and default model env vars. OpenAI
Chat or OpenAI Responses providers cannot be safely written into Claude Code as
direct env without an Anthropic-compatible proxy/gateway.

This task will implement that gateway rather than deferring it.

Gateway shape:

- Local HTTP server owned by the desktop/host-service runtime.
- Binds to loopback only.
- Exposes an Anthropic-compatible inbound surface for Claude Code.
- Resolves a request model to provider id, provider protocol, upstream model id,
  base URL, and credential. Workspace-scoped Claude Code requests should use the
  gateway token plus user-visible provider-local model id; encoded gateway model
  ids are accepted only as an internal/backward-compatible fallback.
- Routes Anthropic providers directly or with light header/base URL adaptation.
- Translates Anthropic messages requests to OpenAI Chat Completions upstreams.
- Translates Anthropic messages requests to OpenAI Responses upstreams.
- Redacts credentials and upstream request headers from logs/errors.
- Has explicit unsupported-feature responses for features that cannot be safely
  translated yet.

Phasing inside the task:

- Build the registry and gateway contracts first.
- Wire Chat to the registry.
- Wire Claude Code to the gateway for non-Anthropic providers and direct
  Anthropic-compatible providers where possible.
- Keep Codex/OpenCode write adapters documented unless time allows safe
  implementation.

The gateway must be small and testable. Do not port the fork's daemon wholesale;
reuse the useful merge and routing ideas, but avoid fixed-port/global-state bugs.

## Agent Adapter Contracts

Claude Code:

- Target file: `<worktree>/.claude/settings.local.json`.
- Managed env keys:
  - `ANTHROPIC_AUTH_TOKEN`
  - `ANTHROPIC_BASE_URL`
  - `API_TIMEOUT_MS`
  - `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`
  - `ANTHROPIC_DEFAULT_HAIKU_MODEL`
  - `ANTHROPIC_DEFAULT_SONNET_MODEL`
  - `ANTHROPIC_DEFAULT_OPUS_MODEL`
  - `CLAUDE_CODE_DISABLE_1M_CONTEXT`
- Preserve all unrelated settings.
- Redact token in UI and logs.
- For non-Anthropic upstream providers, use the local gateway base URL and a
  workspace gateway token rather than writing the upstream provider token
  directly into worktree config. Default model env vars should contain the
  provider-local model id the user selected, not an internal encoded routing id.

Codex:

- Treat as a separate adapter. Current official OpenAI Codex config references
  `config.toml`, `model_provider`, and `model_providers`.
- Do not write Claude-style env into Codex config as the primary model switch.
- Later implementation should merge TOML, preserve unrelated keys, and support
  provider entries plus selected model.

OpenCode:

- Treat as a separate adapter. Current OpenCode config centers on
  `opencode.json` provider/model configuration.
- Later implementation should merge JSON and preserve unrelated keys.

## UI Boundaries

Settings > Models should feel like a provider table/detail view:

- Provider list on the left or top.
- Detail editor for protocol, base URL, credential, and models.
- Model list with add/remove/enable controls.
- Clear compatibility labels for Chat and terminal agents.

Workspace model config should be close to worktree operations, likely as a
right-sidebar tab next to Changes/Files/Review or as the existing workspace
side panel's Model tab. It should not live only in global settings because the
write target is the current worktree.

## Compatibility And Migration

Existing official Anthropic/OpenAI auth paths must remain usable. The safest
first step is to expose bridge providers for existing credentials before
removing old UI code:

- `anthropic-official` from existing Anthropic OAuth/API key/env config.
- `openai-official` from existing OpenAI OAuth/API key.

Once the registry is stable, the legacy cards can be removed or collapsed into
provider entries.

No generated Drizzle migration files should be hand-edited. Schema changes must
be made in source schema files and generated through the repo's normal Drizzle
workflow.

## Security

- Credentials should be encrypted or stored via the existing desktop/host secret
  mechanism where available.
- Read APIs return only credential presence and redacted display.
- Error messages must not include request headers, tokens, or full provider env.
- Desktop automation screenshots must use fake provider data.

## Validation

Lower-level tests:

- Provider/model ref encoding and decoding.
- Provider aggregation and filtering.
- Credential redaction.
- Claude settings merge behavior.
- Chat picker grouping without official provider gates.
- Runtime resolver behavior for direct Anthropic-compatible providers.

Desktop acceptance:

- Open Settings > Models and create a fake provider/model.
- Open Chat model picker and confirm provider grouping.
- Open workspace model config, save Claude mappings, and assert
  `.claude/settings.local.json` was written in the disposable worktree.
- Capture screenshots and JSON reports under this task's `artifacts/` folder.

## Sources Consulted

- Cherry Studio provider settings reference: `/tmp/cherry-studio-ref`.
- TwitterIsGood/superset model proxy reference: `/tmp/twitter-superset-ref`.
- Claude Code docs: `https://code.claude.com/docs/en/settings` and
  `https://code.claude.com/docs/en/model-config`.
- OpenAI Codex config reference:
  `https://developers.openai.com/codex/config-reference/`.
- OpenCode config docs: `https://opencode.ai/docs/config`.
