# Agent Identity in Lifecycle Hooks → Icon in Terminal Pane (v2)

**Status:** Draft
**Scope:** v2 only

## Goal

When a CLI agent (Claude, Codex, Gemini, …) is running inside a v2 terminal and we can detect it via the existing lifecycle hook, **show the agent's icon in that pane's header**. Hide it when no agent is running.

That's the user-facing feature. To get there, generalize the hook contract so every agent reports a small **agent identity object** — primarily the `agentId` (matching our existing agent model), plus optional `sessionId` and room for more fields later — keyed by `terminalId`. The icon is the first consumer; future surfaces (resume UX, chat ↔ terminal cross-link, observability) reuse the same shape without further protocol churn.

## Why

- Users have no way to tell at a glance whether a terminal is "just a shell" or "Claude is alive in there." The icon answers that instantly.
- All assets and infra already exist; the missing piece is propagating the agent identity through the hook.

## Existing agent model (use, don't reinvent)

The repo already has a canonical model for agent identity. Reuse it:

- `BuiltinAgentId` — `"claude" | "amp" | "codex" | "gemini" | "mastracode" | "opencode" | "pi" | "copilot" | "cursor-agent" | "superset"`. Defined in `packages/shared/src/agent-catalog.ts:23` from `BUILTIN_TERMINAL_AGENTS` in `packages/shared/src/builtin-terminal-agents.ts:59`.
- `AgentDefinitionId` — `BuiltinAgentId | \`custom:${string}\`` (`agent-catalog.ts:24`). User-customized definitions get the `custom:` prefix.
- `HostAgentPreset.presetId` (`packages/shared/src/host-agent-presets.ts:4`) uses these same strings for terminal presets.
- `PRESET_ICONS` (`packages/ui/src/assets/icons/preset-icons/index.ts`) is keyed by these same strings — `usePresetIcon("claude")` already does the right thing.

Naming convention in this doc: **`agentId`** = a `BuiltinAgentId` (the wrapper-level identity). Avoid the word `kind` here — `AgentKind` already means `"terminal" | "chat"` in `packages/shared/src/agent-definition.ts:8`, so reusing it would collide.

`agentDefinitionId` (the user-def-level identity, e.g. `custom:my-claude-no-thinking`) is **out of scope for this PR** — wrappers register hooks at the binary level (`~/.claude/settings.json` fires for *all* `claude` invocations regardless of which custom def was launched), so the wrapper can only stamp the builtin `agentId`. Plumbing the definition id requires the launch path to set a per-invocation env var; noted as a future extension below.

## Current state

End-to-end lifecycle pipe already works, keyed by `terminalId`:

| Step | Where |
| --- | --- |
| `SUPERSET_TERMINAL_ID` + hook URL injected into PTY env | `packages/host-service/src/terminal/env.ts:183,195` |
| Hook script POSTs `{terminalId, eventType}` to host-service | `apps/desktop/src/main/lib/agent-setup/templates/notify-hook.template.sh:91-107` |
| `notifications.hook` broadcasts `agent:lifecycle` over WS | `packages/host-service/src/trpc/router/notifications/notifications.ts:31` |
| Renderer keys pane status (working/permission/review/idle) by `terminalId` | `apps/desktop/src/renderer/routes/_authenticated/components/V2NotificationController/lib/{lifecycleEvents,statusTransitions}.ts` |
| Per-agent icons exist | `packages/ui/src/assets/icons/preset-icons/index.ts` (`PRESET_ICONS`: claude, codex, gemini, opencode, copilot, cursor-agent, amp, pi, mastracode) |
| Pane header has an extras slot | `apps/desktop/src/renderer/.../TerminalPane/components/TerminalHeaderExtras/TerminalHeaderExtras.tsx` |

The hook currently carries `eventType` but not which agent fired it.

## Generic shape

One thing every layer agrees on. Define once, share across host-service / main / renderer:

```ts
import type { BuiltinAgentId, AgentDefinitionId } from "@superset/shared";

// Reported by hook, broadcast over WS, stored in renderer state.
// Everything besides `agentId` is optional — a hook that knows only the
// agent is still useful; fields are additive forever.
export interface AgentIdentity {
  agentId: BuiltinAgentId;          // "claude" | "codex" | "gemini" | …
  sessionId?: string;                // agent-native session id when the hook payload exposes one
  definitionId?: AgentDefinitionId;  // future: stamped by the launch path, not the wrapper
  // future-friendly: model?, version?, transcriptPath?, … add later without breaking callers
}
```

