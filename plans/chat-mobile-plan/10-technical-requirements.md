---
stability: CONSTITUTION
last_validated: 2026-05-21
prd_version: 1.3.0
---

# Mobile Chat v2 — Technical Requirements

## System Components

| Component | Role | Location |
|---|---|---|
| **Mobile Chat UI tree** | Parallel React Native implementation of desktop's `ChatInterface` component tree. Built with `@rn-primitives/*` + uniwind + Reanimated. | `apps/mobile/components/chat/` (NEW) |
| **Host-service tRPC client** | Typed HTTP+tRPC client against `@superset/host-service`'s `AppRouter`. URL routed through `apps/relay` (per-host WS tunnel) instead of `127.0.0.1`. JWT bearer auth. | `apps/mobile/lib/host-service-client.ts` (NEW) — mirrors `apps/desktop/src/renderer/lib/host-service-client.ts` |
| **Electric collections (extended)** | Adds `chat_sessions` collection to existing collections graph for realtime session-list sync. Already-exposed Electric shape; mobile just consumes it. | `apps/mobile/lib/collections/collections.ts` (MODIFY) |
| **Tiptap editor wrapper** | WebView-hosted Tiptap via `@10play/tentap-editor` configured with the same minimal extension set as desktop's `TiptapPromptEditor.tsx` plus the `SlashCommandNode` and `FileMentionNode` ports. | `apps/mobile/components/chat/ChatInputFooter/` (NEW) |
| **Mid-turn pause UI** | Container shape chosen per interaction (see `07-uc-pause.md` Design Rationale for citations). Tool approval = inline card + sticky thumb-docked footer (Continue.dev pattern); ask_user = `@gorhom/bottom-sheet` with `BottomSheetTextInput` (keyboard handling); plan approval = full-screen modal as expo-router pushed route (Apple HIG "in-depth content"). Plus a floating pending-action indicator for off-screen pauses. | `apps/mobile/components/chat/PendingApprovalCard/`, `PendingApprovalFooter/` (sticky), `PendingQuestionSheet/`, `PendingActionIndicator/` (NEW components); `apps/mobile/app/(authenticated)/chat/[sessionId]/plan-review/[planId].tsx` (NEW pushed route) |
| **Message list (virtualized)** | `@shopify/flash-list` (inverted) with Reanimated scroll-back affordance. | `apps/mobile/components/chat/MessageList/` (NEW) |
| **Markdown renderer** | RN markdown rendering (likely `react-native-markdown-display` or `@expensify/react-native-live-markdown`) for assistant message content. Replaces desktop's web-only `streamdown`. | `apps/mobile/components/chat/MessageMarkdown/` (NEW) |
| **Push notification handler** | Expo push token registration, foreground/background notification handling, deep-link to session on tap. Wired to host-service `notificationsEmitter` lifecycle events via cloud relay. | `apps/mobile/lib/push-notifications/` (NEW) |
| **Reconnect/cursor protocol** | On foreground-from-background or host-online detection, re-fetches `chat.getSnapshot` and reconciles local optimistic state with cursor/offset semantics. | `apps/mobile/screens/(authenticated)/chat/[sessionId]/hooks/useSessionResume.ts` (NEW) |

## Data Schema

Mobile is a **read-mostly** client for chat. The only DB writes mobile triggers are session-metadata CRUD via the cloud chat router (`chat.createSession`, `chat.updateSession`, `chat.deleteSession`, `chat.updateTitle`). Mobile does NOT write messages — messages live in the host runtime memory and are returned via `chat.listMessages` / `chat.getSnapshot`.

### Existing tables consumed (no schema changes)

| Entity | Source | Purpose for mobile |
|---|---|---|
| `chat_sessions` | `packages/db/src/schema/schema.ts:678-710` | Session metadata: `id, organization_id, created_by, workspace_id, v2_workspace_id, title, last_active_at, created_at, updated_at`. Read via Electric shape. Written via cloud `chat.createSession` / `updateSession` / `deleteSession` / `updateTitle`. |
| `v2_workspaces` | `packages/db/src/schema/schema.ts` | Workspace metadata to filter sessions and bind new sessions to. Read via Electric shape (already wired in mobile collections). |

