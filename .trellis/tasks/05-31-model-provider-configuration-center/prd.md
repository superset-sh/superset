# Model provider configuration center

## Goal

Refactor app-wide model configuration into a provider-centered "model service"
configuration center. Users should configure many providers once, attach model lists
to each provider, then choose provider-owned models from Chat and terminal agent
workspace configuration surfaces.

The first user-visible surfaces are:

- Settings > Models: provider/service management inspired by Cherry Studio's
  provider-first model service settings.
- Chat model picker: grouped by configured provider and its enabled models,
  instead of hardcoded official Anthropic/OpenAI assumptions.
- Workspace/terminal model configuration: allow the current worktree to apply
  provider/model choices to agent-specific config, starting with Claude Code
  `.claude/settings.local.json`.
- Local protocol gateway: allow non-official and non-Anthropic providers to be
  consumed by agent surfaces that expect Anthropic-compatible behavior.

The long-term product shape is a local "large model gateway" for Superset:
provider definitions, secrets, model lists, protocol adapters, and per-workspace
agent mappings live behind one configuration contract.

## User Value

- Users who buy many model providers can manage them in one place.
- Chat selection becomes provider-aware and does not require official OpenAI or
  Anthropic accounts only.
- Worktree terminal agents can be switched per workspace without hand-editing
  dotfiles.
- Future agents such as Codex, OpenCode, Gemini, and MastraCode can share the
  same provider/model registry while keeping their own config write format.

## Confirmed Facts

- The current Settings > Models UI only exposes official Anthropic and OpenAI
  auth plus an Anthropic advanced env form.
- The current Chat model pickers group models by provider label, but provider
  auth and disabled states are still hardcoded around official Anthropic/OpenAI.
- There are two near-duplicate Chat model picker implementations: shared Chat
  and v2 workspace Chat.
- Chat sends only `model_id` / `metadata.model` into runtime calls, and the
  backend switches the Mastra runtime with `runtime.harness.switchModel`.
- `packages/host-service` already contains a `ModelProviderRuntimeResolver`,
  `CloudModelProvider`, and `LocalModelProvider`, but this is runtime env
  preparation, not a user-managed provider registry.
- Host terminal agent configs already support persisted `env` on
  `host_agent_configs`, but the settings UI does not expose a provider/model
  mapping workflow.
- Claude Code supports project/worktree-local settings files under `.claude/`;
  user-provided target behavior is to merge `env` into
  `.claude/settings.local.json`.
- The TwitterIsGood/superset fork includes a useful but incomplete reference
  implementation for model providers, an Anthropic-compatible local proxy, and
  `.claude/settings.local.json` merge helpers.
- Cherry Studio is useful as a product reference for provider-first settings and
  provider-owned model lists, but should not be ported directly.
- Official/current agent config models differ:
  - Claude Code: `.claude/settings.local.json` can hold project-local `env`.
  - Codex CLI: config is centered around `config.toml`, `model_provider`, and
    `model_providers` rather than Claude-style env-only switching.
  - OpenCode: config is centered around `opencode.json` provider/model fields.

## Requirements

- Provide a provider registry with at least these protocol types:
  - Anthropic-compatible API
  - OpenAI Chat Completions-compatible API
  - OpenAI Responses-compatible API
- Provide a local protocol gateway/proxy that can translate configured provider
  protocols into the protocol required by the caller.
- Claude Code must be able to use configured providers even when the upstream
  provider is OpenAI Chat or OpenAI Responses-compatible, by routing through the
  Anthropic-compatible local gateway.
- A provider has a stable id, display name, protocol, base URL, enabled state,
  credential metadata, and one or more models.
- A model belongs to exactly one provider and has a provider-local model id,
  display name, enabled state, and optional capabilities metadata.
- Secrets must not be logged, rendered in plain text after save, or written into
  Trellis artifacts.
- Existing official Anthropic/OpenAI auth paths must either be migrated into or
  bridged through the provider registry so the app does not regress existing
  users.
- Chat model options must be derived from the provider registry and grouped by
  provider in the picker.
- Chat model selection must persist and send an unambiguous provider/model
  reference to the runtime, not only a bare model string when ambiguity exists.
