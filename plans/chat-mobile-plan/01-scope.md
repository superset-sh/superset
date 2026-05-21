---
stability: FEATURE_SPEC
last_validated: 2026-05-21
prd_version: 1.0.0
scope_posture: full
---

# Mobile Chat (v0) — Scope

## Scope Posture

**Full feature** (kb-prd-plan default). v0 ships a complete, polished mobile chat experience scoped to read/respond/initiate on remote-or-cloud hosts. Features that build *on top of* chat (attachments, file mentions, linked tasks) belong to separate downstream PRDs and are explicitly deferred below.

## In Scope

- **Session listing per workspace** via existing ElectricSQL `chat_sessions` shape (already published at `apps/electric-proxy/src/where.ts:136-137`), filtered by `activeOrganizationId` and `v2WorkspaceId`, ordered by `lastActiveAt` descending.
- **Session lifecycle**: start a new session, resume an existing one, end (dispose) a session, delete a session permanently with confirmation, rename a session title.
- **Auto-generated session titles** after first turn (host-service handles generation; mobile renders the synced value).
- **Message composition**: multiline text input via Tiptap (`@10play/tentap-editor`) for parity with desktop's slash-command and file-mention rendering.
- **Slash commands**: type `/` to open a popover with available commands from `chat.getSlashCommands`, preview expansion via `chat.previewSlashCommand`, resolve via `chat.resolveSlashCommand`. Mobile-friendly popover, not inline autocomplete.
- **Send / stop**: submit a message via `chat.sendMessage`, see optimistic append, stop a running turn via `chat.stop`.
- **Composer controls**: model picker (from `chat.getModels`), thinking-level picker (`off | low | medium | high | xhigh`), permission-mode picker — all rendered as `@rn-primitives/popover` panels.
- **Message rendering**: user messages (text), assistant messages (streaming text + parts), markdown (code blocks, lists, links, tables, inline code via `react-native-markdown-display` or equivalent), tool call blocks (collapsed by default), plan blocks (read-only render), reasoning blocks (collapsed extended-thinking), subagent execution (nested read-only group).
- **List virtualization** via `@shopify/flash-list` for histories ≥50 messages.
- **Auto-scroll to bottom + scroll-back affordance** using FlashList `inverted` or `maintainVisibleContentPosition`, with a Reanimated-faded scroll-back button.
- **Mid-turn interactive prompts** with container chosen per interaction shape (see UC-PAUSE-* and the Design Rationale section in `07-uc-pause.md` for the full evidence trail):
  - **Tool approval** → **inline card in the message stream + sticky thumb-docked action footer** (Approve / Decline / Always-allow-category). Queues 1-of-N when multiple approvals are pending. Mirrors Continue.dev's developer-tool chat pattern; preserves conversation context for frequent decisions. → `chat.respondToApproval`
  - **`ask_user` question** → **bottom sheet** (`@gorhom/bottom-sheet` with `BottomSheetTextInput`) for freeform answer + optional suggested-pill prefills. Keyboard handling is the decisive factor. → `chat.respondToQuestion`
  - **Plan approval** → **full-screen modal as a pushed expo-router route** (`/chat/[sessionId]/plan-review/[planId]`). Plan markdown gets full vertical scroll with docked Approve/Reject buttons; matches Apple HIG's recommendation of full-screen modals for "in-depth content or a task that involves multiple steps." → `chat.respondToPlan`