### Tables explicitly NOT touched

- `chat_attachments` — attachments deferred to a future mobile-chat PRD
- `chat_messages` / any messages table — **does not exist**; messages are runtime-resident, not persisted

## API Design

Mobile consumes **three API surfaces**.

### 1. Cloud tRPC (`apps/api`) — session metadata

Already implemented in `packages/trpc/src/router/chat/chat.ts`. Mobile uses these existing procedures:

| Procedure | Type | Use Case |
|---|---|---|
| `chat.getModels` | query | UC-COMP-04 (model picker) |
| `chat.createSession({ sessionId, v2WorkspaceId })` | mutation | UC-SESS-03 |
| `chat.updateSession({ sessionId, title?, lastActiveAt? })` | mutation | UC-SESS-04, UC-COMP-02 (lastActiveAt bump via host fire-and-forget) |
| `chat.updateTitle({ sessionId, title })` | mutation | UC-SESS-04 (rename in menu) |
| `chat.deleteSession({ sessionId })` | mutation | UC-SESS-05 |

Auth: `protectedProcedure` with `activeOrganizationId` resolved from better-auth session.

### 2. Host-service tRPC via relay (`apps/relay` → `packages/host-service`) — message operations

Already implemented in `packages/host-service/src/trpc/router/chat/chat.ts`. Mobile invokes these via the new mobile `host-service-client.ts` using `httpLink` against `${RELAY_URL}/hosts/${hostId}/trpc`:

| Procedure | Type | Use Case |
|---|---|---|
| `chat.getSnapshot({ sessionId, workspaceId })` | query | UC-SESS-02, UC-PLATF-02 |
| `chat.listMessages({ sessionId, workspaceId })` | query | UC-SESS-02 |
| `chat.getDisplayState({ sessionId, workspaceId })` | query | UC-RENDER-* state derivation |
| `chat.sendMessage({ sessionId, workspaceId, payload, metadata })` | mutation | UC-COMP-02 |
| `chat.endSession({ sessionId, workspaceId })` | mutation | UC-SESS-04 |
| `chat.stop({ sessionId, workspaceId })` | mutation | UC-COMP-03 |
| `chat.respondToApproval({ sessionId, workspaceId, payload: { decision } })` | mutation | UC-PAUSE-01 |
| `chat.respondToQuestion({ sessionId, workspaceId, payload: { questionId, answer } })` | mutation | UC-PAUSE-02 |
| `chat.respondToPlan({ sessionId, workspaceId, payload: { planId, response } })` | mutation | UC-PAUSE-03 |
| `chat.getSlashCommands({ workspaceId })` | query | UC-COMP-01 (slash popover) |
| `chat.previewSlashCommand({ workspaceId, text })` | mutation | UC-COMP-01 |
| `chat.resolveSlashCommand({ workspaceId, text })` | mutation | UC-COMP-01 |

Auth: JWT bearer minted per the JWT-lifecycle sub-decision (deferred to sprint planning).

### 3. ElectricSQL Shape (`apps/electric-proxy`) — realtime session list

| Endpoint | Use Case |
|---|---|
| `GET ${API_URL}/api/electric/v1/shape?table=chat_sessions&where=organization_id='{org}'` | UC-SESS-01, UC-PLATF-05 |

