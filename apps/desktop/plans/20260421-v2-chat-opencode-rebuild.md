# V2 Chat Rebuild: OpenCode-Style Architecture

**Date:** 2026-04-21
**Scope:** `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatPane/` + shared pieces in `packages/chat/`
**Status:** Proposal / design
**Reference:** OpenCode desktop app in `temp/opencode/` (SolidJS — patterns apply, framework does not)

---

## 1. Why rebuild

The v2 chat works, but the architecture has accumulated friction that makes feature work slow and fragile. The OpenCode desktop app solves the same problem (streaming LLM chat with tool calls, approvals, file attachments, slash commands, optimistic UI) with a markedly cleaner model. The patterns are portable to React even though OpenCode is SolidJS.

### What hurts today

Both drawn from `ChatPaneInterface.tsx`, `ChatMessageList.tsx`, and the `useWorkspaceChatDisplay` / `useWorkspaceChatController` pair:

1. **State sprawl.** `ChatPaneInterface` owns ~12 `useState` hooks plus Zustand stores plus tRPC cache plus TanStack DB. Effects fan out. Tracing a single state transition requires reading five files.
2. **Two competing optimistic systems.** `optimisticUserMessage` (prefix-based IDs, signature matching on text+files) and `transientUserTurn` (append/restart state machine) solve overlapping problems and interact poorly.
3. **Signature-based optimistic matching is fragile.** `optimisticUserMessage.ts:31-62` hashes text+file metadata to match server messages. Order-sensitive, whitespace-sensitive, and silently breaks.
4. **Polling where streaming is natural.** The display layer polls `getDisplayState` + `listMessages` at 250 ms. Fine for correctness, wasteful for UX. Streaming token pacing is server-side only, so the client flashes content in chunks rather than flowing.
5. **No turn abstraction.** Messages render as a flat list with cross-cutting filters (`visibleMessages`, `renderedMessages`, `interruptedPreview`, `previewToolParts`, `pendingPlanToolCallId`). The natural unit — "one user ask + the assistant work it produced" — isn't modeled.
6. **Timeline renders everything.** No windowing, no lazy history, no content-visibility containment. Long sessions get heavy.
7. **Part-type rendering is scattered.** Text/tool_call/tool_result/thinking/file/image rendering lives across `AssistantMessage`, `UserMessage`, `ToolCallBlock`, `ReasoningBlock`, plus the approval/question/plan message components. No registry.
8. **Composer state is coupled to pane state.** Drafts, attachments, mentions, slash commands, and model picker all thread through `ChatPaneInterface`.

### What OpenCode does well

From the OpenCode deep-dive (`temp/opencode/packages/app/src/pages/session.tsx` and neighbors):

1. **Message → Part → Turn.** `UserMessage` + `AssistantMessage`s linked by `parentID` form a turn. Parts (text, reasoning, tool, file, image, agent, compaction) are the rendering unit. One registry (`PART_MAPPING`) maps type to component.
2. **Flat sync store.** `sync.data = { message[sessionID], part[messageID], session_status[sessionID], session_diff[sessionID], session_todo[sessionID] }`. One source of truth. Memos project slices. SSE handlers mutate in place.
3. **Windowed history with staging.** `createSessionHistoryWindow` renders 10 turns initially, reveals 8 per batch when scrolling up, prefetches older turns from server near the top. `createTimelineStaging` defers mounting of bulk turns across animation frames so first paint is fast.
4. **Paced streaming text.** `createPacedValue` releases characters at ~24 ms/chunk snapped to whitespace, giving a natural typewriter feel without extra server work.
5. **Stable vs live markdown.** `markdown-stream.ts` splits a live message into a stable prefix plus a live trailing code block — stable DOM isn't rebuilt as tokens arrive.
6. **`content-visibility: auto` on inactive turns.** Inactive turns get an estimated intrinsic size and are skipped by layout/paint until needed.
7. **Composer docks.** `followup`, `permission`, `question`, `todo`, `revert` each live in their own dock component above the input — not baked into the message stream, not scattered in the composer.
8. **Followup queue.** Messages typed while the assistant is busy land in a visible queue that auto-drains when the assistant goes idle. User can edit, send-now, or pause.
9. **Revert + fork.** `session.revert` marks a message ID; messages after it fade / become invisible; composer re-loads with that message's content. Server persists; rollback is clean.
10. **Hash-based message deep links.** `#message-<id>` navigates, loads history if needed, and scrolls.
11. **Optimistic via structured payload, not signature matching.** Client builds a `UserMessage` + `Part[]` locally, calls `sync.session.optimistic.add()`, and the server's SSE replaces by ID.
12. **Nested scrollables opt out cleanly.** `data-scrollable` attribute on code blocks and tool output so wheel/touch inside them doesn't mark the outer "user took over scrolling" flag.