- **Pending-action indicator** (`PendingActionIndicator`): floating "Tap to respond" pill near the chat input that surfaces when a session has an active pause and the user has scrolled away from the inline card OR dismissed the sheet/modal without responding. Tapping it returns the user to the relevant container.
- **Multi-device session sync**: a session created on desktop or via Slack agent appears in mobile's session list in realtime (via `chat_sessions` Electric shape).
- **Push notifications** (Expo push) wired to host-service `notificationsEmitter` / `AGENT_LIFECYCLE` events: agent turn complete, agent paused for user input, agent failed.
- **Host-offline UX**: clear UI state when the user's host-service is unreachable; automatic reconnect when host returns.
- **Session resume after background/foreground**: app catches up missed events using `stream-next-offset` / cursor protocol on resume.
- **Authentication via JWT bearer** routed through the relay; mobile mints / refreshes per the chosen sub-decision (see TRD).
- **Component tree at `apps/mobile/components/chat/`** mirroring desktop component names (ChatInterface, MessageList, MessagePartsRenderer, UserMessage, AssistantMessage, ThinkingMessage, PendingApprovalMessage, PendingQuestionMessage, PendingPlanApprovalMessage, ToolCallBlock, ChatInputFooter, ModelPicker, SlashCommandMenu).
- **Tailwind/uniwind design parity** for the ~80% of desktop chat classes that compile under uniwind; mechanical translations applied per the design audit (`space-y-* → gap-*`, `transition-* → Reanimated`, `hover:* → active:*`, `dark:* → @variant dark` tokens).

## Out of Scope

- **Attachments** (file picker, image picker, drag-drop) — `[DEFERRED: separate PRD]`. Desktop's `ChatInputDropZone`, `FileDropOverlay`, `useDocumentDrag`, and the Plus menu file-attach flows are explicitly excluded from v0.
- **File mentions** (`@src/foo.ts` autocomplete from the host's workspace file tree) — `[DEFERRED: separate PRD]`. The Tiptap node infrastructure is included via `tentap-editor`, but the file-search autocomplete + `FileMentionNode` rendering on the host's behalf is v1.
- **User mentions** (`@username` for team contexts) — `[DEFERRED: separate PRD]`. Depends on teams shipping mobile-side first.
- **Linked issues / linked tasks** (Linear ticket attachment in chat input, `LinkedIssuePill`, `IssueLinkCommand`) — `[DEFERRED: separate PRD]`.
- **Plus menu and overflow actions** — `[DEFERRED: separate PRD]`. Most plus items are attachment-related.
- **Restart-from-message** (branch a conversation from a prior message) — `[DEFERRED: separate PRD]`. Host-service procedure exists (`chat.restartFromMessage`); mobile defers the UI.
- **Edit-last-user-message** (re-send a different message) — `[DEFERRED: separate PRD]`.
- **MCP overview** (which MCP servers and tools are wired into this session) — `[DEFERRED: separate PRD]`. Read-only info; not blocking.
- **Local chat code execution on the mobile device** — explicitly NOT supported. Mobile chat targets remote/cloud hosts only (scope statement). Sessions that need a local user-machine host do not work from mobile.
- **Rich text formatting in composed messages** (bold, italic, lists, headings). Desktop's Tiptap doesn't expose these either in the prompt editor; v0 keeps text + slash + mention only.
- **Multi-keystroke shortcuts** (Cmd+Enter, etc.) — replaced by on-screen Send button. Mobile has no Cmd/Ctrl modifier model.
- **Pure-Electric message persistence** (mirroring host runtime memory into a `chat_messages` table for shape-based sync) — `[DEFERRED: separate PRD]`. v0 reads messages via relay-routed tRPC, not Electric. This decision can be revisited if the chat-v2 PRD's "host SQLite event log" lands.
- **Cross-platform UI component library** (shared `packages/chat-ui` consumed by both web and RN) — explicitly rejected per cadra-app reference and design audit. Mobile and desktop maintain parallel implementations with name and Tailwind parity, no code reuse.

## Scope size check

v0 reads as one shippable initiative organized around five tight functional groups (session lifecycle, composition, rendering, mid-turn interactive prompts, platform integration). Each group corresponds to a sprintable unit of work with a clear human-testable gate. The Tiptap port carries the bulk of the implementation risk; the rest is mechanical against existing transport and UI primitives.

If sprints reveal that a group (especially `RENDER` or `COMP`) needs splitting, run `/kb-sprint-plan --delta-replan`; do not retroactively widen this PRD.
