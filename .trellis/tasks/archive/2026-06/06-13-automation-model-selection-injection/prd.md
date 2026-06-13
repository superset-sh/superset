# Automation model selection and injection

## Goal

Automation should support choosing the model used by its runner, both when a
new automation is created and later from the automation detail panel. The
selected model must affect the real agent process, not only the UI label.

For Claude-style runners, choosing one model should select the model provider
and set all three Claude Code model tiers to that model:

- `ANTHROPIC_DEFAULT_HAIKU_MODEL`
- `ANTHROPIC_DEFAULT_SONNET_MODEL`
- `ANTHROPIC_DEFAULT_OPUS_MODEL`

The injection should use the existing model provider center and host-service
gateway path instead of storing raw provider credentials on the automation.

## Requirements

- Add model/provider selection to the Automation creation flow.
- Add model/provider switching to the Automation detail sidebar/panel.
- Persist the selected provider/model on the Automation so scheduled runs and
  manual `Run now` use the same choice across devices.
- Use existing cloud `modelProviders` / `modelProviderModels` as the source of
  selectable providers and models.
- Support all Automation runner families that both Superset and cc-switch have
  clear configuration semantics for in this iteration: Claude, Codex, Gemini,
  and OpenCode.
- For Automation runner families without a safe cc-switch-backed mapping yet,
  keep the existing user/default CLI configuration and do not show a model
  selector yet.
- Before an Automation run starts on a host, ensure cloud model providers are
  synced into that host's local encrypted provider store.
- For Claude runners, write an automation-local Claude settings file under the
  Automation task directory so the chosen provider/model is applied to the actual
  process. The file must live under
  `~/.superset[/dev]/automations/<automationId>/.claude/settings.local.json`
  or an explicit `SUPERSET_AUTOMATION_RUNS_DIR` override, never under the
  user's global `~/.claude` directory.
- For non-Claude supported runners, use a runner-specific adapter that maps the
  selected provider/model into that runner's expected run-local configuration or
  environment without mutating the user's global CLI configuration.
- Do not expose provider secrets in Automation rows, renderer state, run
  history, logs, generated prompt text, or run metadata. Claude runners should
  receive only a host-local Superset gateway token in the run-local Claude
  settings `env`.
- If no model is configured, existing Automation behavior should keep working.
- If a configured provider/model is unavailable, disabled, missing credentials,
  or cannot be synced to the selected host, the run should fail with a concise
  run-facing error.

## Confirmed Facts

- Cloud provider config already exists in `modelProviders` and
  `modelProviderModels`.
- Host-service stores synced providers locally and encrypts credentials.
- Workspace Models Tab already supports provider + Haiku/Sonnet/Opus selection
  and writes `.claude/settings.local.json` through host-service.
- Existing Chat/Workspace model switching picker is the UI reference for model
  selection: provider/family grouping, search, typo handling, sorting, icons,
  and virtualized list behavior.
- Terminal/Workspace Models Tab is the Claude Code execution reference: after
  model selection, the actual behavior is writing `.claude/settings.local.json`
  with the selected model env.
- Automation currently stores `agent`, but no model/provider fields.
- Automation runner should execute in a stable task-level directory such as
  `~/.superset/.../automations/<automationId>` and receives env through
  host-service `agents.runAutomation`. Per-run artifacts should be lightweight
  files under `runs/<runId>.*`, not one full working directory per run.
- Existing Workspace Claude config is workspace-scoped, so Automation needs a
  run/automation-specific injection path rather than blindly reusing a workspace
  row.
- cc-switch supports model switching for Claude Code, Claude Desktop, Codex,
  Gemini CLI, OpenCode, OpenClaw, and Hermes Agent. Superset's built-in
  Automation runner choices currently include Claude, Codex, Gemini, OpenCode,
  and several other runners that do not have a confirmed safe model mapping in
  this repo yet.
- cc-switch maps Claude to Anthropic env/settings, Codex to `config.toml`,
  Gemini to `.gemini/.env`, and OpenCode to `opencode.json` provider config.

## Acceptance Criteria

- [ ] New Automation dialog can select a provider/model from configured model
      providers.
- [ ] Automation detail can show and change the selected provider/model after
      creation.
- [ ] Automation model selection uses the same modal/picker interaction,
      provider grouping, searching, sorting, and icon behavior as the existing
      model switching picker.
- [ ] The model selector appears only for supported runner families and is
      hidden/disabled for unsupported families that should keep user defaults.
- [ ] Selecting one model for a Claude runner sets Anthropic model plus Haiku,
      Sonnet, and Opus to that model at execution time by writing only the
      Automation task directory's `.claude/settings.local.json`.
- [ ] Selecting one model for supported Codex, Gemini, and OpenCode runners
      produces the corresponding run-local runner configuration at execution
      time.
- [ ] Manual `Run now` uses the selected model and writes real run-local Claude
      or runner-specific settings before launching the agent.
- [ ] Scheduled runs use the same selected model without extra user action.
- [ ] Existing automations without a selected model continue to run with the
      current default agent behavior.
- [ ] Disabled/missing provider, missing credential, or missing model produces a
      clear failed Automation run instead of a raw relay/stack error.
- [ ] Unit tests cover model selection validation and Claude env/settings
      generation.
- [ ] Desktop acceptance covers creating/updating an automation model selection
      and running it against a real provider/host.

## Open Questions

- None blocking. Scope is cc-switch-backed runner families that Superset can
  launch safely today; unsupported families keep user defaults for now.

## Out of Scope

- Global CLI provider switching outside Automation runs.
- Model selection for Amp, Mastracode, Pi, Copilot, Cursor Agent, Droid, or
  other runners until we have a safe adapter contract.
- Multi-model tier editing in Automation. The Automation UX intentionally
  chooses one model and maps it to the runner's default model slots.
- Storing provider secrets on Automation rows.
