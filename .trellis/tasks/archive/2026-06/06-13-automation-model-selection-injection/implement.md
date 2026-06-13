# Implementation Plan

## Checklist

1. Update cloud Automation schema and TRPC schemas.
   - Add nullable `modelProviderId`, `modelId`, and `modelConfig`.
   - Validate provider/model belong to the active organization when creating or
     updating an Automation.
   - Keep null model fields valid for existing/default behavior.

2. Add host-service Automation model config storage.
   - Add local SQLite table for Automation gateway token mapping.
   - Extend model gateway token lookup to accept Automation tokens.
   - Reuse existing provider storage and validation helpers where possible.

3. Build host-service runner model adapters.
   - Add a small `automation-model-injection` module.
   - Resolve family from `ResolvedHostAgentConfig.presetId`.
   - Implement Claude run-local settings.
   - Implement Codex/Gemini/OpenCode run-local config/env only where verified
     by tests.
   - Return extra env that is merged into `buildAutomationRunnerEnv`.

4. Sync cloud providers during Automation dispatch.
   - Add server-side provider sync payload helper or query path.
   - Relay `modelProviders.syncFromCloud` to the target host before
     `agents.runAutomation` when an Automation has model selection.
   - Pass model selection payload into `agents.runAutomation`.

5. Add shared renderer Automation model selector.
   - Reuse the existing model switching Picker interaction and virtualized model
     list patterns.
   - Reuse existing model grouping/search/sort and model provider icon
     components.
   - Filter by supported runner family.
   - Add to create dialog and detail sidebar.
   - Clear model selection for unsupported runners.

6. Tests and acceptance.
   - TRPC schema tests for create/update model fields.
   - Host-service unit tests for Claude/Codex/Gemini/OpenCode injection output.
   - Dispatch tests that model provider sync happens before run.
   - Desktop/Computer Use smoke: create Automation, select provider/model,
     update model in detail, run now, verify run directory contains the expected
     automation-local config and no raw secret is visible in prompt/metadata.

## Validation Commands

- `bun test packages/trpc/src/router/automation`
- `bun test packages/host-service/src/trpc/router/agents`
- `bun test packages/host-service/src/model-gateway`
- `bun run typecheck`
- `bun run lint`

## Validation Results

2026-06-14 desktop acceptance used the real Superset dev app, the logged-in
E2E account/workspace, and the real provider gateway configured in Models.

- Created Automation `E2E model injection 20260614-012942`
  (`5cd09244-5662-4a15-9c6a-36a89bf42b18`) with Claude runner and model
  `gpt-5.5`.
- First `Run now` produced run `f2ea4368-347d-4bf0-b129-abc5ad0f8db5`,
  completed successfully, and rendered the "Automation Smoke Report" result
  panel.
- Updated the Automation detail model to `gpt-5.4`; cloud DB confirmed
  `model_id = gpt-5.4` and provider id
  `bc774b5a-6cc6-4c6d-adee-984518672b21`.
- Second `Run now` produced run `99f1d235-1644-4a74-b4b6-c982f4d823f5`.
  DB status was `completed` with no failure/error, started at
  `2026-06-13 17:45:43.462+00` and completed at
  `2026-06-13 17:45:54.876+00`.
- Host settings were written only under
  `~/.superset/dev/automations/5cd09244-5662-4a15-9c6a-36a89bf42b18/.claude/settings.local.json`.
  `ANTHROPIC_MODEL`, `ANTHROPIC_DEFAULT_HAIKU_MODEL`,
  `ANTHROPIC_DEFAULT_SONNET_MODEL`, and
  `ANTHROPIC_DEFAULT_OPUS_MODEL` all resolved to `gpt-5.4` after the second
  run.
- Run metadata existed under
  `~/.superset/dev/automations/5cd09244-5662-4a15-9c6a-36a89bf42b18/runs/99f1d235-1644-4a74-b4b6-c982f4d823f5.metadata.json`,
  recorded the model snapshot and config path, and did not contain the raw
  provider key.
- UI polish acceptance:
  - Detail model row is right-aligned and no longer exposes a clear `X`.
  - Create dialog footer controls wrap without squeezing Cancel/Create.
  - Create success now navigates directly to the created Automation detail.

Screenshot artifacts:

- `artifacts/01-create-dialog-model-selected.png`
- `artifacts/02-created-row-visible.png`
- `artifacts/03-detail-model-selected.png`
- `artifacts/04-run-completed-with-model.png`
- `artifacts/05-before-model-row-polish.png`
- `artifacts/06-model-row-right-aligned.png`
- `artifacts/07-create-dialog-footer-polished.png`

Focused checks passed:

- `bun test packages/host-service/src/trpc/router/agents/agents.test.ts packages/host-service/src/model-providers/automation-model-injection.test.ts packages/host-service/src/model-gateway/gateway.test.ts packages/host-service/src/model-providers/claude-settings.test.ts`
- `bun test packages/trpc/src/router/automation`
- `bun test apps/desktop/src/renderer/routes/_authenticated/_dashboard/automations/utils/agentDisplay/agentDisplay.test.ts apps/desktop/src/renderer/routes/_authenticated/_dashboard/automations/utils/automationListSelection/automationListSelection.test.ts`
- `bun test 'apps/desktop/src/renderer/routes/_authenticated/_dashboard/automations/$automationId/utils/automationRunSelection/automationRunSelection.test.ts'`
- `bun run --cwd packages/trpc typecheck`
- `bun run --cwd packages/host-service typecheck`
- `bun run --cwd apps/desktop typecheck`
- `bun run lint:fix`
- `bun run lint`

## Rollback Points

- Schema fields are nullable, so UI can be disabled without breaking existing
  Automation runs.
- Adapter module should be isolated; if a non-Claude adapter proves unsafe, keep
  that family unsupported in UI and retain Claude plus default behavior.
- Provider sync can be guarded by `modelProviderId && modelId`; no selected
  model means no new sync path.

## Notes

- Do not store provider secrets on Automation rows.
- Do not modify global `~/.claude`, `~/.codex`, `~/.gemini`, or
  `~/.config/opencode` for Automation runs.
- Claude model injection must write the selected model and gateway env only to
  `<automation task dir>/.claude/settings.local.json`.
- Do not hand-edit generated Drizzle migrations.
