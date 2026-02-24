# Chat-Mastra Rebuild Exec Plan

This is the source-of-truth plan for rebuilding chat as a separate `chat-mastra` stack.

## Status
- Owner: platform/chat
- Scope: desktop-first rollout, server/client split preserved
- Last updated: 2026-02-24

## Goals
- Build a new chat architecture with no runtime code sharing with `@superset/chat`.
- Keep write/control APIs over tRPC.
- Keep read/replay APIs over durable streams (SSE) for all clients.
- Preserve session resumability using Mastra storage.
- Keep server as a hostable service core that can be wrapped by tRPC/Hono.

## Non-Goals (v1)
- No command-log-first write path (can be added later).
- No legacy chat migration in place.
- No attempt to make harness events stable across arbitrary Mastra versions.

## Locked Decisions
- New package: `packages/chat-mastra` (single package with strict internal boundaries).
- New session metadata table: `chat_mastra_sessions`.
- Event protocol: raw Mastra harness events for runtime output.
- Slash commands served by our service layer, not by harness.
- Rollout: desktop first.

## Internal Package Layout
- `src/client`
- `src/schema`
- `src/events`
- `src/server/core`
- `src/server/trpc`
- `src/server/hono`
- `src/server/file-search`
- `src/server/slash-commands`

## Mastra Runtime Facts (Validated)

### `initialState` vs `storage`
- `initialState` is constructor-time seed/default state only.
- Real resume/history is storage-backed (`listThreads`, `listMessages` paths require storage).
- For our use-case, keep storage enabled for true resume.

### Harness Event Behavior
- `sendMessage()` emits `agent_start` first.
- `message_start` is for assistant stream construction (not user submit).
- `message_start` payload is assistant role.
- `agent_end.reason` gives terminal state (`complete`, `aborted`, `error`).
- `abort()` itself does not emit a dedicated abort event.

### Gap We Must Fill
- Harness does not emit explicit `user_message_submitted`.
- Service must emit durable submit events before calling harness methods.

### Slash Commands in MastraCode
- Slash commands are handled in MastraCode TUI layer (`dispatchSlashCommand`, loaders), not in harness.
- `createMastraCode()` does not expose a slash-command API for our transport stack.
- We must provide slash discovery/resolve/execute APIs in our service.

## High-Level Data Flow
1. Client calls tRPC mutation (`sendMessage`, control, approval, etc.).
2. Service appends durable submit event (`*_submitted`) via per-session ordered append queue.
3. Service calls harness API.
4. Harness emits runtime events.
5. Service appends raw harness events to same durable stream (same queue).
6. Clients consume durable stream only for chat timeline.
7. Non-stream features (file search, slash discovery/preview/resolve) use tRPC.

## Durable Event Envelope (v1)

```ts
kind: 'submit' | 'harness'
sessionId: string
timestamp: string
sequenceHint: number
payload: unknown
```

Submit event types:
- `user_message_submitted`
- `control_submitted`
- `tool_output_submitted`
- `slash_command_invoked`
- `slash_command_failed` (optional)

Harness payload:
- raw `HarnessEvent` object

## Ordering and Idempotency
- One append queue per session (single writer).
- Queue serializes all durable writes for deterministic order.
- Optional `clientMessageId` dedupe map in service (TTL cache) for retries.

## tRPC Contract (Chat-Mastra)
- `start({ organizationId })`
- `stop()`
- `session.ensureRuntime({ sessionId, cwd? })`
- `session.sendMessage({ sessionId, content, files?, metadata?, clientMessageId? })`
- `session.control({ sessionId, action })`
- `session.toolOutput({ sessionId, tool, toolCallId, output|error })`
- `session.approval.respond({ sessionId, decision, toolCallId? })`
- `session.question.respond({ sessionId, questionId, answer })`
- `session.plan.respond({ sessionId, planId, action, feedback? })`
- `workspace.searchFiles(...)`
- `workspace.getSlashCommands(...)`
- `workspace.resolveSlashCommand(...)`
- `workspace.previewSlashCommand(...)`

## Slash Command Model

### Registry
- Keep markdown command files in `.claude/.agents` command directories.
- Build registry with project overrides over global.

### Resolution
- If command has `action`: execute mapped service action handler.
- Else render template to prompt text and send to harness.

### Prompt Command Payload
Wrap rendered prompt before sending to harness:

```xml
<slash-command name="..." invokedAs="/...">
...rendered command text...
</slash-command>
```

### Action Definitions
`action` is an enum in service layer (examples):
- `new_session`
- `stop_stream`
- `set_model`
- `switch_mode`

`passArguments` determines whether raw args are forwarded to action handler.

## Session Metadata Strategy
Create `chat_mastra_sessions` with:
- `id`
- `organization_id`
- `created_by`
- `workspace_id`
- `title`
- `last_active_at`
- `created_at`
- `updated_at`

Notes:
- Needed for efficient listing/filtering/title UX.
- Avoid stream-scanning for index UX.

## Desktop Integration Plan
- Add new pane type: `chat-mastra`.
- Add new router namespace: `chatMastraService`.
- Add new renderer pane component tree for chat-mastra.
- Keep old `chat` pane untouched during rollout.
- Feature-flag initial enablement.

## API/Hono Integration Plan
- Keep Hono as wrapper.
- Mount tRPC handler in Hono.
- Mount durable stream proxy endpoints in Hono.
- Keep write path canonical through tRPC.

## Risks and Mitigations
- Risk: async listener reordering -> Mitigation: per-session append queue.
- Risk: no user submit event in harness -> Mitigation: explicit submit events.
- Risk: Mastra internal TUI slash APIs change -> Mitigation: own slash layer.
- Risk: raw harness schema shifts -> Mitigation: pin Mastra version + contract snapshots.

## Test Matrix
- Unit: queue ordering and submit-before-runtime ordering.
- Unit: slash resolve (action vs prompt) and arg passing.
- Integration: send message -> ordered stream -> replay renders complete timeline.
- Integration: approval/question/plan roundtrip.
- Integration: abort produces terminal state via `agent_end.reason`.
- Integration: restart + `ensureRuntime` resume behavior.
- Contract: snapshot raw harness event discriminants and key fields.

## Implementation Checklist
- [ ] Create `packages/chat-mastra` exports + tsconfig + deps.
- [ ] Implement `src/schema` event/state schema.
- [ ] Implement `src/events` queue + durable append helpers.
- [ ] Implement `src/server/core` runtime manager and session runtime lifecycle.
- [ ] Implement `src/server/slash-commands` parser/registry/resolver with action support.
- [ ] Implement `src/server/trpc` router over core.
- [ ] Implement `src/server/hono` wrapper mounting tRPC + stream routes.
- [ ] Add `chat_mastra_sessions` DB schema (and relations if needed).
- [ ] Add desktop main-process router namespace `chatMastraService`.
- [ ] Add desktop pane type `chat-mastra` and initial pane surface.
- [ ] Add tests for ordering, resume, slash behaviors, and event contracts.

## Open Questions (to resolve during implementation)
- Whether to include `chat_mastra_session_hosts` in v1.
- Exact migration strategy for users with existing `chat_sessions` tabs.
- Whether custom slash command `action` should be allowed in markdown frontmatter in v1, or builtins-only actions first.