---

## 2. Target architecture

### 2.1 Layer diagram

```
┌─────────────────────────────────────────────────────────────┐
│  ChatPane (pane registry entry, unchanged outside)           │
│    SessionSelector   │   ChatSurface                         │
└───────────────────────┼─────────────────────────────────────┘
                        │
        ┌───────────────┴────────────────┐
        │         ChatSurface            │
        │  (was WorkspaceChatInterface)  │
        └───┬────────────┬──────────┬────┘
            │            │          │
     ┌──────▼─────┐ ┌────▼─────┐ ┌──▼──────────┐
     │  Timeline  │ │  Docks   │ │  Composer    │
     │            │ │ (stack)  │ │              │
     │ TurnList   │ │ Followup │ │ Editor       │
     │ Turn       │ │ Permission│ │ Attachments  │
     │  UserPart  │ │ Question │ │ ContextChips │
     │  Divider   │ │ Plan     │ │ ModelPicker  │
     │  AsstParts │ │ Todo     │ │ SlashPopover │
     │   Part*    │ │ Revert   │ │ MentionPopover│
     │  Thinking  │ └──────────┘ └──────────────┘
     └────────────┘
                    ▲
                    │
       ┌────────────┴────────────┐
       │   useChatSession (one)  │
       │   — turns, docks, send  │
       └────────────┬────────────┘
                    │
       ┌────────────┴────────────┐
       │      chatStore          │
       │  (Zustand + tRPC cache) │
       │  messages[sess], parts, │
       │  status, docks, opt UI  │
       └────────────┬────────────┘
                    │
       ┌────────────┴────────────┐
       │   packages/chat client  │
       │   SSE / tRPC bridge     │
       └─────────────────────────┘
```

### 2.2 Data model (client-side, not wire)

Adopt OpenCode's `Message` + `Part` + `Turn` model. The wire format from the server stays whatever the chat service emits today; translate once at the edge.

```ts
// packages/chat/src/shared/types.ts (new)

export type PartType =
  | "text"         // streaming assistant text (or user text)
  | "reasoning"    // Claude extended thinking
  | "tool"         // tool call + state machine
  | "file"         // attached file
  | "image"        // attached image
  | "agent"        // @subagent reference
  | "compaction";  // context compaction marker

export interface BasePart {
  id: string;
  messageID: string;
  sessionID: string;
  time: { start: number; end?: number };
}

export interface TextPart extends BasePart {
  type: "text";
  text: string;
  synthetic?: boolean;   // metadata attached as invisible text (e.g. review comments)
}

export interface ReasoningPart extends BasePart {
  type: "reasoning";
  text: string;
}

export type ToolState =
  | { kind: "input-streaming"; input: unknown }
  | { kind: "running"; input: unknown }
  | { kind: "completed"; input: unknown; output: unknown }
  | { kind: "error"; input: unknown; error: { message: string } };

export interface ToolPart extends BasePart {
  type: "tool";
  tool: string;          // "shell", "edit", "read", "task", "question", ...
  state: ToolState;
}

export interface FilePart extends BasePart { type: "file"; path: string; url: string; mime: string; selection?: { start: number; end: number } }
export interface ImagePart extends BasePart { type: "image"; mime: string; url: string; filename?: string }
export interface AgentPart extends BasePart { type: "agent"; name: string }

export type Part = TextPart | ReasoningPart | ToolPart | FilePart | ImagePart | AgentPart;

export interface UserMessage {
  id: string;
  sessionID: string;
  role: "user";
  time: { created: number };
  model?: { providerID: string; modelID: string };
  agent?: string;
}

export interface AssistantMessage {
  id: string;
  sessionID: string;
  role: "assistant";
  parentID: string;      // points to the user message that triggered it
  time: { created: number; completed?: number };
  modelID: string;
  providerID: string;
  error?: { message: string; kind?: "aborted" | "provider_auth" | "unknown" };
}

export type Message = UserMessage | AssistantMessage;

export type SessionStatus =
  | { type: "idle" }
  | { type: "busy" }
  | { type: "retry"; attempt: number; message: string; next: number };

// A turn is a virtual grouping, not a persisted entity
export interface Turn {
  user: UserMessage;
  assistant: AssistantMessage[];   // all assistant messages with parentID === user.id
  parts: { [messageID: string]: Part[] };
  active: boolean;                 // this turn is the one currently being worked on
}
```

