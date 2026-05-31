# Implementation Plan

## Pre-Implementation Gate

- Resolve the phase-one scope question in `prd.md`.
- Run `python3 ./.trellis/scripts/task.py start .trellis/tasks/05-31-model-provider-configuration-center`
  only after the user approves planning or explicitly says to proceed.
- Use the desktop acceptance TDD guide for all user-visible desktop checks.

## Implementation Checklist

1. Define shared provider types.
   - Add protocol enum and provider/model/ref types in a shared package or
     host-service export consumed by desktop renderer.
   - Add helpers for provider/model ref encoding, decoding, and display.

2. Add host-service persistence and router.
   - Add model provider and model tables to host-service schema.
   - Add CRUD procedures for providers and models.
   - Add safe credential write/read contracts with redacted reads.
   - Seed or bridge existing official Anthropic/OpenAI credentials.

3. Refactor Settings > Models.
   - Replace official-provider-only cards with provider-centered UI.
   - Preserve OAuth/API-key compatibility where current code requires it.
   - Add manual model list editing.
   - Add status and compatibility indicators.

4. Refactor Chat model options.
   - Replace `apiTrpcClient.chat.getModels.query()` usage with registry-backed
     provider model options for desktop/v2 Chat.
   - Remove duplicated official-provider auth gates from model pickers.
   - Keep slash-command model lookup working with provider/model refs.
   - Ensure send, retry, edit, and thread restore paths keep the selected model.

5. Add Claude Code workspace model config.
   - Add a workspace model tab or panel.
   - Add selectors for provider, Haiku model, Sonnet model, and Opus model.
   - Add host-service procedure to save mappings and write
     `.claude/settings.local.json`.
   - Write merge helper with unit tests before wiring UI.

6. Add local protocol gateway.
   - Add loopback HTTP server lifecycle with dynamic safe port allocation.
   - Add provider/model resolution from workspace gateway tokens plus
     provider-local model ids, keeping encoded gateway ids only as an
     internal/backward-compatible fallback.
   - Add Anthropic-compatible inbound endpoints needed by Claude Code.
   - Add upstream adapters for Anthropic, OpenAI Chat Completions, and OpenAI
     Responses.
   - Add redacted logging and deterministic error mapping.
   - Add tests with mocked upstream fetch calls.

7. Runtime integration.
   - Extend the host-service model runtime resolver to prepare env from the
     selected registry provider when Chat starts or switches model.
   - Route Claude Code non-Anthropic providers through the local gateway.
   - Route direct Anthropic-compatible providers directly or through the gateway
     based on the saved workspace config.

8. Document Codex/OpenCode adapter contracts.
   - Add notes or code stubs for Codex TOML merge requirements.
   - Add notes or code stubs for OpenCode JSON merge requirements.
   - Do not fake support by writing incorrect Claude env to those agents.

## Tests And Checks

Focused tests:

- `packages/host-service` tests for provider router, redaction, and Claude
  settings merge.
- Renderer tests for provider grouping and model picker disabled states.
- Existing Chat runtime tests for model switching metadata.
- Source tests that old official-provider-only gates do not block custom
  providers.
- Gateway tests for Anthropic inbound to Anthropic/OpenAI Chat/OpenAI Responses
  upstream translation with mocked fetch.
- Gateway tests for credential redaction and unsupported feature errors.

Desktop acceptance:

- Start the local desktop service graph per
  `.trellis/spec/guides/desktop-acceptance-tdd.md`.
- Use `bun run desktop:automation -- ...`.
- Save artifacts under:
  `.trellis/tasks/05-31-model-provider-configuration-center/artifacts/`.

Suggested smoke checkpoints:

- `01-settings-models-provider.png/json`: Settings > Models provider center is
  visible.
- `02-chat-model-picker.png/json`: Chat picker shows custom provider group and
  model.
- `03-workspace-claude-models.png/json`: Workspace model panel saves Claude
  mappings.
- `04-claude-settings-file.json`: sanitized assertion report for the written
  `.claude/settings.local.json`.
- `05-gateway-probe.json`: sanitized local gateway health/model resolution
  report using fake provider data.

Final commands:

- `bun --cwd packages/host-service test`
- `bun --cwd apps/desktop test`
- `bun run lint:fix`
- `bun run lint`
- targeted typecheck for changed packages, or root `bun run typecheck` if the
  change touches shared contracts broadly

## Risky Files

- `apps/desktop/src/renderer/routes/_authenticated/settings/models/...`
- both Chat model picker implementations
- Chat send/retry/edit metadata paths
- `packages/host-service/src/providers/model-providers/...`
- `packages/host-service/src/db/schema.ts`
- host-service migrations generated from schema changes
- workspace sidebar/tab components for the new model config surface

## Rollback Points

- Keep provider registry behind new router methods first.
- Keep existing Anthropic/OpenAI auth reads until the registry-backed UI and
  Chat picker are verified.
- Isolate Claude settings merge helper from UI so it can be tested and reverted
  independently.