Already exposed at `apps/electric-proxy/src/where.ts:136-137`. Mobile consumes via existing TanStack Electric DB Collection infrastructure (`@tanstack/electric-db-collection`, `electricCollectionOptions`).

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                          apps/mobile (Expo)                          │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │              apps/mobile/components/chat/                    │    │
│  │  ChatInterface → MessageList → UserMessage/AssistantMessage  │    │
│  │  ChatInputFooter (@10play/tentap-editor)                     │    │
│  │  PendingApprovalCard (inline) + PendingApprovalFooter (sticky)│   │
│  │  PendingQuestionSheet (@gorhom/bottom-sheet)                 │    │
│  │  PlanReviewScreen (expo-router pushed route)                 │    │
│  │  PendingActionIndicator (floating pill)                      │    │
│  │  (FlashList, Reanimated)                                     │    │
│  └────────────────────┬────────────────────────────┬────────────┘    │
│                       │                            │                 │
│  ┌────────────────────▼──────────────┐  ┌──────────▼─────────┐       │
│  │  apps/mobile/lib/host-service-    │  │  Electric          │       │
│  │  client.ts (httpLink, JWT)        │  │  collections       │       │
│  │  Typed: @superset/host-service    │  │  (existing +       │       │
│  │  AppRouter                        │  │  chat_sessions)    │       │
│  └────────────────────┬──────────────┘  └──────────┬─────────┘       │
│                       │                            │                 │
│  ┌────────────────────▼──────────────┐             │                 │
│  │  Push notifications (Expo push)   │             │                 │
│  └─────────────────┬─────────────────┘             │                 │
└────────────────────┼──────────────────────────────┼──────────────────┘
                     │                              │
                     │ HTTPS                        │ SSE (Shape proto)
                     ▼                              │
        ┌────────────────────────┐                  │
        │       apps/relay       │                  │
        │  (Hono + Redis + JWT)  │                  │
        │  per-host WS tunnel    │                  │
        └────────────┬───────────┘                  │
                     │ tunnel-forwarded HTTP        │
                     ▼                              ▼
        ┌────────────────────────┐    ┌─────────────────────────┐
        │  packages/host-service │    │  apps/electric-proxy    │
        │  (Hono + tRPC)         │    │  (Cloudflare Worker)    │
        │                        │    │                         │
        │  • chat router:        │    │  • chat_sessions shape  │
        │    sendMessage,        │    │    (where.ts:136-137)   │
        │    listMessages,       │    │                         │
        │    respondToApproval,  │    │                         │
        │    respondToQuestion,  │    │                         │
        │    respondToPlan, etc. │    │                         │
        │  • Mastra harness      │    │                         │
        │  • In-memory message   │    │                         │
        │    store               │    │                         │
        └────────────────────────┘    └─────────┬───────────────┘
                     │                          │
                     │ Fire-and-forget          │
                     │ chat.updateSession       │
                     │ (lastActiveAt)           │
                     ▼                          ▼
        ┌──────────────────────────────────────────────────────┐
        │           Neon Postgres (chat_sessions)              │
        │  metadata only: title, lastActiveAt, workspace, org  │
        └──────────────────────────────────────────────────────┘
