# Claude ACP Chat runtime

## Goal

Replace Superset's standalone Chat runtime with a Claude ACP-compatible runtime and make the Chat tab behave like an account-level host assistant, not a Workspace/Code pane.

## Requirements

- Standalone Chat must not require a Workspace, cwd, Task, Worktree, or Trellis context.
- Standalone Chat is allowed to perform useful host-level actions, such as system inspection, memory/process diagnostics, safe maintenance commands, file lookup, and other explicitly controlled assistant operations.
- Standalone Chat should expose the full Claude Code CLI capability surface by default, including tool use, shell execution, and file operations.
- Permission mode controls must be wired to the runtime instead of being cosmetic UI.
- Standalone Chat backend must stop using the current direct provider fetch path for normal responses and instead route through a Claude ACP-compatible adapter.
- The adapter must expose a Superset-owned interface so future Chat providers such as Codex, Gemini, OpenCode, Pi, and Cursor can be added without rewriting the renderer again.
- The implementation may study `getpaseo/paseo`, but must not copy substantial AGPL-licensed code into Superset.
- Existing Code/Task chat behavior that still depends on Mastra/MastraCode must remain untouched unless explicitly changed in this task.
- Messages remain account-synced through the existing cloud Chat session/message tables. Old internal Chat history does not need backward compatibility during this internal beta.
- User messages should create or reveal the left-sidebar conversation row immediately.
- Creating a new standalone Chat must create the cloud `chat_sessions` row before enabling history/display polling or sending the first runtime request. New sessions must not briefly show `Loading conversation`, `Chat session not found`, or a blank canvas before Thinking starts.
- The first user message in a newly created standalone Chat must remain visible as an optimistic/pending user bubble while the route switches from `/chat` to `/chat?chatSessionId=...`; the empty `Start a conversation` state must not be shown once send has started.
- Assistant replies must stream visibly while the request is running. A blank waiting state after submit is a regression.
- Thinking/reasoning content must remain visible as part of the turn state/history instead of flashing and disappearing.
- Chat title generation should use the first submitted user message, normalized and truncated. It must not make a second slow model call.
- The Chat composer must expose Claude-compatible model and thinking controls in the input area.
- Standalone Chat model selection must use account-level Model Providers when configured; local Claude Code defaults are fallback only.
- Selected model Provider metadata must stay renderer-safe: the renderer sends `modelProviderId` and raw `modelId`, while the backend resolves credentials.
- Standalone Chat must run each conversation from an isolated per-chat directory and write Claude-compatible `.claude/settings.local.json` there when a Provider-backed model is selected. Production uses `~/.superset/chat/<sessionId>`; dev uses `~/.superset/dev-chat/<sessionId>` when the app's `SUPERSET_HOME_DIR` points at the repo-local `superset-dev-data`.
- Standalone Chat must also force Claude's subprocess environment (`PWD`, `INIT_CWD`, and `OLDPWD`) to the per-chat cwd. Passing only the SDK `cwd` is not enough because dev/desktop parent processes can expose the Superset source checkout through inherited shell environment.
- Standalone Chat must not infer or inspect the Superset app source checkout, `.trellis`, or `AGENTS.md` unless the user explicitly asks for that path. Host assistant context starts from the isolated chat cwd.
- Claude Code tool calls and tool results must stream into the assistant turn as structured parts, not as plain JSON/text.
- Tool execution cards must render for Claude native tools such as `Bash`, `Read`, `Write`, `Edit`, `Grep`, `Glob`, `WebFetch`, `WebSearch`, `Task`, and `Skill`.
- Claude permission modes must expose the current SDK modes: `auto`, `bypassPermissions`, `acceptEdits`, `plan`, `default`, and `dontAsk`.
- Errors must be selectable and explain missing Claude/ACP setup or runtime launch failures without leaking tokens or secrets.
- Standalone Chat must expose a Superset-owned Agent Event Timeline layer that can persist and render `text`, `reasoning`, `tool_call`, `tool_result`, `permission_requested`, `permission_resolved`, `tool_progress`, `mode_changed`, `model_changed`, `subagent_event`, attachment/context, and branch marker events.
- Model/mode/branch marker timeline metadata must not render as default assistant-message body chips on every turn. Composer controls already show the active model and mode; repeated body chips are visual noise.
- Tool rendering must normalize Claude/Paseo-style tool activity into a unified display model: Shell, Read, Edit, Write, Search, Fetch, Subagent, Skill, and Unknown. The UI should have one coherent event/card language even when future adapters emit different raw tool names.
- Tool name and tool-kind normalization must live in a shared Chat layer, not in scattered renderer conditionals. Backend runtime, ToolCallBlock, Agent Timeline, and future ACP providers must all use the same registry for aliases such as `Bash`, `local_bash`, `run_command`, `Read`, `Edit`, `Task`, and `Skill`.
- Superset should follow Paseo's protocol/display split: raw provider events are normalized into canonical agent events first, then rendered through display models. Renderer components must not infer major semantics from raw provider event names when a shared normalizer can classify them.
- Tool execution events should render as compact inline timeline rows by default, matching the previous Superset `ToolCallRow` pattern and Paseo-style execution logs. They may expand into parameter/output details on click, but the collapsed state must not look like a large standalone card.
- Claude ACP/local adapter shell aliases such as `local_bash`, `local_shell`, and `local_command` must normalize into the same Shell display model as `Bash`; they must not fall back to the legacy generic tool-call card, including failure states.
- Tool-like subagent/task/hook events must not persist or render as real `subagent_event` cards. If `subagentType` is a known tool alias such as `local_bash`, normalize it into tool progress/display instead. Real subagent lifecycle events, such as `general-purpose` task progress, remain subagent timeline events.
- Manual approval must be visible as timeline history, not just a temporary modal: request appears, Approve/Decline resolves it, and the model receives the decision.
- Claude SDK task/subagent/progress/hook events must be captured and shown as collapsible execution flow where possible.
- Claude SDK must not receive a Superset-imposed `maxTurns` cap for standalone Chat. The old 5-turn smoke-test limit is too low for host-assistant workflows, and a fixed 40-turn cap is still an arbitrary interruption. Users can stop runaway work through the Stop control; if Claude reports a max-turn failure, treat it as Claude Code CLI/configuration behavior or a tool loop.
- Standalone Chat runtime failures must be traceable from app logs, not only visible in the UI. In development, log Claude turn start/completion/failure with prompt, cwd, provider/model/mode metadata, event counters, tool names, raw error stack, and normalized error messages so max-turn and tool-loop failures can be diagnosed immediately.
- Files, images, URLs, and tool-produced artifacts must be representable as context chips/attachments in the conversation timeline.
- Branch conversations can remain a later runtime feature, but this task must reserve the persisted event type and visible UI entry point so the Chat architecture does not need another schema rewrite.

