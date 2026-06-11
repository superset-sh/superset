# Standalone Chat Runtime

## Scenario: Account-Scoped Standalone Chat

### 1. Scope / Trigger

- Trigger: Editing `packages/chat/src/server/trpc/standalone-runtime.ts`, `/chat` session creation, account-scoped Chat model calls, or title generation.
- Standalone Chat has no Workspace, cwd, host, Task, or Trellis context. It still uses cloud `chat_sessions` rows so history is account-synced.

### 2. Signatures

- Runtime entrypoint: `StandaloneChatRuntimeManager.sendMessage(input: SendMessageInput): Promise<void>`.
- Display state: `getDisplayState(sessionId)` returns `isRunning`, `currentMessage`, and `errorMessage`.
- History: `listMessages(sessionId)` returns committed user and assistant messages from persisted cloud history, with a short runtime cache to avoid hot-looping the API.
- Cloud session creation: `chat.createSession({ sessionId, v2WorkspaceId?: null })`.
- Cloud message persistence: `chat.appendMessage(...)`, `chat.listMessages(...)`, and `chat.deleteMessagesFrom(...)` own standalone history.

### 3. Contracts

- Standalone Chat calls `ChatRuntimeService.session.*` with no `cwd`; a non-empty `cwd` belongs to workspace/Code chat.
- Standalone Chat runtime must create and use one isolated directory per conversation as the Claude SDK cwd. Production defaults to `~/.superset/chat/<sessionId>`. Development defaults to `~/.superset/dev-chat/<sessionId>` when `SUPERSET_HOME_DIR` points at the repo-local `superset-dev-data`. It must not run host-assistant turns directly from `$HOME` or from the Superset source checkout.
- Standalone Chat must pass the same per-chat cwd through both the Claude SDK `cwd` option and subprocess environment keys `PWD`, `INIT_CWD`, and `OLDPWD`. In desktop/dev, the parent process often starts from the Superset source checkout; inheriting those values lets Claude infer `.trellis`/`AGENTS.md` project context even when `cwd` is set.
- In development, `SUPERSET_HOME_DIR` may intentionally point at the repo-local `superset-dev-data`, but Standalone Chat must still avoid that tree because Claude can infer project context from parent `.trellis`, `.git`, and `AGENTS.md` files. Use `~/.superset/dev-chat/<sessionId>` for dev standalone Chat unless `SUPERSET_STANDALONE_CHAT_HOME_DIR` explicitly overrides the root.
- Provider-backed standalone Chat model selections pass only renderer-safe metadata over tRPC: raw `model`, `modelProviderId`, `modelProviderName`, and `modelProviderProtocol`. The renderer must never receive or send provider secrets.
- When `modelProviderId` is present, `StandaloneChatRuntimeManager` resolves the Provider through `modelProvider.syncPayload` server-side, validates that the Provider is enabled, has a decrypted secret, and still contains the selected raw model id, then prepares Claude-compatible env for that turn.
- Provider env injection writes `<chatCwd>/.claude/settings.local.json` with `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL`, `API_TIMEOUT_MS`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, `CLAUDE_CODE_DISABLE_1M_CONTEXT`, and `ENABLE_TOOL_SEARCH`. The Claude SDK `env` option must merge this env over the existing `process.env` because SDK env replaces the subprocess environment.
- UI model option ids may include Provider identity for list uniqueness, but the model passed to the backend/Claude must be the raw provider model id. Do not reintroduce encoded `superset:...` model strings for Chat.
- Standalone Chat must treat user-pasted `http`/`https` URLs as retrievable context. Best-effort fetch readable page text before calling the model, inject it as a transient system message, and do not persist fetched page text into `chat_messages`.
- New standalone sessions must have `workspaceId = null` and `v2WorkspaceId = null`.
- New standalone sessions must be created and confirmed through the cloud `chat.createSession` path before `useChatDisplay`, `listMessages`, or `sendMessage` run for that session. The desktop renderer may keep a local ready set for newly confirmed sessions while Electric catches up, but it must not treat an arbitrary dev-mode `sessionId` as ready.
- Desktop chat session optimistic inserts should not return an Electric txid wait from their collection `onInsert`. API success is enough to keep the optimistic row; Electric may catch up asynchronously. Waiting for txid here can produce noisy `[chat_sessions-...] Timeout waiting for txId` toasts even though the session was created.
- Standalone messages must be persisted in `chat_messages`; `chat_sessions` is only the conversation/list metadata row.
- A deployed API must have the `chat_messages` migration applied before enabling standalone Chat persistence. Do not mask `chat.listMessages` or `chat.appendMessage` schema errors in the UI; fix the database deployment path.
- A runtime process may cache hydrated messages briefly. It must hydrate from `chat.listMessages` before returning history for an unseen session, but once a session is hydrated, `listMessages` must return cached messages immediately and refresh stale cloud history in the background. Do not block conversation switching on stale-cache refresh.
- While a provider response is in progress, `currentMessage` must contain the streaming assistant text and `isRunning` must be true.
- Claude SDK `tool_use` events must be represented as structured `{ type: "tool_call", id, name, args }` message parts, and matching Claude `tool_result` events must be represented as `{ type: "tool_result", id, name, result, isError? }`. Do not serialize tool events into plain assistant text.
- Superset Agent Event Timeline parts are persisted in `chat_messages.content`, validated by `packages/trpc/src/router/chat/chat.ts`, emitted by `packages/chat/src/server/trpc/standalone-runtime.ts`, and rendered by the desktop Chat message list. The current timeline vocabulary is `text`, `reasoning`, `tool_call`, `tool_result`, `permission_requested`, `permission_resolved`, `tool_progress`, `mode_changed`, `model_changed`, `subagent_event`, `context_attachment`, and `branch_marker`.
- Claude SDK permission requests must create a `permission_requested` part before exposing `pendingApproval`; `respondToApproval` must append or update a matching `permission_resolved` part with `approve`, `decline`, `always_allow_category`, or `denied`.
- Claude SDK `tool_progress`, `tool_use_summary`, task lifecycle messages, hook lifecycle messages, and `permission_denied` system messages must be translated into Superset-owned timeline parts instead of leaking raw SDK payloads into the renderer.
- Claude SDK hook lifecycle messages are usually housekeeping. Do not render successful SessionStart/UserPromptSubmit/PermissionRequest/PostToolUse/Stop hook stdout inline; it makes Chat look like a debug log. Only failed hook responses should become visible timeline events, with a compact summary.
- Standalone Chat must not set Claude SDK `maxTurns` for normal host-assistant use. A fixed turn cap interrupts legitimate multi-tool work, and users can stop runaway work with the Stop control. If Claude still reports a max-turn failure, treat it as a Claude Code CLI/configuration limit or a tool loop, not a Superset-imposed cap.
- Standalone Chat runtime errors must be diagnosable from logs. In development, log `Claude turn started`, `Claude turn completed`, and `Claude turn failed` from the runtime owner with the submitted prompt, cwd, selected model/provider identifiers, provider base URL, permission mode, thinking level, max turn limit, duration, event counters, tool names, raw error name/message/stack, and normalized error message. Do not spend debugging time guessing from UI-only failures; check the runtime log first.
- Standalone Chat may persist compact model/mode metadata parts at the start of an assistant turn for audit/debug, but the default assistant-message body must not render them as repeated chips. Composer controls already show the active model and mode.
- User-provided files/images/URLs should be represented as context attachment timeline chips. URL fetched page text remains transient provider context and must not be persisted into `chat_messages`.
- Branch conversation support is currently a reserved UI/runtime structure. The standalone runtime may persist `branch_marker` metadata, but default Chat messages must not show a disabled branch chip on every assistant turn.
- Claude native tools such as `Bash`, `Read`, `Write`, `Edit`, `MultiEdit`, `Grep`, `Glob`, `LS`, `WebFetch`, `WebSearch`, `Task`, and `Skill` should render through the Agent Tool Card V2 display model. Claude ACP/local adapter aliases such as `local_bash`, `local_shell`, and `local_command` must also route through Tool Card V2 as Shell events. The collapsed UI must be a compact inline `ToolCallRow`-style timeline row with title, summary, and status. Parameters, stdout/stderr, diffs, and long output belong behind click-to-expand details, not in a large default card. Existing Superset/Mastra workspace tools may continue using their specialized cards.
- Tool naming is a shared contract, not a renderer detail. Use `@superset/chat/shared` agent tool normalization for backend runtime persistence, renderer ToolCallBlock routing, and Agent Timeline display. Do not add local alias sets such as `CLAUDE_NATIVE_TOOL_NAMES` or one-off `local_bash` checks in UI components.
- Superset follows the Paseo-style split between protocol semantics and presentation: raw provider strings are normalized into canonical tool kinds (`shell`, `read`, `edit`, `write`, `search`, `fetch`, `subagent`, `skill`, `unknown`) before display. UI components consume display models; they should not infer first-class semantics from raw provider event names.
- Tool-like subagent/task events are not real subagent lifecycle events. If a provider emits a `subagent-event` whose `subagentType` is a known tool alias such as `local_bash`, persist it as `tool_progress` and render it through the inline Tool Card V2 path. Preserve true subagent lifecycle events, for example `general-purpose` task progress, as `subagent_event`.
- Claude `input_json_delta` chunks are tool input, not assistant text. Accumulate them into the active tool call args and ignore duplicate empty/unchanged arg snapshots to avoid unnecessary renderer churn.
- Completed assistant messages must preserve the order of reasoning, text, tool calls, and tool results from the active turn. Do not rebuild final content as only `reasoning + text`.
- Standalone Chat must handle Claude SDK `canUseTool` approvals inside `StandaloneChatRuntimeManager`. `ChatRuntimeService.session.approval.respond` must route requests with no `cwd` to the standalone runtime instead of creating a workspace runtime with `process.cwd()`.
- Use Superset approval UI only for Claude modes that can prompt for approval, such as `default` and `acceptEdits`. Do not force approval prompts for `auto`, `bypassPermissions`, `dontAsk`, or `plan`.
- When the provider finishes, the final assistant message is appended to `messages`, `currentMessage` is cleared, and `lastActiveAt` is updated.
- On provider failure or abort, append a persisted assistant error message so reloads and device switches do not silently lose the failed turn.
- Standalone Chat titles use the first submitted user text, normalized and truncated. Do not call a separate model for title generation in the default path.

