---
stability: FEATURE_SPEC
last_validated: 2026-05-21
prd_version: 1.3.0
scope_posture: full
---

# Mobile Chat v2 — Scope

## Scope Posture

**Full feature** (kb-prd-plan default). Mobile-chat v2 ships a complete, polished mobile chat experience scoped to read/respond/initiate on remote-or-cloud hosts. Features that build *on top of* chat (attachments, file mentions, linked tasks) belong to separate downstream PRDs and are explicitly deferred below.

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

Each item below is tagged `[DEFERRED: separate PRD]` (could ship later as its own initiative) or `[NOT SUPPORTED]` (architectural/product decision; will not ship in any subsequent PRD without changing this assumption). Every item carries a one-sentence **Why** grounded in the conversation that produced this PRD.

- **Attachments — file picker, image picker, drag-drop, paste-image** — `[DEFERRED: separate PRD]`. Desktop's `ChatInputDropZone`, `FileDropOverlay`, `useDocumentDrag`, and the Plus-menu attach flows are excluded.
  **Why:** The user's scope statement was explicit — "allow sending messages for remote/cloud work" — text only. Attachments require `expo-document-picker` + `expo-image-picker` + the upload-to-`chat_attachments` flow. Adding them would push mobile-chat v2 over a single shippable initiative; better to validate the text-message platform end-to-end first.