## Acceptance Criteria

- [x] Sending a standalone Chat message uses the Claude ACP-compatible runtime path rather than the direct provider HTTP path.
- [x] The current session appears in the Chat sidebar immediately after the first message is submitted.
- [x] Assistant text streams into the active conversation before the backend call resolves.
- [x] Reasoning/thinking content stays attached to the assistant turn after completion.
- [x] Model and thinking selections are passed to the runtime for the submitted turn.
- [x] Account-level Provider models populate standalone Chat model selection ahead of local fallback models.
- [x] Provider-backed model selections pass raw model IDs to Claude and inject backend-resolved `ANTHROPIC_*` env into the per-chat cwd.
- [x] Claude runtime receives `cwd`, `PWD`, `INIT_CWD`, and `OLDPWD` all pinned to the per-chat cwd, preventing standalone Chat from accidentally treating the Superset source checkout as project context.
- [x] Claude runtime receives full Claude Code tool access in the default Auto mode.
- [x] Permission mode selection is passed to the runtime.
- [x] Claude SDK tool calls stream into `tool_call` content parts and matching tool results persist as `tool_result` parts.
- [x] Claude native tool names render through the existing Superset tool card components.
- [x] Chat composer exposes Claude SDK permission modes beyond the previous three-mode subset.
- [x] Standalone Chat exposes Claude SDK approval requests through Superset's pending approval state and resumes after Approve/Decline.
- [x] Agent Event Timeline content types are accepted by DB type, tRPC validation, runtime state, and renderer history hydration.
- [x] Permission requested/resolved events are persisted in the assistant timeline and render near the related tool execution.
- [x] Claude SDK `tool_progress`, task/subagent, hook, model, and mode events map into Superset timeline parts without leaking raw SDK payloads.
- [x] Tool Card V2 uses a unified display model for Shell / Read / Edit / Write / Search / Fetch / Subagent / Skill / Unknown and keeps existing Superset-specific tool cards working.
- [x] Tool name aliases are centralized in `@superset/chat/shared` so backend runtime, ToolCallBlock, Agent Timeline, and tests use one canonical registry instead of duplicate local lists.
- [x] Tool Card V2 renders tool execution as compact inline rows by default, with click-to-expand details, instead of large card blocks that compete with assistant text.
- [x] Claude ACP/local shell aliases such as `local_bash` render through Tool Card V2 compact Shell rows instead of the legacy generic card.
- [x] Tool-like `subagent_event` records normalize away from subagent cards: new runtime events persist as tool progress, while previously persisted `subagent_event(local_bash)` history renders through the same inline Shell display model.
- [x] Context chips render for file/image/URL/tool-artifact attachments.
- [x] Claude SDK max-turn handling does not pass a Superset turn cap and surfaces a clear diagnostic error if Claude Code still reports a max-turn failure.
- [x] Claude standalone runtime start/completion/failure is logged to the desktop log sink with safe diagnostic metadata.
- [x] Branch conversation runtime structure exists, but the placeholder is not shown in every assistant message by default.
- [x] E2E covers Manual approval request, Approve continuation, and Decline denial with a real write-file scenario.
- [x] Switching away and back to a conversation hydrates persisted messages from cloud storage.
- [x] Switching back to a previously hydrated conversation returns cached history immediately and refreshes stale cloud history in the background.
- [x] New standalone Chat creation waits for session persistence before history polling or first send, preventing the `Chat session not found` race that only appeared on fresh conversations.
- [x] New standalone Chat sends keep the first pending user message visible across the initial route/session switch, so the UI shows the user bubble plus Thinking/tool progress instead of the empty conversation state.
- [x] Chat session optimistic inserts do not wait for Electric txid catch-up after the API mutation succeeds, preventing `[chat_sessions-...] Timeout waiting for txId` toasts when Electric lags.
- [x] A focused backend test covers streaming, first-message titles, thinking persistence, and provider/runtime error persistence.
- [x] Desktop smoke opens `/chat`, sends a prompt with a Claude-compatible model/thinking selection, captures a screenshot, and records renderer console errors.