Why nest under one object instead of flat fields:

- Single name to grep, one type to extend.
- Layers that don't care about fields beyond `agentId` (the icon UI) ignore the rest.
- `terminalId` stays the key on every map; `AgentIdentity` is the value.

We pass identity through unchanged at every boundary. No enum gating on `agentId` at the wire level — the receiver accepts any string and the renderer's `usePresetIcon` returns `undefined` for unknowns, so an agent ships by adding to `BUILTIN_TERMINAL_AGENTS` + `PRESET_ICONS` + a wrapper. No schema migration.

## Design

### 1. Each wrapper stamps its `agentId`

Each agent wrapper writes its hook command line. Inject one env var there — the hook script doesn't need to sniff JSON shape:

```sh
SUPERSET_AGENT_ID=claude $SUPERSET_HOME_DIR/hooks/notify.sh
```

The value is a `BuiltinAgentId`. Per-wrapper assignments:

- `agent-wrappers-claude-codex-opencode.ts` → `claude` / `codex` / `opencode`
- `agent-wrappers-gemini.ts` → `gemini`
- `agent-wrappers-cursor.ts` → `cursor-agent`
- `agent-wrappers-copilot.ts` → `copilot`
- `agent-wrappers-amp.ts` → `amp`
- `agent-wrappers-pi.ts` → `pi`
- `agent-wrappers-mastra.ts` → `mastracode`
- `agent-wrappers-droid.ts` → `droid` (no preset entry today; either skip the icon for droid or add it to `BUILTIN_TERMINAL_AGENTS` first)

`SUPERSET_AGENT_ID` is the only env var the wrapper needs to set. `sessionId` is parsed out of the agent's own JSON payload at hook time (next step).

### 2. Hook script forwards identity

`notify-hook.template.sh` already parses `HOOK_SESSION_ID` from the agent JSON (line 15) and uses it on the v1 fallback (line 119). Carry it on the v2 path too.

In `notify-hook.template.sh:91-107` (v2 branch):

```sh
# Build identity object inline so missing fields naturally drop out as empty strings.
PAYLOAD="{\"json\":{
  \"terminalId\":\"$(json_escape "$SUPERSET_TERMINAL_ID")\",
  \"eventType\":\"$(json_escape "$EVENT_TYPE")\",
  \"agent\":{
    \"agentId\":\"$(json_escape "$SUPERSET_AGENT_ID")\",
    \"sessionId\":\"$(json_escape "$HOOK_SESSION_ID")\"
  }
}}"
```

Receiver coerces empty strings → undefined so missing fields don't poison downstream logic. Older shells with a cached pre-change script still post the v2 minimal payload; the receiver tolerates absence of `agent` entirely.

When other agents (Codex, Gemini, …) expose a session id under a different JSON key, extend the extraction in the script the same way `HOOK_SESSION_ID` is parsed today — the result still maps into `agent.sessionId`.

### 3. tRPC schema + broadcast

`packages/host-service/src/trpc/router/notifications/notifications.ts`:

```ts
const agentIdentitySchema = z
  .object({
    agentId: z.string().min(1),               // BuiltinAgentId at the type level; string at the wire
    sessionId: z.string().min(1).optional(),
    definitionId: z.string().min(1).optional(),
  })
  .optional();

const hookInput = z.object({
  terminalId: z.string().optional(),
  eventType: z.string().optional(),
  agent: agentIdentitySchema,                  // NEW
});
```

Receiver normalizes (drop empty strings → undefined), then:

```ts
ctx.eventBus.broadcastAgentLifecycle({
  workspaceId,
  eventType,
  terminalId,
  agent: input.agent,                          // NEW — pass through verbatim
  occurredAt: Date.now(),
});
```

Add `agent?: AgentIdentity` to `AgentLifecycleMessage` (`packages/host-service/src/events/types.ts:25`) and `AgentLifecyclePayload` in `@superset/workspace-client`. Define `AgentIdentity` once — best home is `packages/shared/src/agent-identity.ts` since `BuiltinAgentId` lives in `@superset/shared` already — and re-export from `@superset/workspace-client` so host-service / main / renderer share one source of truth.

