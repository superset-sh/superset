# Standalone Chat mode implementation

## Checklist

- [x] Update `chat.createSession` to support standalone session rows.
- [x] Add or adapt a standalone Chat controller for `/chat`.
- [x] Replace `/chat` workspace picker with a real chat page.
- [x] Change Chat mode navigation to always target `/chat`.
- [x] Change Chat sidebar to list and manage global sessions only.
- [x] Keep old workspace-scoped Chat code out of primary Chat navigation.
- [x] Add focused tests for session filtering/creation and navigation helpers where practical.
- [x] Run focused tests, `bun run lint:fix`, and `bun run lint`.
- [x] Run desktop smoke for `/chat` if the local service graph is available.
- [x] Generate standalone Chat titles from the first submitted user message for immediate, predictable labels.
- [x] Create standalone chat sessions optimistically so the current conversation appears in the sidebar immediately.
- [x] Stream standalone Chat provider responses through `currentMessage` instead of waiting for the full response.
- [x] Remove the separate title-model request so Chat titles are not delayed or unexpectedly overwritten.
- [x] Clear stale message query data when standalone Chat switches to a null/new session.
- [x] Apply a local fallback title immediately after the first submitted user message, then let the lightweight generated title replace it when sync completes.
- [x] Stop auto-creating empty standalone Chat sessions on `/chat`; create the cloud session only when the user sends the first message.
- [x] Add main-process renderer recovery so a gone/unresponsive renderer reloads instead of leaving a permanent white window.
- [x] Remove the redundant standalone Chat main-panel title/header actions; Chat mode now relies on the app-level tab and sidebar New chat button.
- [x] Hide the global dashboard TopBar on `/chat` so the pure chat surface starts at the top with only the in-pane gradient overlay.
- [x] Add a right-click menu to the standalone Chat sidebar rows with copy title, copy link, copy as Markdown, and delete actions.
- [x] Add standalone-only top breathing room to the Chat message canvas after removing the global TopBar.
- [x] Change sidebar copied links from dev renderer URLs to desktop deep links and label them as app links.
- [x] Persist standalone Chat messages in cloud `chat_messages` rows instead of keeping history only in the runtime Map.
- [x] Hydrate standalone Chat history from `chat.listMessages` when opening/switching to a session whose runtime cache is empty.
- [x] Persist user, assistant, and assistant error messages; delete the old branch when resending/editing from a user message.
- [x] Throttle cloud message refreshes so cross-device session changes can appear without 60fps API polling.
- [x] Generate a clean Drizzle migration for `chat_messages`; the initial bad migration was caused by a missing `0058_snapshot.json` for the prior model-provider migration.
- [x] Add standalone URL context fetching so pasted web links are read before provider calls instead of relying on the model to browse.
- [x] Tune standalone assistant markdown density and inline-code wrapping so long URLs and list-heavy answers do not render as oversized broken blocks.

## Validation Commands

```bash
bun test <focused test files>
bun run lint:fix
bun run lint
bun run desktop:automation -- smoke --url-includes "#/chat" --screenshot .trellis/tasks/06-11-standalone-chat-mode/artifacts/chat.png --report .trellis/tasks/06-11-standalone-chat-mode/artifacts/chat.json
```

## Smoke Notes