Key properties:

- **No `content` array on messages.** Parts are keyed by `messageID`, flat. This is the single biggest structural change from today's model.
- **Tool state is a discriminated union, not optional fields.** Kills a whole class of "is this finished or still streaming" guessing code.
- **`parentID` on assistant messages** gives us turns for free — no separate filtering pass.
- **Optimistic messages use real IDs** (ULID prefixed `opt-`) generated client-side. Server echoes the same ID back on confirm. No signature matching.

### 2.3 Store shape

One Zustand store, one tRPC cache, a thin sync layer that bridges SSE events into the store.

```ts
// apps/desktop/src/renderer/.../ChatPane/store/chatStore.ts

interface ChatStoreState {
  // Per-session slices
  messages: Record<string /* sessionID */, Message[]>;
  parts: Record<string /* messageID */, Part[]>;
  status: Record<string /* sessionID */, SessionStatus>;

  // Docks (keyed by sessionID)
  followup: Record<string, FollowupItem[]>;
  followupPaused: Record<string, boolean>;
  pendingApproval: Record<string, ApprovalRequest | undefined>;
  pendingPlan: Record<string, PlanApprovalRequest | undefined>;
  pendingQuestion: Record<string, QuestionRequest | undefined>;
  activeSubagents: Record<string, SubagentView[]>;
  todos: Record<string, Todo[]>;
  revert: Record<string, { messageID: string } | undefined>;

  // History windowing
  historyMore: Record<string, boolean>;
  historyLoading: Record<string, boolean>;

  // Mutations
  applySessionSnapshot(sessionID: string, snapshot: SessionSnapshot): void;
  applyStreamEvent(ev: ChatStreamEvent): void;
  addOptimistic(sessionID: string, message: UserMessage, parts: Part[]): void;
  replaceOptimistic(sessionID: string, optID: string, confirmed: { message: UserMessage; parts: Part[] }): void;
  rollbackOptimistic(sessionID: string, optID: string): void;
  // ...
}
```

**Selectors** (memoized via `useShallow` or `createSelector`):

- `selectTurns(sessionID)` → `Turn[]` (group messages by `parentID`)
- `selectActiveTurn(sessionID)` → `Turn | undefined` (find the one where status != idle or last assistant not completed)
- `selectWindowedTurns(sessionID, start)` → `Turn[]` (slice by `start` for lazy render)
- `selectDocks(sessionID)` → `{ followup, permission, question, plan, todo, revert }`

### 2.4 Streaming: SSE, not polling

The chat service already produces token-level streams; the desktop app just doesn't subscribe. Plan:

1. Expose an SSE endpoint from the chat service host (or the electron-side IPC equivalent — we already have a host service at `apps/desktop/src/main/` — see `a578a5f15`). Events:

   ```
   event: session.snapshot        -> initial hydration
   event: message.append          -> new message
   event: part.append             -> new part on a message
   event: part.delta              -> delta to a streaming text/reasoning/tool-input part
   event: part.complete           -> part finalized
   event: session.status          -> idle | busy | retry
   event: dock.approval | dock.question | dock.plan | dock.todo | dock.revert
   ```

2. `packages/chat/src/client/stream.ts` subscribes, dispatches to `chatStore.applyStreamEvent`.

3. Polling stays only as a fallback for reconnect resync (one call to `chat.getSnapshot`).

**Paced rendering is still client-side.** Even with SSE we want `createPacedValue` so deltas released faster than the eye tracks get smoothed out. This is pure UX sugar — same implementation as OpenCode, adapted to React (a `useLayoutEffect` + `requestAnimationFrame`).

### 2.5 Component tree (renderer)