### 4. Renderer: live binding store

New small zustand slice — no persistence, generic over the identity shape:

```ts
// renderer/stores/v2-agent-bindings/store.ts
import type { AgentIdentity } from "@superset/workspace-client";

type Binding = { identity: AgentIdentity; lastEventAt: number };

interface V2AgentBindingState {
  byTerminalId: Record<string, Binding>;
  set(terminalId: string, identity: AgentIdentity, at: number): void;
  clear(terminalId: string): void;
}
```

Wire in `HostNotificationSubscriber` (`...V2NotificationController/components/HostNotificationSubscriber/HostNotificationSubscriber.tsx`):

- On `agent:lifecycle` with `payload.agent`: `set(terminalId, payload.agent, occurredAt)`.
  Includes `Stop` events — the agent is still the live agent until the terminal exits or a different `agentId`/`sessionId` arrives. This avoids the icon flickering off between user prompts.
- On `terminal:lifecycle` `exit`: `clear(terminalId)`.

A subsequent event with a different `agent.sessionId` (or different `agentId`) for the same terminal **replaces** the binding — last-seen wins. We retain `sessionId` for future surfaces (e.g. "resume this session") even though the icon only reads `agentId`.

### 5. Render the icon

`TerminalHeaderExtras.tsx`:

```tsx
const binding = useV2AgentBindingStore(s => s.byTerminalId[data.terminalId]);
const agentId = binding?.identity.agentId;
const label = agentId ? BUILTIN_AGENT_LABELS[agentId] : undefined;
const iconSrc = usePresetIcon(agentId ?? "");

return (
  <div className="flex items-center gap-1">
    {iconSrc && agentId ? (
      <img
        src={iconSrc}
        alt={label ?? agentId}
        title={label ?? agentId}
        className="size-3.5 opacity-80"
      />
    ) : null}
    <TerminalLogsButton ... />
  </div>
);
```

`usePresetIcon` already handles dark/light variants and returns `undefined` for unknown ids → nothing renders. `BUILTIN_AGENT_LABELS` (from `@superset/shared/agent-catalog`) gives the human-readable name for tooltip / a11y. Safe default for any future agent id that ships before its icon does.

## What this does not do

- No persistence — refresh and the binding rebuilds on the next lifecycle event (next agent message). For the first second after reload there's no icon; acceptable.
- No multi-agent-per-terminal display — last-seen identity wins.
- No chat-pane / session-resume integration. The `sessionId` field is *captured* so those features can land later without a protocol round trip; this PR doesn't expose it in the UI.
- No `definitionId` resolution. The wrapper-level hook can't tell which user-customized definition launched (e.g. `custom:my-claude-no-thinking` vs builtin `claude`) — they share a binary and a `~/.claude/settings.json`. To plumb it later: have the launch path (`packages/shared/src/agent-launch-request.ts` and callers) inject `SUPERSET_AGENT_DEFINITION_ID=<id>` into the spawned command's env; the hook script picks it up and adds `definitionId` to the identity object. Field is reserved in the schema today.

## Test plan

- `notify-hook.test.ts` — v2 payload includes `agent.agentId` when env var set, includes `agent.sessionId` when present in stdin JSON, omits the whole `agent` object when neither is set.
- `notifications.test.ts` — `agent` passes through to broadcast; empty-string fields normalized to undefined; identity missing entirely → broadcast still fires (icon just won't render).
- Renderer unit — store stores `{agentId, sessionId}` on `Start`, retains it on `Stop`, replaces on a different `sessionId` or `agentId`, clears on `terminal:lifecycle exit`.
- Manual — open terminal, run `claude`, header shows the Claude glyph; `/exit`, run `codex`, header switches to Codex; close terminal, icon goes away.
- Mutation check — flip `SUPERSET_AGENT_ID=claude` to empty in the wrapper template; renderer test asserting the icon renders should fail.

## Rollout

One PR can ship the whole thing — it's small:

1. Wrapper env injection (Claude first; sweep the rest in same PR or next).
2. Hook script + receiver field.
3. Renderer store + `TerminalHeaderExtras` wiring.

Backward-compatible at every layer (all new fields optional; missing → no icon, same as today).