### 4. Validation & Error Matrix

- No enabled provider -> `sendMessage` throws a provider configuration error.
- Provider stream returns HTTP error -> append an assistant error message and surface `errorMessage`.
- Claude reaches a max-turn limit -> append a clear assistant error explaining that Superset standalone Chat does not set a turn cap and that the limit came from Claude Code CLI/configuration or a tool loop, not the raw `Reached maximum number of turns (5)` SDK text.
- URL fetch succeeds -> model receives title/description/excerpt context and must not answer as if it has no link access.
- URL fetch fails -> model receives a precise fetch failure in context and should say what is missing, not claim generic inability to browse.
- Title update fails -> log `[standalone-chat] Title update failed`; do not fail the chat response.
- Electric sync is slow -> UI should still show an optimistic session row immediately.
- Fresh session creation -> first create/confirm the `chat_sessions` row, then enable display/history polling and first send. A fresh session must not emit `Chat session not found` before the runtime starts Thinking.
- Fresh session first send -> preserve the optimistic user message across the route change from no session to the created `sessionId`; the message list must render the user bubble and Thinking/tool progress, not the empty `Start a conversation` state.
- Runtime cache lost, hot reload, app restart, or opening a session on another machine -> `listMessages` hydrates from `chat_messages` and must not return an empty history solely because the local runtime Map is empty.
- Runtime cache stale but present -> `listMessages` returns cached history immediately, starts a background cloud refresh, and the next query observes refreshed messages. The UI must not show `Loading conversation` for stale-cache refreshes.
- Successful send mutation -> the renderer must synchronously query `session.listMessages` and `session.getDisplayState` through the raw tRPC client, then write both results into the matching React Query cache with `setData`. This is required for fast new-session turns where the cache was manually seeded with an optimistic user message before the route observer subscribed. Do not rely on invalidation or polling to reveal the final assistant message.
- Electron tRPC cache refresh -> do not use `chatRuntimeServiceTrpcUtils.session.*.fetch(...)` in this renderer path. The Electron link does not support that shortcut reliably and can throw `client[procedureType] is not a function`. Use `chatRuntimeServiceTrpcUtils.client.session.<procedure>.query(...)` plus `setData(...)` instead.
- Claude tool call/result persistence fails -> update `ChatMessageContent` in `packages/db/src/schema/schema.ts` and `chatMessageContentSchema` in `packages/trpc/src/router/chat/chat.ts`; both layers must accept `tool_call` and `tool_result`.