```

## External Dependencies (new)

| Dependency | Version target | Purpose | Docs |
|---|---|---|---|
| `@shopify/flash-list` | `^1.7` (cadra ships 1.7.6) | Message list virtualization | https://shopify.github.io/flash-list/ |
| `@gorhom/bottom-sheet` | `^5` (cadra ships 5.1.6) | Pause-prompt sheets | https://gorhom.dev/react-native-bottom-sheet/ |
| `@10play/tentap-editor` | latest stable | WebView-hosted Tiptap for input parity | https://10play.github.io/10tap-editor/ |
| `lucide-react-native` | matches mobile lucide version | Icon parity with desktop's `lucide-react` | https://lucide.dev/guide/packages/lucide-react-native |
| `react-native-markdown-display` (or alternative) | latest stable | Markdown rendering in assistant messages | https://github.com/iamacup/react-native-markdown-display |
| `expo-notifications` | matches Expo SDK 55 | Push token registration + foreground/background notification handling | https://docs.expo.dev/versions/latest/sdk/notifications/ |

## External Dependencies (already in mobile package.json)

These cover most of the supporting infrastructure — no new install needed:

- `@better-auth/expo`, `better-auth` — auth (JWT mint flow will live here)
- `@trpc/client`, `@trpc/react-query` — tRPC client
- `@tanstack/react-query`, `@tanstack/electric-db-collection`, `@tanstack/react-db` — query + Electric sync
- `@electric-sql/client` — Electric Shape protocol
- `@rn-primitives/*` (popover, dialog, collapsible, tooltip, etc.) — primitives for popovers used by composer pickers
- `react-native-reanimated` — Reanimated for streaming-cursor, scroll-back fade, sheet animations
- `expo-router` — navigation; new routes for `(authenticated)/chat/[sessionId]` and `(authenticated)/workspaces/[id]/sessions`
- `expo-secure-store` — secure JWT storage
- `superjson` — tRPC transformer (matches relay + host-service config)
- `uniwind` — Tailwind for RN (already wired via `apps/mobile/global.css`)

## UI Infrastructure

### Component-tree mirror to `apps/mobile/components/chat/`

| Mobile file (NEW) | Mirrors desktop file |
|---|---|
| `chat/ChatInterface/ChatInterface.tsx` | `apps/desktop/src/renderer/components/Chat/ChatInterface/ChatInterface.tsx` |
| `chat/MessageList/MessageList.tsx` | `.../ChatInterface/components/MessageList/MessageList.tsx` |
| `chat/MessageList/MessagePartsRenderer.tsx` | `.../components/MessagePartsRenderer/MessagePartsRenderer.tsx` |
| `chat/UserMessage/UserMessage.tsx` | `.../UserMessage/UserMessage.tsx` (shadcn message) |
| `chat/AssistantMessage/AssistantMessage.tsx` | `.../AssistantMessage/AssistantMessage.tsx` |
| `chat/ToolCallBlock/ToolCallBlock.tsx` (collapsed-only in mobile-chat v2) | `.../ToolCallBlock/ToolCallBlock.tsx` |
| `chat/PlanBlock/PlanBlock.tsx` | `.../PlanBlock/PlanBlock.tsx` |
| `chat/ReasoningBlock/ReasoningBlock.tsx` | `.../ReasoningBlock/ReasoningBlock.tsx` |
| `chat/SubagentExecutionMessage/SubagentExecutionMessage.tsx` | `.../SubagentExecutionMessage/SubagentExecutionMessage.tsx` |
| `chat/ChatInputFooter/ChatInputFooter.tsx` | `.../ChatInputFooter/ChatInputFooter.tsx` |
| `chat/ChatInputFooter/TiptapPromptEditor.tsx` | `.../TiptapPromptEditor/TiptapPromptEditor.tsx` (port via `@10play/tentap-editor`) |
| `chat/ChatInputFooter/SlashCommandNode.tsx` | `.../TiptapPromptEditor/SlashCommandNode.tsx` |
| `chat/ChatInputFooter/serializeEditorToText.ts` | `.../TiptapPromptEditor/serializeEditorToText.ts` (portable as-is) |
| `chat/SlashCommandMenu/SlashCommandMenu.tsx` | `.../SlashCommandMenu/SlashCommandMenu.tsx` |
| `chat/ModelPicker/ModelPicker.tsx` | `.../ModelPicker/ModelPicker.tsx` |
| `chat/PermissionModePicker/PermissionModePicker.tsx` | `.../PermissionModePicker/PermissionModePicker.tsx` |
| `chat/PendingApprovalCard/PendingApprovalCard.tsx` | `.../components/PendingApprovalMessage/PendingApprovalMessage.tsx` (inline card, container parity with desktop) |
| `chat/PendingApprovalFooter/PendingApprovalFooter.tsx` | NEW — sticky thumb-docked footer with Approve / Decline / Always-allow-category buttons (no desktop analog; desktop has buttons inside the card) |
| `chat/PendingQuestionSheet/PendingQuestionSheet.tsx` | `.../components/PendingQuestionMessage/PendingQuestionMessage.tsx` (UX adapted: inline → bottom sheet for keyboard handling) |
| `app/(authenticated)/chat/[sessionId]/plan-review/[planId].tsx` (pushed route) | `.../components/PendingPlanApprovalMessage/PendingPlanApprovalMessage.tsx` (UX adapted: inline → full-screen modal for long-form markdown) |
| `chat/PendingActionIndicator/PendingActionIndicator.tsx` | NEW — floating "Tap to respond" pill; no desktop analog (desktop assumes pause cards are always visible in a fixed-width pane) |

### Design tokens

Mobile `apps/mobile/global.css` already provides all 20 semantic color tokens (`--color-background`, `--color-foreground`, `--color-muted`, `--color-muted-foreground`, `--color-card`, `--color-card-foreground`, `--color-popover`, `--color-popover-foreground`, `--color-primary`, `--color-primary-foreground`, `--color-secondary`, `--color-secondary-foreground`, `--color-accent`, `--color-accent-foreground`, `--color-destructive`, `--color-destructive-foreground`, `--color-border`, `--color-input`, `--color-ring`, `--radius`) under both `@variant light` and `@variant dark`. No new tokens required for mobile-chat v2.

Palette delta vs desktop: mobile is cool-neutral, desktop is warm-ember. Cross-app brand alignment deferred — flagged in 09-team-contributions.md as an open product decision.

### Tailwind class translation rules (from design audit)

| Desktop pattern | Mobile substitute |
|---|---|
| `space-y-N` | `gap-N` on a `flex-col View` |
| `transition-colors`, `transition-opacity`, `transition-transform`, `duration-*`, `ease-*` | Reanimated `useAnimatedStyle` / `withTiming` / `FadeIn`/`FadeOut` |
| `hover:*` | `active:*` or `Platform.select({ web: 'hover:...' })` (skip web on RN) |
| `focus-visible:*`, `outline-none` | Platform.select web; skip on native |
| `dark:foo` prefix | `@variant dark { --color-foo: ... }` in `global.css` |
| `group-hover:*`, `group-data-[...]:*` | Reanimated shared values + conditional render |
| `whitespace-pre-wrap`, `select-text` | RN `Text` with `selectable` prop |
| `var(--radix-popover-trigger-width)` | Measure via `onLayout` |
| `[&_complex_selector]` | Per-element components |
| `max-w-[calc(100vw-2rem)]` | `Dimensions.get('window').width - 32` |
| `streamdown` markdown | `react-native-markdown-display` (or alternative) |

### Hit targets

All interactive controls in pause sheets (UC-PAUSE-01/02/03 actions) and composer toolbar (model/thinking/permission pickers, Send/Stop) MUST be at least 44pt tall to meet WCAG mobile guidelines. Desktop's `py-1 px-2` (8pt) is below threshold; mobile equivalents use `h-11` minimum.

## Open technical sub-decisions (deferred to sprint planning)

These were flagged but not closed during research; `/kb-sprint-plan` should slot them into specific sprints:

1. **JWT lifecycle for mobile → relay**: per-call mint via cloud tRPC vs device-held longer-lived host token vs server-side proxy. Trade-off: security boundary vs latency vs offline UX.
2. **Live streaming transport**: SSE through relay (requires extending `apps/relay`'s WS tunnel to proxy `text/event-stream`) vs chunked HTTP through relay vs cloud DurableStreams SSE (existing path at `/api/chat/[sessionId]/stream`). Mobile-chat v2 may ship with periodic `chat.getSnapshot` polling and defer streaming to a follow-up mobile-chat PRD.
3. **Markdown library choice**: `react-native-markdown-display` (widely-used, opinionated styling) vs `@expensify/react-native-live-markdown` (faster but newer/less battle-tested) vs custom thin wrapper. Benchmarks needed.
4. **Tiptap WebView perf on mid-range Android**: validate that `@10play/tentap-editor` keyboard handling + input latency are acceptable on Android 11+ devices with 4GB RAM. Define a perf budget before locking in.
5. **Snapshot polling interval (if streaming deferred)**: 250ms? 500ms? 1s? Battery vs latency vs server load.
