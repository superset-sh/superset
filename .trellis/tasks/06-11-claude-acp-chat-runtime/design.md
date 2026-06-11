# Claude ACP Chat runtime design

## Scope

This task changes only standalone Chat. Workspace/Code chat keeps the existing `createMastraCode` runtime path for now.

Standalone Chat is not "web ChatGPT only". It is an account-level Host Assistant: no Workspace is required, but it can perform controlled local actions on the current machine.

## Architecture

Keep `ChatRuntimeService.session.*` as the renderer-facing API. `ChatRuntimeService` already routes calls with no `cwd` into `StandaloneChatRuntimeManager`; this task replaces that manager's provider execution layer with a Superset-owned Claude adapter while preserving its display-state and persistence contract.

```
Desktop Chat UI
  -> Electron tRPC chat runtime service
  -> StandaloneChatRuntimeManager
  -> StandaloneChatProvider adapter interface
  -> Claude ACP-compatible adapter
  -> Claude Code / Claude Agent SDK process
```

The adapter interface should support:

- `sendTurn(messages, options, onEvent)`
- streaming assistant text deltas
- streaming/persisted reasoning deltas
- model and thinking options
- controlled tool permission decisions
- abort signal
- typed user-facing runtime errors

## Claude integration choice

Paseo uses two related layers:

- Claude-specific runtime through `@anthropic-ai/claude-agent-sdk`.
- Generic ACP providers through `@agentclientprotocol/sdk`.

For this first Superset iteration, use the Claude SDK as the stable Claude-compatible backend surface and keep the adapter interface named around ACP-style provider events. If the SDK launch path is unavailable in the packaged app, the adapter can later swap to a raw ACP JSON-RPC client without changing UI or persistence.

## Persistence

Use the existing `chat_messages` table. Preserve the account-level `chat_sessions` rows from the standalone Chat work. No backward compatibility is required for older internal beta messages, but the new runtime must hydrate existing rows after reload.

Persist content parts as:

- user text: `{ type: "text", text }`
- assistant text: `{ type: "text", text }`
- assistant thinking: `{ type: "reasoning", text }`

The cloud schema/router must accept the reasoning part type. If the current generated migration does not include it, update the Drizzle schema and ask for migration generation instead of manually editing generated migration files.

## Tool Permission Policy

For this iteration, standalone Chat should be a real Claude Code powered host assistant, not a constrained text-only model call. The default composer mode is Auto, and Auto maps to Claude Code `bypassPermissions` with `allowDangerouslySkipPermissions`.

The permission picker must be wired to the runtime:

- Auto -> `bypassPermissions`
- Semi-auto -> `acceptEdits`
- Manual -> `default`

Manual approval cards for Claude SDK permission prompts are a follow-up. The first version prioritizes full Claude Code functionality in Auto mode.

## UI

Keep the current standalone `/chat` page shell, but treat it as a pure ChatGPT-like chat page:

- no Workspace picker/cwd copy in standalone mode
- no duplicate `Chats` heading under the top-level `Chat` tab
- composer controls include model and thinking strength
- future permission prompts can reuse the existing pending approval UI shape, but this task may deny unsafe operations with a clear assistant-visible message until that bridge exists.
- the active message list has enough top spacing in a conversation
- loading state must show the current running assistant turn instead of blanking

## Risk Controls

- Do not copy Paseo source into Superset because of AGPL.
- Keep Mastra imports and behavior for Code chat unchanged.
- Keep direct provider fallback out of the normal path. If Claude runtime is not configured, fail clearly.
- Add tests at the runtime layer first; UI smoke validates the real desktop path.
