---
stability: FEATURE_SPEC
last_validated: 2026-05-19
prd_version: 1.0.0
functional_group: CHAT
---

# Use Cases: Chat UI (CHAT)

| ID | Title | Linear |
|----|-------|--------|
| UC-CHAT-01 | Reconcile the v2 chat transport + state architecture into a single canonical design | [SUPER-751](https://linear.app/superset-sh/issue/SUPER-751) |
| UC-CHAT-02 | Decide and implement the canonical builtin slash command set | [SUPER-754](https://linear.app/superset-sh/issue/SUPER-754) |
| UC-CHAT-03 | Collapse the chat composer's model-settings controls into one menu | [SUPER-755](https://linear.app/superset-sh/issue/SUPER-755) |
| UC-CHAT-04 | Stream new chat sessions without flicker or duplicated assistant messages | [SUPER-753](https://linear.app/superset-sh/issue/SUPER-753) |

---

## UC-CHAT-01 — Reconcile the v2 chat transport + state architecture into a single canonical design

**Linear:** [SUPER-751](https://linear.app/superset-sh/issue/SUPER-751) — Urgent

The v2 chat stack today is described by three overlapping in-repo plans (`plans/v2-chat-greenfield-architecture.md`, `plans/host-service-chat-architecture.md`, `plans/chat-mastra-rebuild-execplan.md`) and runs as a 4 fps dual-poll of `getDisplayState()` + `listMessages()`. Engineering has no single source of truth for what `ChatEvent`, `applyEvent`, `replayEvents(sessionId, fromSeq, toSeq)`, `workspace.watch`, and `session.watch` should look like across the local host-service runtime and the cloud-backed EventLog (Durable Object) path. This use case produces that doc and reconciles the protocol shape so it is identical across runtime locations. Scope is explicitly transport + state only — it does not migrate off tRPC, rewrite the Mastracode runtime, or touch the cloud router's product surface.

### Acceptance Criteria

- ☐ Engineer (Internal) can read one canonical chat-architecture document under `plans/` (or `apps/desktop/docs/`) that supersedes the three existing plan drafts for the v2 chat transport + state model
- ☐ Document defines the `ChatEvent` protocol shape with identical semantics whether the runtime is the local host-service or the cloud worker
- ☐ Document specifies how `applyEvent` and `replayEvents(sessionId, fromSeq, toSeq)` interact with the chat event log
- ☐ Document specifies the `workspace.watch` and `session.watch` subscription contracts that the desktop renderer consumes
- ☐ Document calls out that the host-service's authority scopes down in the cloud-backed EventLog (Durable Object) path and defines the resulting split
- ☐ Document explicitly records that transport + state is the only thing being changed — tRPC, the Mastracode runtime, and `chat_mastra_sessions` storage stay
- ☐ Engineer (Internal) can map every existing call site in `packages/chat/src/server/trpc/service.ts` (`getDisplayState`, `listMessages`, `sendMessage`) to its replacement in the new design
- ☐ System keeps the `chat_mastra_sessions` table shape compatible with the new event-log design or documents the required migration

---

## UC-CHAT-02 — Decide and implement the canonical builtin slash command set

**Linear:** [SUPER-754](https://linear.app/superset-sh/issue/SUPER-754) — Medium

The chat input ships builtin slash commands (`/new`, `/stop`, `/model`, `/login`, `/mcp`, plus prompt-template ones like `/review`, `/plan`, `/test`, `/refactor`). The list was assembled ad hoc and at least one is wrong: `/login` is described as "authenticate a provider" but its action dispatches to `set_model` with no argument, i.e. it silently aliases `/model`. We decide the canonical builtin set, fix `/login` (real auth flow or remove the alias), audit every other builtin for accurate action wiring and copy, and evaluate a Conductor-style dedicated management surface for builtins / MCP.

### Acceptance Criteria

- ☐ Product can reference a single approved list of canonical builtin slash commands documented in `packages/chat/src/server/desktop/slash-commands/builtins.ts`
- ☐ User can see an accurate description string and argument hint for every builtin slash command in the `SlashCommandMenu` and `SlashCommandPreviewPopover`
- ☐ `/login` either drives a real provider-auth flow or is renamed/removed so it no longer silently aliases `/model`
- ☐ Engineer (Internal) can find a written decision for each prompt-template builtin (`/review`, `/plan`, `/test`, `/refactor`) on whether it stays as a server-defined builtin or moves to the shared `.agents/commands` source
- ☐ User cannot trigger the "Unsupported slash command action" default branch in `useSlashCommandExecutor` for any action that ships in the approved builtin set
- ☐ Engineer (Internal) can reference a written evaluation (build / defer / reject) of a dedicated builtin / MCP management surface modeled after Conductor's UI
- ☐ Server-side builtin definitions in `packages/chat` stay in sync with renderer dispatch in `useSlashCommandExecutor.ts` — adding or removing a builtin updates both sides

---

## UC-CHAT-03 — Collapse the chat composer's model-settings controls into one menu

**Linear:** [SUPER-755](https://linear.app/superset-sh/issue/SUPER-755) — Low

The v2 chat composer footer currently renders three sibling pill buttons inside `PromptInputTools`: `PermissionModePicker`, `ModelPicker`, and `ThinkingToggle`. It reads cluttered. This use case replaces the three pills with a single consolidated trigger that opens one popover containing all three controls as grouped menu sections. It is a presentation-only refactor — no change to model / permission / thinking state or the props plumbed through `ChatInputFooter`.

### Acceptance Criteria

- ☐ User can open a single consolidated menu from the v2 chat composer footer that contains permission mode, model picker, and thinking level
- ☐ Composer footer renders exactly one trigger button in place of the three current sibling pills inside `ChatComposerControls.tsx`
- ☐ User can see the active model (and, when meaningful, the active permission mode) on the consolidated trigger button at a glance without opening the menu
- ☐ User can still set every setting that was reachable on the old three-pill layout — no setting is removed or hidden behind extra navigation
- ☐ Menu reuses the existing `ModelPicker`, `PermissionModePicker`, and `ThinkingToggle` internals rather than rewriting their logic
- ☐ System does not break `ModelPicker`'s own open / close state or its API-key setup navigation when the picker is nested inside the consolidated menu
- ☐ Engineer (Internal) can read a recorded decision on whether the v1 chat composer adopts the same consolidated menu for consistency

---

## UC-CHAT-04 — Stream new chat sessions without flicker or duplicated assistant messages

**Linear:** [SUPER-753](https://linear.app/superset-sh/issue/SUPER-753) — Low

Starting a new chat session is visibly janky: when the user sends a message the assistant message flickers and briefly shows a duplicated copy before self-healing. The root cause is that `useChatDisplay` runs `session.getDisplayState` and `session.listMessages` as two independent `useQuery` polls at 4 fps; the two responses land on different ticks, and dedupe logic (`withoutActiveTurnAssistantHistory()`, optimistic-message reconciliation) papers over the resulting race. This UC replaces the dual-poll model with a single push-based tRPC WS subscription that folds events into a client-side reducer, deletes the dedupe band-aids, and tightens the new-session start so the first assistant message renders directly from the stream.

### Acceptance Criteria

- ☐ User can start a new chat session and send the first message without seeing the assistant message flicker or render in duplicate
- ☐ Chat pane consumes a single push-based event stream rather than independently polling `getDisplayState` and `listMessages`
- ☐ System establishes the chat session id before the first user-message send so there is no "session still starting" gap visible to the user
- ☐ Engineer (Internal) can delete `withoutActiveTurnAssistantHistory()` and the optimistic user-message reconciliation `useEffect` from `use-chat-display.ts` once the stream lands
- ☐ Desktop tRPC subscription for `session.watch` is implemented using the observable pattern (not an async generator) so `trpc-electron` accepts it
- ☐ System emits a single canonical sequence of `ChatEvent`s that the client reducer consumes — no parallel state source the client must reconcile
- ☐ Remote-workspace users can see relay traffic for chat drop (qualitative bandwidth win) compared to the previous 4 fps dual-poll
- ☐ Regression test in `packages/chat/src/client/hooks/use-chat-display` verifies that a new session's first assistant message renders exactly once