```
ChatPane/
  ChatPane.tsx                 (unchanged: pane registry glue + SessionSelector)
  ChatSurface/
    ChatSurface.tsx            (was WorkspaceChatInterface / ChatPaneInterface)
    index.ts
    hooks/
      useChatSession/          (single hook replacing controller+display+orchestration)
      useAutoScroll/           (ported from OpenCode create-auto-scroll)
      useHistoryWindow/        (ported from createSessionHistoryWindow)
      useTimelineStaging/      (ported from createTimelineStaging)
      useMessageHashScroll/    (ported from use-session-hash-scroll)
      useChatKeybinds/         (ctrl+l focus, pgup/pgdn nav, mod+shift+s revert, ...)
    components/
      Timeline/
        Timeline.tsx           (scroll view + window + staging)
        TurnList.tsx
        Turn/
          Turn.tsx
          UserTurnHeader.tsx
          AssistantParts.tsx
          TurnDivider.tsx      (compaction / interruption markers)
          ThinkingIndicator.tsx
        Parts/
          parts.ts             (registry: PartType -> Component)
          TextPart.tsx
          ReasoningPart.tsx
          ToolPart.tsx
          FilePart.tsx
          ImagePart.tsx
          AgentPart.tsx
          PacedMarkdown.tsx
          MarkdownStream.tsx   (stable+live split)
        JumpToBottomButton.tsx
      Docks/
        DocksStack.tsx         (stacks whichever docks are active, above composer)
        FollowupDock.tsx
        PermissionDock.tsx     (was PendingApprovalMessage, moved out of timeline)
        QuestionDock.tsx       (was QuestionInputOverlay)
        PlanDock.tsx           (was PendingPlanApprovalMessage, moved out of timeline)
        TodoDock.tsx
        RevertDock.tsx
      Composer/
        Composer.tsx
        Editor/                (Tiptap with custom nodes)
          Editor.tsx
          mentionNode.ts
          fileNode.ts
          imageNode.ts
          slashPopover.ts
        ContextChips.tsx
        AttachmentRow.tsx      (image thumbs, file chips)
        ModelPicker/           (keep existing if OK, just move)
        McpControls/           (keep existing if OK, just move)
        ChatInputFooter.tsx    (retire — functionality split into Composer children)
        utils/
          buildRequestParts.ts
          submit.ts
          paste.ts
          attachments.ts
  store/
    chatStore.ts
    selectors.ts
    types.ts                   (re-exports from packages/chat/shared)
```

Key moves:

- **Approvals/questions/plans move out of the message list.** In OpenCode they're docks — `SessionPermissionDock`, `SessionQuestionDock`. Rendering them as messages (today) conflates "part of history" with "blocking UI". Once answered they leave no trace in the message list; the assistant message that resumed carries the context.
- **Thinking / tool previews become Parts, not standalone messages.** `ThinkingMessage` → `ThinkingIndicator` rendered from the active turn's status; `ToolPreviewMessage` → a `ToolPart` in `running` state. No more filtering magic to exclude them on history reload.
- **`AttachmentChip`, `UserMessageAttachments`, `UserMessageText`, `UserMessageEditor` collapse into `UserTurnHeader` + `Parts/*`.** A user message is just `{ UserMessage, Part[] }`. Edit state is a composer affordance, not a separate tree under `UserMessage`.

### 2.6 Timeline: windowing + staging + content-visibility

Port the three OpenCode primitives to React:

1. **`useHistoryWindow(sessionID)`** — owns `turnStart`, exposes `renderedTurns`, `onScrollerScroll`, `loadAndReveal`. Internal thresholds:
   - `turnInit = 10`, `turnBatch = 8`, `turnScrollThreshold = 200px`, `prefetchBuffer = 16`, `prefetchCooldownMs = 400`.
   - Preserves scroll position when revealing older turns (snapshot `scrollTop + scrollHeight`, restore after layout).
   - Fetches older turns from server via `chat.loadHistory({ sessionID, before })` when approaching top.

2. **`useTimelineStaging({ sessionID, turnStart, messages })`** — defers mounting when a long history is revealed. `init=1`, `batch=3`, scheduled via `requestAnimationFrame`.

3. **`content-visibility: auto` + `contain-intrinsic-size: auto 500px`** on every non-active turn. One-line CSS, huge perf gain on long conversations.

The jump-to-bottom button appears when `scroll.overflow && distance > max(400, clientHeight)`. It calls `forceScrollToBottom` and resets any active message hash.

### 2.7 Auto-scroll

Ported `useAutoScroll`:

```ts
useAutoScroll({
  scrollerRef,
  contentRef,
  working: () => sessionStatus?.type !== "idle",
  // Elements marked data-scrollable (code blocks, tool output) do not
  // toggle userScrolled when scrolled internally.
});
```