## Notes

- Paseo is AGPL-3.0-or-later. It is architecture reference only.
- Current dirty work from `06-11-standalone-chat-mode` is intentionally not reverted; this task builds on its account-level Chat route and cloud message table.

## Validation

- `bun test packages/chat/src/server/trpc/standalone-runtime.test.ts apps/desktop/runtime-dependencies.test.ts`
- `bun --filter @superset/chat typecheck`
- `bun --filter @superset/desktop typecheck`
- `bun run lint:fix`
- `bun run lint`
- `bun test packages/chat/src/server/trpc/standalone-runtime.test.ts` verifies Provider credential resolution, raw model ID passing, per-chat cwd creation, and `.claude/settings.local.json` env injection.
- `bun test packages/chat/src/server/trpc/standalone-runtime.test.ts packages/chat/src/client/hooks/use-chat-display/use-chat-display.test.ts packages/chat/src/client/hooks/use-chat-display/use-chat-display-race.test.ts` verifies cached conversation switching is non-blocking and active-turn history stays deduped.
- Desktop Automation smoke on `http://localhost:3005/#/chat`: created a new standalone chat, sent `用一句话回答：Superset Claude host assistant runtime final smoke ok`, verified the sidebar title updated from the first message, verified assistant output appeared, and verified renderer console logs were empty.
- Real Claude provider smoke: sent `Run the shell command pwd, then answer with the directory path only.` through `ClaudeStandaloneChatProvider` using `gpt-5.5` and `bypassPermissions`; verified structured events `tool-call`, `tool-call`, `tool-result` and final text `/Users/bichengyu`.
- Real Claude provider approval probe: sent the same `pwd` prompt in `default` mode with a `requestToolApproval` callback. Claude SDK auto-allowed the safe command and did not call the approval callback; the callback path is covered by `standalone-runtime.test.ts`.
- Desktop Automation tool-card smoke on `http://localhost:3005/#/chat`: created a new Chat, selected `Bypass`, sent `请运行 pwd 并只返回当前目录路径。`, verified DOM contained `Bash`, `pwd`, and `/Users/bichengyu`, captured screenshot, and verified renderer console logs were empty.
- Desktop Automation Agent Timeline smoke on `http://localhost:3005/#/chat`: created a new Chat, sent `请运行 pwd 并只返回当前目录路径。`, verified DOM contained `Shell`, `Branch conversations`, and `/Users/bichengyu`, captured screenshot, and verified renderer console logs were empty.
- Desktop Automation Manual approval smoke on `http://localhost:3005/#/chat`: selected `Manual`, sent a `/tmp/superset-acp-approval-smoke.txt` write scenario, verified permission request UI with `Approve`/`Decline`, clicked `Approve` and observed `Approved Write` / `Approved Bash` timeline events plus continued tool execution, then clicked `Decline` on a retry request and verified the pending approval cleared with renderer console logs empty. Claude generated a malformed one-line heredoc in the first write attempt and did not leave the file behind; the approval request/resolution/runtime continuation path was still verified at the UI/runtime layer.
- Desktop Automation inline tool row regression on `http://localhost:3005/#/chat`: created a fresh standalone Chat, sent `请运行 pwd 并只返回当前目录路径。`, verified `Shell pwd` rendered as a single compact inline row, clicked the row, verified `Command` / `Stdout` details expanded, verified `/Users/bichengyu` output appeared, and confirmed no new renderer console logs after clearing prior dev logs.
- Desktop Automation new-session race regression on `http://localhost:3005/#/chat`: clicked `New chat`, verified the route had no `chatSessionId` and the canvas showed the empty state, sent `新建会话竞态修复 smoke，请用一句话回答 ok`, verified the left sidebar row/title appeared immediately, verified the assistant replied `ok`, and confirmed renderer console logs stayed empty with no `Chat session not found`.
- Desktop Automation pending-user regression on `http://localhost:3005/#/chat`: clicked `New chat`, sent `新会话发送后应该先显示我的消息再 Thinking`, verified the user bubble stayed visible while tool/Thinking progress started, verified `Start a conversation` was absent after submit, captured `artifacts/chat-new-session-pending-user-visible.png`, and confirmed renderer console logs stayed empty with no Electric txid timeout.
- Desktop Automation cwd-isolation regression on `http://localhost:3005/#/chat`: restarted the desktop main process, clicked `New chat`, sent `请只使用 Bash 执行：echo $PWD && pwd。只返回两行命令输出，不要解释。`, verified the runtime log used `cwd: /Users/bichengyu/.superset/dev-chat/c63ac069-310c-4c4f-aa16-ba20581e82fd`, verified both `$PWD` and `pwd` returned `/Users/bichengyu/.superset/dev-chat/c63ac069-310c-4c4f-aa16-ba20581e82fd`, confirmed the per-chat directory contains only its own `.claude/settings.local.json` and no `.trellis` / `AGENTS.md`, captured `artifacts/chat-send-immediate.png` and `artifacts/chat-cwd-complete.png`, and confirmed the first frame after submit showed the user bubble plus Thinking instead of the empty `Start a conversation` state.
- Desktop Automation Thinking stability regression on `http://localhost:3005/#/chat`: sent `Thinking 不要闪烁复测：请只回答 ok。`, verified the first visible frame kept the user bubble plus a single stable `Thinking...` assistant placeholder, verified completion rendered one `Thinking` block plus `ok`, captured `artifacts/chat-thinking-stability-after-empty-text-fix-immediate.png` and `artifacts/chat-thinking-stability-after-empty-text-fix-later.png`, and confirmed renderer console logs stayed empty. Root cause was twofold: the streaming assistant React key changed across optimistic/persisted/session transitions, and empty streaming text parts counted as visible assistant content, briefly removing the pending Thinking shimmer before real reasoning/text arrived.
- Desktop Automation new-session completion cache regression on `http://localhost:3005/#/chat`: clicked `New chat`, sent `缓存刷新复测：请只回答 ok。` with `gpt-5.5`, verified the completed conversation stayed selected and rendered both the user bubble and assistant `ok`, captured `artifacts/chat-new-session-refetch-after-client-query-complete.png`, and confirmed renderer console logs were empty. Root cause was the fast new-session path manually seeding `listMessages` with an optimistic user message, then relying on query invalidation/observer timing after the runtime completed; successful sends now query `listMessages` / `getDisplayState` through the raw tRPC client and write both results into React Query cache.
- Unit regression for Claude ACP/local shell aliases: `local_bash` normalizes into the compact Shell display model and surfaces `errorText` as expandable stderr/error details instead of using the legacy generic card.
- Unit regression for shared agent tool normalization: Claude native names, ACP/local aliases, and Mastra command aliases map to one canonical display registry, while specialized Superset tools stay on their dedicated renderers.
- Unit regression for timeline display normalization: `tool_progress(Bash)` and historical `subagent_event(local_bash)` both render through inline Shell rows, while real `subagent_event(general-purpose)` remains on the native subagent timeline.
- Unit regression for runtime persistence normalization: provider `subagent-event` payloads with `subagentType: "local_bash"` persist as `tool_progress`, not as `subagent_event`.
- Unit regression for max-turn failures: raw Claude `Reached maximum number of turns (5)` errors are persisted and thrown as a diagnostic message that says Superset standalone Chat does not set a turn cap.
- Unit regression for max-turn logging: raw SDK max-turn errors are emitted through the injected runtime logger with session/model/mode/maxTurns metadata and normalized error text.
- Smoke screenshots:
  - `.trellis/tasks/06-11-claude-acp-chat-runtime/artifacts/chat-acp-before-final-smoke.png`
  - `.trellis/tasks/06-11-claude-acp-chat-runtime/artifacts/chat-acp-after-final-smoke.png`
  - `.trellis/tasks/06-11-claude-acp-chat-runtime/artifacts/chat-acp-controls-after-tool-events.png`
  - `.trellis/tasks/06-11-claude-acp-chat-runtime/artifacts/chat-acp-tool-card-smoke.png`
  - `.trellis/tasks/06-11-claude-acp-chat-runtime/artifacts/chat-agent-timeline-before-send.png`
  - `.trellis/tasks/06-11-claude-acp-chat-runtime/artifacts/chat-agent-timeline-tool-card-v2-smoke.png`
  - `.trellis/tasks/06-11-claude-acp-chat-runtime/artifacts/chat-agent-timeline-manual-approval-request.png`
  - `.trellis/tasks/06-11-claude-acp-chat-runtime/artifacts/chat-agent-timeline-manual-approval-after-failed-command.png`
  - `.trellis/tasks/06-11-claude-acp-chat-runtime/artifacts/chat-agent-timeline-manual-approval-resolved.png`
  - `.trellis/tasks/06-11-claude-acp-chat-runtime/artifacts/chat-agent-inline-tool-row-pwd-smoke.png`
  - `.trellis/tasks/06-11-claude-acp-chat-runtime/artifacts/chat-agent-inline-tool-row-expanded-pwd-smoke.png`
  - `.trellis/tasks/06-11-claude-acp-chat-runtime/artifacts/chat-thinking-stability-after-empty-text-fix-immediate.png`
  - `.trellis/tasks/06-11-claude-acp-chat-runtime/artifacts/chat-thinking-stability-after-empty-text-fix-later.png`
  - `.trellis/tasks/06-11-claude-acp-chat-runtime/artifacts/chat-new-session-refetch-after-client-query-complete.png`

## Follow-Ups

- Add a stable send-button selector/test id for Desktop Automation. The generic `form button:last-of-type` selector clicked the thinking control because the composer has multiple buttons.
