# Agent model catalog

`packages/shared/src/agent-models.ts` owns the curated launch models used by
agent settings, workspace creation, and host-side CLI validation.
`SUPERSET_CHAT_MODELS` in the same file supplies the cloud chat model list.
Model names are provider identifiers and are not translated.

## Verification: September 26, 2026

| Agent | Result | Evidence |
| --- | --- | --- |
| Claude | Opus 5.5, Fable 5.1, and Sonnet 5 were already present | [Anthropic model IDs](https://platform.claude.com/docs/en/models/overview) |
| Codex | GPT-6 Astra/Sol/Luna and their effort levels were already current | Live `codex app-server` → `model/list`; [OpenAI models](https://developers.openai.com/api/docs/models) |
| Cursor | Added Opus 5.5, Grok 4.7, and Muse Spark 1.3 with their effort variants | Live `cursor-agent --list-models` |
| Copilot | Added current Claude, GPT-6, GPT-5.6, Gemini, Grok, and Kimi choices, plus Auto | [GitHub supported models](https://docs.github.com/en/copilot/reference/ai-models/supported-models), `copilot --help`, and the `github-copilot` catalog in [models.dev](https://models.dev/api.json) |
| Gemini | Added Gemini 3.8 Flash and Gemini 3.1 Pro Preview | [Google model guidance](https://ai.google.dev/gemini-api/docs/latest-model), [CLI model selection](https://geminicli.com/docs/cli/model/), and the installed CLI's bundled 3.1 Pro identifier |
| OpenCode | Added Opus 5.5, Sonnet 5/4.6, and Gemini 3.8 Flash; GPT-6 already present | `opencode models` for Google/OpenAI; [models.dev](https://models.dev/api.json) for Anthropic |
| OMP | Added Opus 5.5 and Sonnet 5; GPT-6 already present | Published `@oh-my-pi/pi-catalog` 18.3.4 `src/models.json` |
| Vibe | Existing Medium 3.5 and Devstral Small choices remain current | [Mistral Vibe configuration](https://docs.mistral.ai/vibe/code/cli/configuration) |
| Polygraph | Harness choices remain Claude, Codex, and OpenCode | This picker chooses a harness, not an underlying model |
| Superset chat | Added Sonnet 5; Opus 5.5 and GPT-6 already present | Anthropic model IDs above |

Agents without a curated model picker continue to use their own configured
model selection. This audit does not add launch flags to those agents.

Copilot uses dotted Claude release IDs (`claude-opus-5.5`,
`claude-fable-5.1`). Anthropic uses dashed IDs (`claude-opus-5-5`,
`claude-fable-5-1`). Cursor encodes effort in the model ID: Opus 5.5's
base picker choice is `claude-opus-5-5-medium`. Its live catalog did not expose
GPT-6, so GPT-6 was not added to Cursor.

Validation covers catalog discovery, exact launch arguments, supported effort
variants, host validation, shared-package types, and strict locale compilation.
It does not establish successful inference on every provider or account.
Available models still depend on account access, provider configuration, and
installed CLI version. Existing saved choices and default model behavior are
preserved.

## Live smoke tests: September 27, 2026

Checked 33 agent/model configurations in empty temporary directories using:
`Reply with exactly MODEL_SMOKE_OK. Do not use tools, read files, or change anything.`
Each subprocess had a 75-second timeout. No project files were supplied.

| Agent | Models checked | Live result |
| --- | --- | --- |
| Claude | Opus 5.5, Sonnet 5 | Both returned `MODEL_SMOKE_OK`; successful result metadata confirmed the requested model |
| Codex | GPT-6 Astra, Sol, Luna | All returned `MODEL_SMOKE_OK` and completed their turn successfully |
| Copilot | All 17 added choices, including Auto | All rejected by account policy before inference: `Access denied by policy settings` |
| Cursor | Opus 5.5, Grok 4.7, Muse Spark 1.3 | All rejected: `Named models unavailable`; this account's free plan only permits Auto |
| Gemini | Gemini 3.8 Flash, Gemini 3.1 Pro Preview | Both rejected with `IneligibleTierError` / `UNSUPPORTED_CLIENT`; retried with `--skip-trust` to eliminate the temporary-directory trust error |
| OpenCode | Opus 5.5, Sonnet 5, Sonnet 4.6 | All failed with a generic server error; a diagnostic retry of Opus 5.5 exposed `ProviderModelNotFoundError` for `anthropic/claude-opus-5-5`. Anthropic OAuth credentials exist, but Anthropic is absent from this installation's active `opencode models` listing |
| OpenCode | Gemini 3.8 Flash | Rejected with `ProviderAuthError`: Google Generative AI API key missing |
| OMP | Opus 5.5, Sonnet 5 | Not run: `omp` is not installed on this machine |

Five configurations passed inference; 26 failed before a successful response;
two could not run. Account policy, subscriptions, credentials, and installed
agents were not changed. Sonnet 5 passed through Claude's CLI; this does not
constitute an end-to-end Superset chat UI test. No model is marked working
solely because it appears in a provider catalog or passes a unit test.