Contract: while `working` is true and `!userScrolled`, new content autoscrolls. Any real scroll gesture (wheel/touch/pgup) at the root scroller sets `userScrolled = true`; scrolling to within 2px of bottom clears it. Nested `data-scrollable` regions are excluded via boundary-gesture detection (see OpenCode `shouldMarkBoundaryGesture`).

### 2.8 Composer

Keep Tiptap (good choice, matches the rest of the app), rebuild around it:

- **One editor, custom nodes.** `mention`, `file`, `image`, `agent`. Serialize with `buildRequestParts()` that walks the editor doc tree (not the plain text).
- **Slash-popover as a Tiptap suggestion extension**, not a parallel input state. Popover items are fed from `chat.getSlashCommands` query + client-built specials (`/new`, `/stop`, `/model`, `/mcp`).
- **Paste handler** routes images → data URL image nodes, files → file nodes, text → text.
- **Drafts persist per-session** with `Persist.workspace(...)` equivalent — we have `keep-chat-drafts` precedent (`apps/desktop/plans/20260319-1400-keep-chat-drafts.md`).
- **Attachments and images sit above the editor** in `AttachmentRow` — not interleaved in the editor DOM, so they survive clearing input.
- **Submission**:
  1. `buildRequestParts(editorDoc, attachments, slashContext)` → `Part[]`.
  2. Generate optimistic `UserMessage` with `opt-<ULID>` id.
  3. `chatStore.addOptimistic(sessionID, message, parts)`.
  4. `chat.send.mutate({ sessionID, optID: message.id, parts })`.
  5. On success, server returns the real IDs tied to `optID`; store replaces. On failure, rollback.

### 2.9 Followup queue

New dock. When status is busy:

- Composer submit inserts into `followup[sessionID]` instead of calling send.
- `FollowupDock` lists the queued items, each with **send-now** / **edit** / **remove** controls.
- When status transitions to idle, a store effect drains the head of the queue via the normal send path.
- User can pause (auto-drain off) per session.
- Setting `settings.general.followup === "queue"` gates the whole feature (retain current "send immediately" default behind flag until stable).

### 2.10 Revert

- Click "edit" on a past user message OR use `mod+shift+s`.
- `chat.revert.mutate({ sessionID, messageID })` tells the server to mark the turn as reverted.
- `chatStore.revert[sessionID] = { messageID }` — UI dims messages with `id >= messageID`.
- Composer loads the reverted message's parts as draft.
- `RevertDock` lists the rolled-off turns with "restore" buttons that unrevert (or revert to a later message).

### 2.11 Message part renderer registry

One registry, one place to add a new part type:

```ts
// ChatSurface/components/Timeline/Parts/parts.ts
import type { Part } from "@superset/chat/shared/types";

export const PART_MAPPING: {
  [K in Part["type"]]: React.ComponentType<{ part: Extract<Part, { type: K }>; message: Message; active: boolean }>
} = {
  text: TextPart,
  reasoning: ReasoningPart,
  tool: ToolPart,
  file: FilePart,
  image: ImagePart,
  agent: AgentPart,
};

export function renderPart(part: Part, message: Message, active: boolean) {
  const Component = PART_MAPPING[part.type] as React.ComponentType<any>;
  if (!Component) return null;
  return <Component part={part} message={message} active={active} />;
}
```

`ToolPart` internally switches on `tool` name for specialized renderers (shell, edit, read, task, question, ...) but that dispatch lives inside `ToolPart.tsx`, not leaked out.

### 2.12 Paced markdown

`PacedMarkdown`:
- Takes `text: string` and `live: boolean`.
- Reveals chars in chunks sized by text length (small chunks for short, bigger for long); snaps chunk end to next whitespace.
- On `live` transitioning false, syncs to full text immediately.
- Pace constant `TEXT_RENDER_PACE_MS = 24`.

`MarkdownStream`:
- Splits text into `{ raw, src, mode: "full" | "live" }` segments.
- If an open code fence is detected, the part before the fence is rendered as a stable block (only mutates via `morphdom`-style diff), the trailing fenced section re-renders as it streams.
- Prevents the top of a long assistant message from flickering when the last paragraph is still arriving.

Both ported from `temp/opencode/packages/ui/src/components/markdown-stream.ts` and `message-part.tsx:235-246`.

### 2.13 Keyboard model

Move hotkeys into `useChatKeybinds`:

