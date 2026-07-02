# Vertex AI provider for `getSmallModel`

**Date:** 2026-06-08
**Status:** Approved (design)
**Scope:** Minimal — engine only. No new settings UI, no new tRPC router.

## Problem

Desktop v2 workspaces fall back to random two-word branch names (e.g. `roan-modem`)
instead of AI-generated names relevant to the task prompt. Root cause: workspace
naming calls `getSmallModel()`
(`packages/chat/src/server/shared/small-model/get-small-model.ts`), which resolves a
small LLM from one of: `ANTHROPIC_API_KEY` env → mastracode Anthropic key → mastracode
Anthropic OAuth → `OPENAI_API_KEY` env → mastracode OpenAI key. It returns `null` when
none are present, logging `[get-small-model] no credentials found — naming will fall
back`.

Users on Google Vertex AI for Claude (`CLAUDE_CODE_USE_VERTEX=1`, ADC via
`~/.config/gcloud/application_default_credentials.json`, no Anthropic API key) hit the
`null` path every time. `getSmallModel` has no Vertex branch, and mastracode 0.18.1 has
zero Vertex support. So naming can never succeed for these users today.

## Goal

Let `getSmallModel` produce a working small model from Google Vertex AI (Claude on
Vertex) when the user is configured for Vertex, with no Anthropic/OpenAI key required.
Fixes all five `getSmallModel` consumers at once (desktop `ai-name`, desktop
`ai-branch-name`, host-service `ai-branch-name`, host-service `ai-workspace-names`, and
any future caller) since they share the one function.

## Non-goals

- No settings-page UI for Vertex (configure via existing env / Advanced "Additional env
  vars" field).
- No Vertex support for the in-app chat agent (that runs through mastracode, which has no
  Vertex provider — separate, larger effort).
- No new persistence store or tRPC procedures.

## Approach

Approach A (minimal engine). Add a flag-gated Vertex resolver to `getSmallModel`,
reusing the existing env-config persistence for configuration input.

### Components

**1. Dependency**

Add `@ai-sdk/google-vertex` (pin `3.0.127`, already resolved transitively in `bun.lock`)
to `packages/chat/package.json` dependencies. Run `bun install`.

**2. `vertex-config.ts` — new file, co-located in `small-model/`**

Exports `resolveVertexConfig(): { project: string; location: string } | null`.
Returns the config object only when Vertex is fully enabled; returns `null` otherwise
(flag off, or project missing). Single contract — no `enabled` field.

- Reads `CLAUDE_CODE_USE_VERTEX`, `ANTHROPIC_VERTEX_PROJECT_ID`, `CLOUD_ML_REGION` from
  `process.env`, falling back per-key to the persisted
  `~/.superset/chat-anthropic-env.json` blob (parsed via the existing env-text parser)
  when a key is absent from `process.env`.
  - Rationale for the file fallback: the Advanced "Additional env vars" settings field
    persists to that file, but the file is only applied to `process.env` on certain
    runtime paths (e.g. `runtime/chat` `prepareRuntimeEnv`), **not** the
    workspace-creation/naming path. Reading the file directly makes the existing settings
    field actually drive naming regardless of process or timing.
  - Path resolved the same way as the existing readers: `SUPERSET_HOME_DIR` (trimmed) or
    `~/.superset`, then `chat-anthropic-env.json`.
- Enabled when `CLAUDE_CODE_USE_VERTEX === "1"` and `project.length > 0`; only then is
  the object returned. Otherwise `null`.
- `location = CLOUD_ML_REGION ?? "global"`.

**3. `get-small-model.ts` — edit**

- New constant `VERTEX_SMALL_MODEL_ID = "claude-haiku-4-5@20251001"` (Vertex uses the
  `@`-date model id form, vs the Anthropic API `-date` form).
- New `resolveVertex()`:
  - Call `resolveVertexConfig()`. If `null`, return `null`.
  - Else `return createVertexAnthropic({ project, location })(VERTEX_SMALL_MODEL_ID)`.
    ADC is auto-detected by `google-auth-library`; no API key passed.
  - Wrap in try/catch: on any throw (bad ADC, network, init), `console.warn` and return
    `null` so naming falls through to the existing resolvers instead of dying.
- Precedence: call `resolveVertex()` **first** in `getSmallModel`, before
  `resolveAnthropic()`. Because it only returns non-null when `CLAUDE_CODE_USE_VERTEX===1`
  and a project is set, behavior with the flag unset is byte-for-byte identical to today.
  Opt-in flag wins, matching claude-code semantics.

### Data flow

```
getSmallModel()
  → resolveVertex()            // flag-gated; null unless CLAUDE_CODE_USE_VERTEX=1 + project
      → createVertexAnthropic({project, location})(VERTEX_SMALL_MODEL_ID)
  → resolveAnthropic()         // apiKey | oauth  (unchanged)
  → resolveOpenAIApiKey()      // unchanged
  → null  + "no credentials found" warning  (unchanged)
```

### Error handling

- `resolveVertex()` try/catch → warn + fall through (a misconfigured Vertex must not
  break naming entirely).
- Existing 5s caller timeout (`GENERATE_TIMEOUT_MS` in `ai-workspace-names.ts`) unchanged.
- Keep the final `no credentials found — naming will fall back` warning.

### Testing

- `vertex-config.test.ts`:
  - env value used when present.
  - file-blob fallback used when env key absent (mock fs read of `chat-anthropic-env.json`).
  - env overrides file when both present.
  - `enabled=false` when `CLAUDE_CODE_USE_VERTEX !== "1"`.
  - `enabled=false` when project missing even if flag set.
  - `location` defaults to `"global"` when `CLOUD_ML_REGION` unset.
- `get-small-model.test.ts`:
  - returns a Vertex model when enabled (mock `createVertexAnthropic`).
  - flag-off path unchanged (Vertex skipped, existing resolution order intact).

## Risks / to verify during planning

1. **Provider-version compatibility.** `@ai-sdk/google-vertex@3.0.127` bundles
   `@ai-sdk/anthropic@2.0.74` / `@ai-sdk/provider@2.0.1`, while `packages/chat` uses
   `@ai-sdk/anthropic@3.0.64`. Confirm the object returned by `createVertexAnthropic(...)`
   satisfies the Mastra `LanguageModel` (provider V2 `LanguageModelV2`) interface the
   small-model path expects. If incompatible, align versions or wrap the model.
2. **ADC reachability.** Relies on
   `~/.config/gcloud/application_default_credentials.json` being readable by whichever
   process runs naming (host-service child for v2; Electron main for some desktop paths).
   `HOME` is set in both, so default ADC discovery should work; verify.
3. **Model availability.** Confirm `claude-haiku-4-5@20251001` is enabled in the target
   Vertex project/region (`consolo-dev-vertex-wsky`, region `us`/`global`).
4. **Config-source decision (recorded).** User chose env-only as the config source; the
   file fallback is an additive robustness measure that keeps the existing settings field
   functional for naming, not a new config surface.
