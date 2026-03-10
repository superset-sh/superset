# OAuth Integration Plan

The first pass landed the auth-source cleanup and one-off model fallback. The remaining work should not continue as isolated fixes. The next step is a canonical provider capability/status layer.

## Problem

We currently discover provider health ad hoc in multiple places:

- chat auth status only knows `authenticated`, `method`, `source`
- one-off prompt fallback (`call-small-model.ts`) infers failures from raw runtime errors
- workspace naming converts those raw failures into toast copy
- settings maps low-level auth status to `Active` / `Expired` without feature awareness

That creates three classes of bug:

- misleading status: credential exists, but token is expired or missing scopes
- duplicated logic: each feature interprets provider failures differently
- noisy UX: raw provider errors leak into logs and toasts without normalization

## Canonical Solve

Introduce a shared provider capability/status model that separates:

1. credential presence
2. credential health
3. feature-level capability

Each provider should resolve to a normalized status object like:

- `connectionState`: `connected | disconnected | needs_attention`
- `authMethod`: `oauth | api_key | env | null`
- `source`: `managed | external | null`
- `issues`: structured issue codes, not raw strings
- `capabilities`: feature flags per use case
- `userMessage`: short UI-safe explanation
- `remediation`: optional next action like `reconnect`, `check_permissions`, `add_api_key`

## Canonical Issue Codes

Start with a small stable set:

- `expired`
- `missing_scope`
- `forbidden`
- `quota_exceeded`
- `network_error`
- `unsupported_credentials`
- `empty_result`
- `unknown_error`

These should be attached to both auth status and one-off prompt attempts where applicable.

## Capability Model

Initial capabilities:

- `canUseChat`
- `canGenerateWorkspaceTitle`
- `canUseSmallModelTasks`

Rules:

- expired OAuth: connected credential exists, but `connectionState = needs_attention`
- missing scope like `api.responses.write`: token remains connected, but capability for small-model tasks is false
- env/api-key auth can stay `connected` unless an actual provider failure proves otherwise
- raw provider failures should be normalized before they hit UI

## Rollout Plan

1. Add shared provider issue/capability types in the auth layer.
2. Expand auth status beyond `issue: "expired"` to support normalized issue codes and `connectionState`.
3. Refactor `call-small-model.ts` to classify provider failures into canonical issue codes instead of carrying raw strings as UX input.
4. Update `ai-name.ts` to use canonical issue summaries when building fallback warnings.
5. Update Models settings to render from canonical provider status rather than `authenticated` + `method` heuristics.
6. Cache or reuse last-known provider issues for feature-specific capability failures so Settings does not incorrectly show `Active` after a confirmed permission error.
7. Reduce raw console noise: keep raw provider errors for debug logging, but use normalized copy for user-facing toasts and badges.

## Current Policy Decisions

- Ambient runtime env auth stays disabled.
- OpenAI OAuth is allowed for the one-off small-model path.
- Missing OpenAI `api.responses.write` should be treated as `missing_scope`, not disconnected auth.
- Prompt-derived workspace titles remain the final fallback, but the warning should explain the normalized cause.

## Risk To Decide Up Front

`packages/chat/src/host/chat-service/anthropic-env-config.ts` still writes managed Anthropic settings into `process.env`. If the requirement becomes "never use env vars for provider auth under any circumstances", that needs a separate redesign. The canonical capability layer does not solve that by itself.

## Validation

Keep and extend tests for:

- ambient `OPENAI_API_KEY` / `ANTHROPIC_AUTH_TOKEN` do not authenticate chat
- expired OAuth becomes `needs_attention`
- missing OpenAI scope becomes `missing_scope`, not disconnected auth
- settings badge/copy reflects canonical provider state
- workspace naming uses canonical fallback messages
- fallback reaches another provider before prompt-derived naming when possible

Last verified before this plan update:

- targeted auth, small-model, and workspace-naming tests passed
- `bun run typecheck` passed