| Action | Binding |
|---|---|
| Focus composer | `ctrl+l` |
| Previous user message | `mod+alt+[` |
| Next user message | `mod+alt+]` |
| Revert last turn | `mod+shift+s` |
| Restore reverted | `mod+shift+shift+s` (or re-invoke the revert flow) |
| Find in chat | `mod+f` |
| Send | `enter` (composer-local) |
| Newline in composer | `shift+enter` |
| Clear/new | `/new` slash |

Existing shortcuts live in multiple places today; consolidating them is a prerequisite to adding the OpenCode ones without conflicts.

### 2.14 Deep linking

`#message-<id>` behavior:
1. On mount / hash change, look up id.
2. If in store → scroll, highlight, set active.
3. If not in store → `chat.loadHistoryUntil({ sessionID, messageID })`, retry.
4. After scroll settles, clear hash (or keep? tbd).

---

## 3. Server / shared package changes

### 3.1 `packages/chat/src/shared/`

- Add the new `types.ts` (Message/Part/Turn discriminated unions).
- Keep existing slash-command utilities — they are fine.
- Add `streamEvents.ts` — the SSE event union emitted by the service.

### 3.2 `packages/chat/src/client/`

- Add `stream.ts` — opens SSE / IPC subscription and reduces into `chatStore`. Reconnect with backoff. On reconnect, re-request snapshot, diff, emit replacement events.
- Keep `use-chat-display` only as a compat shim for v1 callers during the migration, or retire immediately if v1 has its own implementation path.

### 3.3 `packages/chat/src/server/desktop/` + `hono/` + `trpc/`

- Decide streaming transport: SSE (simplest, works inside Electron) vs. IPC events from the main-process chat host (we already have `a578a5f15 feat(desktop): enable v2 chat pane via host service`). **Recommendation:** IPC inside desktop, SSE for web/mobile, behind a shared `ChatStream` adapter so the client doesn't care.
- `chat.send` mutation accepts `optID` and returns confirmed IDs tied to it.
- `chat.loadHistory({ sessionID, before, limit })` endpoint for windowed pagination.
- `chat.revert` / `chat.unrevert` for revert flow.
- Approval/question/plan responses keep existing mutation shape.

---

## 4. Migration plan

Ship behind a flag (`CHAT_V2_OPENCODE_REBUILD`) that the user toggles per-session or per-workspace while we rebuild. Concrete order:

### Phase 0 — scaffolding (low risk)
1. Add shared types in `packages/chat/src/shared/types.ts` (new file, nothing reads it yet).
2. Add `chatStore` skeleton + selectors + unit tests.
3. Add `useChatSession` skeleton that today just re-exports existing behavior.

### Phase 1 — data model translation (dual-run)
1. Write `adapters/fromLegacy.ts`: converts today's `ChatMessage[]` (tRPC `listMessages`) into `Message[] + Part[]`.
2. Populate `chatStore` via the adapter on every existing poll tick. Both old UI and new store coexist.
3. Unit tests on every current message shape: tool_call+tool_result pair, thinking, images, files, interrupted, approval/question/plan messages.

### Phase 2 — new Timeline
1. Build `Timeline`, `Turn`, `Parts/*` reading from the store. Behind `CHAT_V2_OPENCODE_REBUILD`.
2. Wire `useHistoryWindow`, `useTimelineStaging`, `useAutoScroll`, `JumpToBottomButton`.
3. Port `PacedMarkdown`, `MarkdownStream` from OpenCode — keep the dependency tree local to this folder.
4. Parity-check against the legacy UI on the same session: screenshots in a PR, not code coverage.

### Phase 3 — Docks
1. `FollowupDock` + store plumbing (off by default — default remains "send immediately").
2. Move PendingApproval, PendingPlanApproval, PendingQuestion out of the message list into `PermissionDock`, `PlanDock`, `QuestionDock`. Remove their entries from the timeline filter pipeline.
3. Add `TodoDock` (we don't render todos in a dedicated UI today — OpenCode's treatment is better than burying them).
4. Add `RevertDock` once revert mutations ship.

### Phase 4 — Composer
1. New `Composer` with Tiptap custom nodes and `buildRequestParts`.
2. Slash popover as a Tiptap suggestion.
3. Paste/drop flow unified. Retire `ChatInputDropZone` / `FileDropOverlay` in their current form; move into the composer.
4. Optimistic via `optID`. Retire `optimisticUserMessage` signature matching.
5. Retire `transientUserTurn` entirely — its job is covered by (a) optimistic messages with real IDs and (b) the revert dock.