- The v2 workspace Chat picker and the shared Chat picker must not diverge
  further; reusable model-picker logic should be shared or one implementation
  should be eliminated.
- Workspace model configuration must include a Claude Code mapping for Haiku,
  Sonnet, and Opus aliases and write the selected provider/model values into
  the current worktree's `.claude/settings.local.json`.
- The Claude Code writer must merge JSON safely:
  - preserve unrelated top-level settings
  - preserve unrelated `env` keys
  - update only Superset-managed model/env keys
  - create `.claude/` when missing
  - handle missing, invalid, or non-object JSON with a deterministic policy
- Agent-specific config adapters must be explicit. Claude Code, Codex, and
  OpenCode do not share the same config file contract.
- The UI must show when a provider is routed directly versus through the local
  gateway.
- Desktop acceptance coverage must be planned and executed for the real app
  surfaces affected by this feature.

## Acceptance Criteria

- [ ] Settings > Models displays a provider-centered model service screen rather
      than only official Anthropic/OpenAI cards.
- [ ] Users can create, edit, enable/disable, and delete a custom provider with
      protocol, base URL, credential, and model list fields.
- [ ] Provider credentials are redacted after save and are never printed in logs,
      screenshots, or task notes.
- [ ] Chat model picker displays configured providers and their enabled models,
      with no official-provider-only auth gate for custom providers.
- [ ] Selecting a Chat model sends a stable provider/model reference through the
      chat send/retry/edit paths and preserves the chosen model for the thread.
- [ ] Existing Anthropic/OpenAI users still see usable defaults or migrated
      provider entries after the change.
- [ ] The workspace UI contains an agent model configuration surface for Claude
      Code with Haiku/Sonnet/Opus selectors.
- [ ] Saving Claude Code mappings writes or updates
      `.claude/settings.local.json` in the selected worktree with:
      - `ANTHROPIC_AUTH_TOKEN`
      - `ANTHROPIC_BASE_URL`
      - `API_TIMEOUT_MS`
      - `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`
      - `ANTHROPIC_DEFAULT_HAIKU_MODEL`
      - `ANTHROPIC_DEFAULT_SONNET_MODEL`
      - `ANTHROPIC_DEFAULT_OPUS_MODEL`
      - `CLAUDE_CODE_DISABLE_1M_CONTEXT` when configured
- [ ] For Claude Code, OpenAI Chat and OpenAI Responses providers write
      `ANTHROPIC_BASE_URL` to the local gateway URL and write user-visible
      provider-local model ids to the default model env vars. The gateway token
      binds those model ids to the selected provider so Claude Code can call
      non-Anthropic upstream providers without exposing internal routing ids in
      `.claude/settings.local.json`.
- [ ] The local gateway supports at least Anthropic-compatible inbound requests
      for Claude Code and routes to Anthropic, OpenAI Chat, and OpenAI Responses
      upstream providers.
- [ ] The gateway has deterministic tests for request translation, streaming or
      non-streaming response translation, error redaction, and unsupported
      feature handling.
- [ ] The writer preserves unrelated `.claude/settings.local.json` keys and has
      unit tests for missing file, invalid JSON, non-object JSON, existing env,
      and unrelated env preservation.
- [ ] The implementation records how Codex and OpenCode should be supported,
      even if full Codex/OpenCode writes are phased after Claude Code.
- [ ] Desktop Automation CLI smoke covers Settings > Models, Chat picker
      provider grouping, and Claude Code worktree settings write.
- [ ] Focused tests and type checks pass for the changed packages.

## Out of Scope

- Cloud synchronization of provider secrets across machines.
- Provider marketplace/discovery beyond manual model entry or lightweight model
  list fetch.
- Automatic live validation against real paid provider APIs in CI.
- Changing the app account/login system.
- Removing existing agent configuration features unrelated to model selection.

## Scope Decision

Decision: implement the local protocol gateway in this task. Users should choose
the provider protocol once in Settings > Models, then Superset adapts that
provider for Chat and terminal agents. Claude Code should be able to use
non-official OpenAI Chat/OpenAI Responses-compatible providers through the local
Anthropic-compatible gateway.

Implementation note: real user provider credentials and example tokens must not
be written into repository files, Trellis artifacts, logs, or screenshots. Tests
and desktop automation use fake provider data.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