### 5. Good/Base/Bad Cases

- Good: User clicks New chat, a local `New Chat` row appears immediately, response streams into the canvas, and the title becomes a clean version of the first user message.
- Good: User asks Chat to run `pwd`, the assistant turn shows a Bash tool card with command `pwd`, then the output appears in the same turn and persists after reload.
- Good: A Claude ACP `local_bash` failure renders as a compact Shell row with expandable error details, not as the legacy large red generic tool card.
- Base: Provider ignores `stream: true` and returns JSON; runtime extracts the full text and still displays it.
- Bad: `sendMessage` waits for the full provider response before setting `currentMessage`, causing a blank waiting state.
- Bad: a new-session send seeds `listMessages` with an optimistic user bubble, the provider completes quickly, and the UI waits for polling/invalidation instead of forcing the final `listMessages` cache update; the conversation can appear blank or user-only even though runtime completed.
- Bad: Title generation makes a second model request and later overwrites the first-message title unexpectedly.
- Bad: The sidebar uses cloud `chat_sessions` while message history lives only in memory; switching or restarting then shows empty conversations.
- Bad: Claude SDK `input_json_delta` is appended to a text part, causing tool argument JSON to appear as assistant prose.

### 6. Tests Required

- Unit test that title generation uses the first user message and does not make a separate title model request.
- Unit test that SSE chunks update `currentMessage` before `sendMessage` resolves.
- Unit test that an empty runtime hydrates existing messages from `chat.listMessages`.
- Unit test that stale cached history returns immediately while cloud history refreshes in the background.
- Unit test that a pasted URL is fetched and injected into provider messages before the provider request.
- Unit test that provider tool-call/tool-result events update `currentMessage` before completion and persist as structured content.
- Unit test that successful `sendMessage` refreshes `listMessages` and `getDisplayState` through raw client queries and writes the results into cache after the mutation resolves.
- Unit test that standalone tool approval requests appear in `getDisplayState(...).pendingApproval` and `respondToApproval` resumes the provider.
- Unit test that model/mode/context/branch metadata parts are included in the assistant timeline.
- Unit test that a selected account-level Provider resolves credentials server-side, writes per-chat Claude settings, passes raw model id, and passes `cwd = ~/.superset/chat/<sessionId>` into the provider.
- Unit test that a repo-local dev `SUPERSET_HOME_DIR` such as `superset-dev-data` is redirected to `~/.superset/dev-chat/<sessionId>` with `PWD`, `INIT_CWD`, and `OLDPWD` pinned to that same isolated directory.
- Unit test that inherited shell cwd markers such as `PWD`, `INIT_CWD`, and `OLDPWD` are overwritten to the per-chat cwd before invoking Claude.
- Unit test that tool progress and subagent events are persisted as timeline parts.
- Unit test that shared agent tool normalization maps Claude native names, ACP/local aliases, and Mastra command aliases to one canonical registry.
- Unit test that tool-like `subagent-event` payloads normalize to `tool_progress` while real subagent events remain `subagent_event`.
- Unit test that Agent Timeline display normalization routes `tool_progress(Bash)` and historical `subagent_event(local_bash)` to inline Shell rows.
- Unit test that approval decline records a `permission_resolved` part and clears pending approval.
- Unit test for Tool Card V2 display model normalization across Shell, Edit, and Subagent categories.
- Desktop smoke for `/chat`: create a new chat, send a prompt, verify the left session row appears quickly, assistant content streams, and title uses the first user message.
- Desktop smoke for tool use: create a new chat, choose a permission mode that allows shell execution, ask for `pwd`, and verify DOM/screenshot contains the Bash tool card and command output.
- Desktop smoke for Agent Timeline: verify repeated model/mode/branch metadata chips do not appear in normal assistant-message bodies, while Tool Card V2 Shell output and renderer console logs remain healthy.
- Desktop smoke for Manual approval: choose `Manual`, trigger a real write or shell request, verify the approval UI appears, click Approve, verify the runtime continues, then verify Decline clears a pending request and returns denial to the model.

### 7. Wrong vs Correct

#### Wrong

```ts
const assistantText = await requestProvider(...)
session.messages.push({ role: "assistant", content: assistantText })
await generateTitle({ modelId: input.metadata?.model, assistantText })
```

This blocks visible output and can overwrite the predictable first-message title with a slow or surprising model summary.

#### Correct

```ts
void generateAndUpdateTitle({ sessionId, userText })
session.currentMessage = assistantMessage
await requestProviderStream({ onDelta: appendToCurrentMessage })
session.messages.push(finalAssistantMessage)
```

This writes a predictable title early and streams assistant content without an extra title request.