### Phase 5 — streaming transport
1. Land the SSE/IPC event stream in the server.
2. Swap the client from polling to streaming. Keep polling as the reconnect fallback.
3. Measure: token-to-paint latency should drop visibly.

### Phase 6 — deprecate legacy
1. Remove flag, delete `ChatPaneInterface.tsx`, `ChatInputFooter.tsx` (old), the `PendingApprovalMessage` / `PendingPlanApprovalMessage` / `PendingQuestionMessage` / `SubagentExecutionMessage` / `ToolPreviewMessage` / `ThinkingMessage` wrappers, `optimisticUserMessage.ts`, `transientUserTurn.ts`, `useWorkspaceChatDisplay.ts` (folded into `useChatSession`), `useWorkspaceChatController.ts` (pane-level plumbing kept minimal, session list moved to its own hook).

---

## 5. What to port verbatim vs. re-derive

**Port the logic, re-express in React.** OpenCode is SolidJS; JSX structure translates, reactivity doesn't.

| OpenCode file | Port as | Notes |
|---|---|---|
| `session.tsx` (`createSessionHistoryWindow`) | `useHistoryWindow` | React hook, `useRef` for scroller, `useEffect` for prefetch cooldown. |
| `message-timeline.tsx` (`createTimelineStaging`) | `useTimelineStaging` | Same algorithm, `requestAnimationFrame` loop. |
| `message-timeline.tsx` (render) | `Timeline.tsx` + `TurnList.tsx` | `For` → `.map`; `createMemo` → `useMemo`; `data-message-id` preserved. |
| `session-turn.tsx` | `Turn.tsx` | One file today, likely two or three in ours (`Turn`, `UserTurnHeader`, `AssistantParts`). |
| `message-part.tsx` (`PART_MAPPING`) | `Parts/parts.ts` | Keep the registry pattern; per-type components. |
| `message-part.tsx` (`createPacedValue`) | `PacedMarkdown.tsx` | `useLayoutEffect` + ref, or a small class component. |
| `markdown-stream.ts` | `MarkdownStream.ts` | Pure function — copy with attribution. |
| `markdown.tsx` (morphdom live update) | `Markdown.tsx` | morphdom works fine in React with a container ref. Alternative: `react-markdown` with `useMemo` on the stable prefix. |
| `create-auto-scroll.tsx` | `useAutoScroll` | Port directly. |
| `use-session-commands.tsx` | `useChatKeybinds` | Use our existing keybind infrastructure instead of OpenCode's command registry. |
| `use-session-hash-scroll.ts` | `useMessageHashScroll` | Port directly. |
| `prompt-input/build-request-parts.ts` | `Composer/utils/buildRequestParts.ts` | Adapt to Tiptap doc (ProseMirror) instead of contenteditable. |
| `prompt-input/submit.ts` | `Composer/utils/submit.ts` | Swap OpenCode SDK for our tRPC client. |
| `composer/session-*-dock.tsx` | `Docks/*.tsx` | One-to-one translation; keep them small. |

**Do not port:**

- OpenCode's SolidJS `createStore` — use Zustand.
- OpenCode's sync layer — we have tRPC + an emerging host-service model; match ours.
- OpenCode's `Identifier.ascending("message")` ULID — we have our own ID util.
- OpenCode's theming CSS vars — keep our TailwindCSS setup.

---

## 6. Risks

1. **Tiptap ↔ Part serialization.** Getting `buildRequestParts` right on arbitrary ProseMirror docs is fiddly. Mitigation: write the serialize round-trip tests first, against both the OpenCode test cases (see `build-request-parts.test.ts`) and the real shapes we send today.
2. **Tool-call state convergence.** Today assistant content is a flat array with `tool_call` / `tool_result` pairs that need to be stitched. The adapter in Phase 1 has to do this correctly for live, interrupted, and errored turns, or the Timeline will render wrong. Mitigation: tests over recorded turns from real sessions.
3. **SSE through Electron.** Our host service is the right place for it but hasn't carried streams before. Mitigation: start by re-using the polling path and only swap transports once the new Timeline is in production.
4. **Feature regressions.** MCP UI, linked issues, chat search, scrollback rail, subagents — each has a nontrivial current implementation. The plan keeps MCP/model picker as-is. Subagents become active-turn Parts (agent part + nested tool parts) instead of a distinct message component. Search lives in the Timeline but its hook can be kept almost unchanged.
5. **Performance of `content-visibility`** on Electron's Chromium is fine (Chrome ≥85) but it changes how scrollbars feel on long lists. Verify on a 500-turn fixture.