- 2026-06-11: Real desktop `/chat` smoke with `gpt-5.5` passed. A prompt about standalone Chat design produced the sidebar title `独立Chat设计`.
- 2026-06-11: Real desktop `/chat` smoke with `gpt-5.5` passed. A prompt about Chat vs Code boundaries produced the sidebar title `Chat 与 Code 边界`.
- 2026-06-11: Real desktop `/chat` smoke passed after optimistic session + streaming changes. Clicking New chat inserted a sidebar row immediately; sending a `gpt-5.5` prompt produced visible assistant text during the response and updated the title to `流式输出必要性` within the first couple seconds.
- 2026-06-11: Real desktop `/chat` smoke passed for new-session clearing and local fallback titles. Clicking New chat cleared stale previous messages; sending `测试新聊天列表标题是否立即出现。` immediately moved the new session to the sidebar with the fallback title. Dev console showed an Electric txId wait timeout for persistence, so generated title replacement can still depend on sync health.
- 2026-06-11: Investigated desktop white-screen incident. The renderer target stopped responding to CDP and the Electron process tree no longer showed a renderer helper, while Vite and the main process were still alive. Restart restored the UI. Follow-up fix removed empty-session auto-creation on `/chat`, added guarded renderer reload recovery for `render-process-gone` and long `unresponsive` events, and verified a new empty Chat now creates a session only on first send. Smoke prompt `白屏修复后再测一次即时标题。` created `chatSessionId=1b4fced7-46b7-471a-bb93-d1618f9ba6b3`, immediately showed sidebar title `白屏修复后复测`, and produced no console errors.
- 2026-06-11: Desktop visual smoke passed for the Chat header cleanup. Screenshot artifact `artifacts/standalone-chat-topbar-removed.png` shows the redundant main header and the global 48px dashboard TopBar removed on `/chat`; the chat content starts at the top with the in-pane gradient overlay.
- 2026-06-11: Desktop context-menu smoke passed for sidebar session rows. Screenshot artifact `artifacts/standalone-chat-context-menu-dispatched.png` shows `Copy title`, `Copy link`, `Copy as Markdown`, and `Delete`; no console errors were emitted while opening the menu.
- 2026-06-11: Desktop visual smoke passed after adding standalone-only top breathing room. Screenshot artifact `artifacts/standalone-chat-spacious-top.png` shows the empty state no longer pinned near the top edge after removing the global TopBar.
- 2026-06-11: Desktop context-menu smoke passed after changing copied links to app deep links. Screenshot artifact `artifacts/standalone-chat-app-link-menu.png` shows `Copy app link`; no console errors were emitted while opening the menu.
- 2026-06-11: Fixed empty history after switching Chat sessions. Root cause was split persistence: the sidebar synced cloud `chat_sessions`, but standalone messages lived only in `StandaloneChatRuntimeManager.sessions`. Added cloud `chat_messages`, tRPC list/append/delete-from procedures, runtime hydration before list/send/restart, and a focused unit test for hydrating persisted history.
- 2026-06-11: Fixed the `Loading conversation...` hang. Root cause was `chat.listMessages` returning 500 because the active dev database did not have the new `chat_messages` table. Generated `0059_add_chat_messages.sql`, repaired the missing prior migration snapshot so the generated SQL only touches `chat_messages`, manually applied the table to the current dev database for verification, then confirmed `chat.listMessages`/`chat.appendMessage` returned 200 and switching sessions restored persisted messages.
- 2026-06-11: Fixed poor URL handling and oversized markdown in standalone Chat. Root cause was provider-only "bare chat": pasted URLs were sent only as user text, so models could answer with generic no-browsing disclaimers. Added best-effort URL text fetch with bounded streaming reads, injected fetched excerpts as transient system context, added unit coverage for URL context injection, and verified against `https://arxiv.org/html/2603.23509v1` after restarting desktop dev. Screenshot artifact: `artifacts/chat-url-fetch-after-restart.png`.

## Risks

- The old workspace chat pane has more Code-specific UI affordances than a pure ChatGPT page. Keep the standalone route minimal and avoid introducing Workspace requirements.
- Chat runtime without `cwd` defaults to the desktop process working directory. This is acceptable for phase one because the user intent is pure chat, not project-aware code execution.
- Provider/model data is account-scoped; standalone Chat should prefer cloud/provider model lists and not depend on a host service being online.
- Title model selection is heuristic because providers and model IDs are user-defined. Prefer explicit title-model configuration later if users need deterministic control.
- The new `chat_messages` table requires a Drizzle-generated migration and backend deployment before packaged/dev clients can persist or hydrate standalone Chat history against a real database.