- **File mentions** (`@src/foo.ts` autocomplete from the host's workspace file tree) — `[DEFERRED: separate PRD]`. The Tiptap node infrastructure is included via `tentap-editor` so a future mobile-chat PRD can layer this on without re-platforming.
  **Why:** Two reasons. (1) The host runs on a remote/cloud machine — mobile users don't carry a working mental map of that host's FS, so file-mentions are inherently less useful on mobile than desktop. (2) Implementing them requires the host file-search autocomplete UI + `FileMentionNode` port — meaningful work beyond mobile-chat v2's "list / read / send" scope. Better to ship the Tiptap shell first and confirm WebView perf before extending it.

- **User mentions** (`@username` for team contexts) — `[DEFERRED: separate PRD]`.
  **Why:** Mentions depend on team-membership infrastructure (`members` table + a mobile-side directory) that may not even exist yet on mobile. Mobile-chat v2 shouldn't block on cross-cutting team features whose timing it can't control.

- **Linked issues / linked tasks** (Linear ticket attachment in chat input, `LinkedIssuePill`, `IssueLinkCommand`) — `[DEFERRED: separate PRD]`.
  **Why:** Linear integration is a separate cross-cutting capability requiring Linear OAuth + ticket-search UI on mobile. It's a power-user convenience layered on top of chat, not a prerequisite for the "list / read / send" loop. Defer until the base mobile-chat v2 surface is validated.

- **Plus menu and overflow actions** — `[DEFERRED: separate PRD]`.
  **Why:** Desktop's Plus menu primarily exposes attachment-related actions (file attach, image upload, drag-drop alternatives). Since attachments are out of mobile-chat v2, shipping the Plus menu would produce a half-empty UI surface. Bring it back when the items inside it are also ready.

- **Restart-from-message** (branch a conversation from a prior message) — `[DEFERRED: separate PRD]`. Host-service procedure `chat.restartFromMessage` already exists.
  **Why:** Power-user feature outside the user's explicit "list / read / send" scope. Backend is ready; the mobile-chat v2 deferral is purely a UI port that can drop into a future PRD without touching the host.

- **Edit-last-user-message** (re-send a different message) — `[DEFERRED: separate PRD]`.
  **Why:** Same power-user category as restart-from-message. Also introduces non-trivial UX questions (in-place edit vs re-send a new message; how to represent edits in the wire-format history) that don't pay off until base mobile-chat v2 ships and users actually ask for the feature.

- **MCP overview** (which MCP servers and tools are wired into this session) — `[DEFERRED: separate PRD]`.
  **Why:** Read-only diagnostic surface. Not in stated scope and not blocking any of the in-scope use cases. Adds a settings/picker screen with limited mobile-specific value; easy to graft on later.

- **Local chat code execution on the mobile device** — `[NOT SUPPORTED]`.
  **Why:** The user's scope statement was emphatic — "allow sending messages for remote/cloud work (**not local code on mobile device**)". The mobile device doesn't run a host-service; mobile chat REQUIRES a reachable remote or cloud host. This is a stated product boundary, not a deferral, and it will not be revisited in a follow-up PRD.

- **Rich text formatting in composed messages** (bold, italic, lists, headings) — `[NOT SUPPORTED]`.
  **Why:** Desktop's Tiptap prompt editor doesn't expose these either — desktop chat input is plain text + atomic slash-command and file-mention tokens, nothing more. The wire format passed to the agent doesn't carry rich text. Adding rich-text formatting on mobile would be a UX divergence from desktop with zero functional value for the agent loop.

- **Multi-keystroke shortcuts** (Cmd+Enter to send, Cmd+K for command palette, etc.) — `[NOT SUPPORTED]`.
  **Why:** Mobile OSes don't have a Cmd/Ctrl modifier key model. Mobile uses on-screen Send button plus the iOS/Android keyboard's "send" affordance. This is platform-structural, not deferred.

- **Pure-Electric message persistence** (mirror host runtime memory into a new `chat_messages` table for shape-based sync) — `[DEFERRED: separate PRD]`.
  **Why:** Architecture research (`plans/20260521-mobile-chat-research.md` on `local-setup-no-env`) confirmed messages currently live only in host runtime memory — no `chat_messages` table, no `messages` JSON column. Persisting them is a large cross-cutting schema + dual-write change. The chat-v2 PRD already drafts a "host SQLite event log" approach; mobile-chat v2 doesn't need to block on that and can read via relay-routed tRPC instead.

- **Cross-platform UI component library** (a shared `packages/chat-ui` consumed by both web/desktop and mobile) — `[NOT SUPPORTED]`.
  **Why:** Validated against the `cadra-app/monorepo` reference (private repo, accessed via `gh` CLI 2026-05-21): web shadcn components and React Native primitives are fundamentally incompatible at the JSX layer — Radix vs `@rn-primitives`, `<div>` vs `<View>`. Cadra ships parallel implementations with name + Tailwind parity, zero shared code at the UI layer, after explicit consideration of the alternative. Shared design tokens via Tailwind class names is the correct boundary; shared JSX is not.

- **Real-time tRPC subscriptions for chat** — `[NOT SUPPORTED]` in mobile-chat v2; superseded by streaming sub-decision.
  **Why:** Repo-wide grep (research finding) confirmed zero tRPC subscriptions in the chat path today; the desktop **chat-v2** PRD draft proposes WebSocket subscriptions with offset-resume but is not merged. Mobile-chat v2 reads via request/response tRPC (with cursor protocol for resume) and defers live-token streaming to a sub-decision in technical requirements §"Open technical sub-decisions" (SSE-through-relay vs cloud DurableStreams vs polling). Adopting tRPC subscriptions would require infrastructure changes outside this PRD's scope.

- **Attachment payload UI in messages (file chips, image previews, link cards)** — `[DEFERRED: separate PRD]`.
  **Why:** Consequence of the attachments deferral above. The host-service `chat_attachments` table is read-only to mobile, but rendering attachment payloads in user/assistant messages introduces media-handling, image-caching, and download flows that don't pay off until users can also upload attachments. Pair the render with the send.

## Scope size check

Mobile-chat v2 reads as one shippable initiative organized around five tight functional groups (session lifecycle, composition, rendering, mid-turn interactive prompts, platform integration). Each group corresponds to a sprintable unit of work with a clear human-testable gate. The Tiptap port carries the bulk of the implementation risk; the rest is mechanical against existing transport and UI primitives.

If sprints reveal that a group (especially `RENDER` or `COMP`) needs splitting, run `/kb-sprint-plan --delta-replan`; do not retroactively widen this PRD.