---

## 7. Out of scope

- Session list / session selector UI — working fine, leave alone.
- The chat service backend beyond the streaming + revert + windowed-history endpoints.
- Web/mobile chat — same package will benefit long-term but this plan is desktop-first.
- Review panel. OpenCode integrates it tightly with the session; we don't, and shouldn't copy that coupling.

---

## 8. Open questions

1. Do we want OpenCode's "session fork" (branch from a user message) as part of this rebuild, or defer? It falls out cheaply from the revert model + a new `session.fork` call. Suggest: defer.
2. Followup queue default: off (today) or on (OpenCode)? Suggest: ship behind a setting, default off, flip once stable.
3. Keep polling entirely, or commit to SSE/IPC? Suggest: polling-first in Phase 2–4, SSE in Phase 5 so the UI rebuild isn't blocked on transport work.
4. Reasoning summaries: collapse with extracted heading (OpenCode) or expand-by-default (today)? Suggest: collapse by default behind `settings.general.showReasoningSummaries`, matching OpenCode — our users have complained about noise.

---

## 9. Appendix: key OpenCode file references

- `temp/opencode/packages/app/src/pages/session.tsx` — root session page, history window, auto-scroll glue.
- `temp/opencode/packages/app/src/pages/session/message-timeline.tsx` — timeline render, staging, turn list.
- `temp/opencode/packages/app/src/pages/session/composer/session-composer-region.tsx` — docks + composer region layout.
- `temp/opencode/packages/app/src/pages/session/composer/session-followup-dock.tsx` — followup queue UI.
- `temp/opencode/packages/app/src/pages/session/composer/session-composer-state.ts` — dock state machine (todo/permission/question dock open logic).
- `temp/opencode/packages/app/src/components/prompt-input.tsx` — composer root.
- `temp/opencode/packages/app/src/components/prompt-input/build-request-parts.ts` — editor-doc → request parts.
- `temp/opencode/packages/app/src/components/prompt-input/submit.ts` — optimistic send path.
- `temp/opencode/packages/ui/src/components/session-turn.tsx` — turn render.
- `temp/opencode/packages/ui/src/components/message-part.tsx` — part registry, paced markdown.
- `temp/opencode/packages/ui/src/components/markdown.tsx` + `markdown-stream.ts` — stable+live markdown split.
- `temp/opencode/packages/ui/src/hooks/create-auto-scroll.tsx` — auto-scroll primitive.

---

## 10. Appendix: files that will shrink or disappear

Under the target architecture, the following are retired or heavily reduced:

- `ChatPane/components/WorkspaceChatInterface/ChatPaneInterface.tsx` → becomes a thin `ChatSurface` (≤100 LOC).
- `ChatPane/components/WorkspaceChatInterface/components/ChatMessageList/ChatMessageList.tsx` → replaced by `Timeline/`.
- `ChatPane/components/WorkspaceChatInterface/components/ChatMessageList/components/PendingApprovalMessage/` → moves into `Docks/PermissionDock.tsx`.
- `.../PendingPlanApprovalMessage/` → `Docks/PlanDock.tsx`.
- `.../PendingQuestionMessage/` → `Docks/QuestionDock.tsx`.
- `.../ThinkingMessage/` → `Timeline/Turn/ThinkingIndicator.tsx`.
- `.../ToolPreviewMessage/` → absorbed into `Parts/ToolPart.tsx`.
- `.../SubagentExecutionMessage/` → `Parts/AgentPart.tsx` + nested tool parts.
- `.../UserMessage/` (and all its sub-components) → `Timeline/Turn/UserTurnHeader.tsx` + `Parts/*`.
- `.../WorkspaceChatInterface/utils/optimisticUserMessage/` → deleted (replaced by `optID` flow).
- `.../WorkspaceChatInterface/utils/transientUserTurn/` → deleted.
- `ChatPane/hooks/useWorkspaceChatController/` → split: session list to a thin `useWorkspaceChatSessions`, plumbing folded into `ChatPane.tsx`.
- `ChatPane/hooks/useWorkspaceChatDisplay/` → deleted (folded into `useChatSession` + `chatStore`).
