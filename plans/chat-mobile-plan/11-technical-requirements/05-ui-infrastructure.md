# UI Infrastructure

## Component-tree mirror to `apps/mobile/components/chat/`

Components follow AGENTS.md co-location rules (folder-per-component, barrel `index.ts`, subcomponents nest under parent's `components/`). See `12-component-organization-addendum.md` for full convention details.

In addition to the `components/chat/` tree below, **shell-level navigation components** (UC-NAV-* surfaces) live in `apps/mobile/screens/(authenticated)/(chat)/` per the project's screen co-location convention:

- `SessionsListScreen/` — UC-NAV-01, UC-NAV-02, UC-NAV-07 (sessions list with workspace sections + FAB + search). Holds `sectionDisplayCounts: Record<workspaceId, number>` (per-section pagination, persisted via async-storage per `(userId, hostId)`) and `searchQuery: string` (in-memory only).
  - `components/WorkspaceSection/` — section header rendered as **sticky during scroll** (UC-NAV-02; contact-directory pattern). Uses FlashList `stickyHeaderIndices` over a flattened-with-headers data array per https://shopify.github.io/flash-list/docs/guides/section-list. Fallback if v1.7.x sticky proves unsatisfactory: switch to RN built-in `SectionList` with `stickySectionHeadersEnabled={true}` — simpler API, less virtualization tuning, decision deferred to the sprint that builds this component.
    - `components/LoadMorePill/` — "Load more (N more)" affordance appended to the section when `displayedCount < totalCount` and multi-workspace mode is active (UC-NAV-02)
  - `components/SessionRow/` — single session row with status icon (`⌖ ⚠ ● ○`)
  - `components/SessionSearchBar/` — header TextInput driving the cross-workspace title filter (UC-NAV-07). Debounced query state (~100ms) feeds a memoized selector over the synced `chat_sessions` Electric collection — client-side filter only, no backend calls.
  - `components/HostChip/` — header host display + tap target (UC-NAV-03 trigger)
  - `components/NewChatFab/` — floating "+" button (UC-NAV-04 trigger)
  - `components/SessionsEmptyState/` — UC-NAV-06 three-state renderer plus a fourth "no search results" state when `searchQuery` is non-empty and no sessions match
- `HostPickerSheet/` — UC-NAV-03 bottom sheet (`@gorhom/bottom-sheet` + `BottomSheetFlatList` of hosts)
- `NewChatSheet/` — UC-NAV-04 workspace-picker sheet
- `providers/SelectedHostProvider/` — local state + `expo-secure-store` persistence of `selectedHostId` keyed by `userId+organizationId`
- `hooks/useSelectedHost/` — read/write the selected host
- `hooks/useAccessibleHosts/` — query `v2_users_hosts` joined to `v2_hosts` (Electric collection)
- `hooks/useSessionsForHost/` — derived selector over `chat_sessions` + `v2_workspaces` Electric collections, scoped to the selected host
- `utils/handleDeepLink/` — UC-NAV-05 routing logic invoked by the Expo notification handler

```
components/chat/
├── ChatInterface/
│   ├── ChatInterface.tsx
│   ├── components/
│   │   ├── MessageList/
│   │   │   ├── MessageList.tsx
│   │   │   ├── components/
│   │   │   │   ├── MessagePartsRenderer/
│   │   │   │   │   ├── MessagePartsRenderer.tsx
│   │   │   │   │   └── index.ts
│   │   │   │   ├── UserMessage/
│   │   │   │   │   ├── UserMessage.tsx
│   │   │   │   │   └── index.ts
│   │   │   │   ├── AssistantMessage/
│   │   │   │   │   ├── AssistantMessage.tsx
│   │   │   │   │   ├── components/
│   │   │   │   │   │   ├── MessageMarkdown/
│   │   │   │   │   │   │   ├── MessageMarkdown.tsx
│   │   │   │   │   │   │   └── index.ts
│   │   │   │   │   │   └── ReasoningBlock/
│   │   │   │   │   │       ├── ReasoningBlock.tsx
│   │   │   │   │   │       └── index.ts
│   │   │   │   │   └── index.ts
│   │   │   │   ├── ToolCallBlock/
│   │   │   │   │   ├── ToolCallBlock.tsx  (collapsed-only in v2)
│   │   │   │   │   └── index.ts
│   │   │   │   ├── PlanBlock/
│   │   │   │   │   ├── PlanBlock.tsx
│   │   │   │   │   └── index.ts
│   │   │   │   └── SubagentExecutionMessage/
│   │   │   │       ├── SubagentExecutionMessage.tsx
│   │   │   │       └── index.ts
│   │   │   ├── hooks/
│   │   │   │   └── useMessageSnapshot.ts
│   │   │   └── index.ts
│   │   ├── ChatInputFooter/
│   │   │   ├── ChatInputFooter.tsx
│   │   │   ├── components/
│   │   │   │   ├── TiptapPromptEditor/
│   │   │   │   │   ├── TiptapPromptEditor.tsx  (port via @10play/tentap-editor)
│   │   │   │   │   ├── SlashCommandNode.tsx    (editor extension — single file)
│   │   │   │   │   ├── FileMentionNode.tsx     (editor extension — single file)
│   │   │   │   │   ├── hooks/
│   │   │   │   │   │   └── useTiptapEditor.ts
│   │   │   │   │   ├── utils/
│   │   │   │   │   │   └── serializeEditorToText.ts  (portable as-is)
│   │   │   │   │   └── index.ts
│   │   │   │   ├── SlashCommandMenu/
│   │   │   │   │   ├── SlashCommandMenu.tsx
│   │   │   │   │   └── index.ts
│   │   │   │   ├── ModelPicker/
│   │   │   │   │   ├── ModelPicker.tsx
│   │   │   │   │   └── index.ts
│   │   │   │   └── PermissionModePicker/
│   │   │   │       ├── PermissionModePicker.tsx
│   │   │   │       └── index.ts
│   │   │   ├── hooks/
│   │   │   │   └── usePendingQuestion.ts
│   │   │   └── index.ts
│   │   ├── PendingApprovalCard/
│   │   │   ├── PendingApprovalCard.tsx  (inline card, container parity with desktop)
│   │   │   └── index.ts
│   │   ├── PendingApprovalFooter/
│   │   │   ├── PendingApprovalFooter.tsx  (NEW — sticky thumb-docked footer)
│   │   │   └── index.ts
│   │   ├── PendingQuestionSheet/
│   │   │   ├── PendingQuestionSheet.tsx  (bottom sheet via @gorhom/bottom-sheet)
│   │   │   └── index.ts
│   │   └── PendingActionIndicator/
│   │       ├── PendingActionIndicator.tsx  (NEW — floating "Tap to respond" pill)
│   │       └── index.ts
│   ├── hooks/
│   │   └── useChatScroll.ts
│   └── index.ts
```

### Desktop mirror mapping

| Mobile path | Desktop path |
|---|---|
| `ChatInterface/ChatInterface.tsx` | `.../Chat/ChatInterface/ChatInterface.tsx` |
| `MessageList/MessageList.tsx` | `.../ChatInterface/components/MessageList/MessageList.tsx` |
| `MessagePartsRenderer/MessagePartsRenderer.tsx` | `.../components/MessagePartsRenderer/MessagePartsRenderer.tsx` |
| `UserMessage/UserMessage.tsx` | `.../UserMessage/UserMessage.tsx` |
| `AssistantMessage/AssistantMessage.tsx` | `.../AssistantMessage/AssistantMessage.tsx` |
| `ToolCallBlock/ToolCallBlock.tsx` | `.../ToolCallBlock/ToolCallBlock.tsx` |
| `PlanBlock/PlanBlock.tsx` | `.../PlanBlock/PlanBlock.tsx` |
| `ReasoningBlock/ReasoningBlock.tsx` | `.../ReasoningBlock/ReasoningBlock.tsx` |
| `SubagentExecutionMessage/SubagentExecutionMessage.tsx` | `.../SubagentExecutionMessage/SubagentExecutionMessage.tsx` |
| `ChatInputFooter/ChatInputFooter.tsx` | `.../ChatInputFooter/ChatInputFooter.tsx` |
| `TiptapPromptEditor/TiptapPromptEditor.tsx` | `.../TiptapPromptEditor/TiptapPromptEditor.tsx` |
| `TiptapPromptEditor/SlashCommandNode.tsx` | `.../TiptapPromptEditor/SlashCommandNode.tsx` |
| `TiptapPromptEditor/serializeEditorToText.ts` | `.../TiptapPromptEditor/serializeEditorToText.ts` |
| `SlashCommandMenu/SlashCommandMenu.tsx` | `.../SlashCommandMenu/SlashCommandMenu.tsx` |
| `ModelPicker/ModelPicker.tsx` | `.../ModelPicker/ModelPicker.tsx` |
| `PermissionModePicker/PermissionModePicker.tsx` | `.../PermissionModePicker/PermissionModePicker.tsx` |
| `PendingApprovalCard/PendingApprovalCard.tsx` | `.../PendingApprovalMessage/PendingApprovalMessage.tsx` |
| `PendingApprovalFooter/PendingApprovalFooter.tsx` | NEW — no desktop analog |
| `PendingQuestionSheet/PendingQuestionSheet.tsx` | `.../PendingQuestionMessage/PendingQuestionMessage.tsx` (UX adapted: inline → bottom sheet) |
| `PendingActionIndicator/PendingActionIndicator.tsx` | NEW — no desktop analog |

## Screen structure

Routes live in `app/` (thin re-exports), screen logic lives in `screens/`. Navigation config (`_layout.tsx`) stays in `app/` per the hybrid approach documented in `plans/mobile-app-structure-comparison.md`.

```
app/(authenticated)/chat/
├── _layout.tsx                          # Stack layout config — STAYS IN APP
└── [sessionId]/
    ├── index.tsx                        # export { default } from "@/screens/..."
    └── plan-review/
        └── [planId].tsx                 # export { default } from "@/screens/..."

screens/(authenticated)/chat/[sessionId]/
├── ChatScreen/
│   ├── ChatScreen.tsx                   # Main chat screen
│   ├── components/
│   │   └── ChatHeader/
│   │       ├── ChatHeader.tsx
│   │       └── index.ts
│   ├── hooks/
│   │   ├── useSessionResume.ts          # Reconnect/cursor protocol (UC-PLATF-02)
│   │   └── useChatNavigation.ts
│   └── index.ts
└── plan-review/
    └── [planId]/
        ├── PlanReviewScreen.tsx         # Full-screen plan approval (UC-PAUSE-03)
        └── index.ts
```

## Lib structure

```
lib/
├── host-service-client.ts               # HTTP+tRPC client against host-service via relay
├── collections/
│   ├── collections.ts                   # MODIFY — add chat_sessions Electric collection
│   └── index.ts
└── push-notifications/
    ├── token.ts                         # Expo push token registration
    ├── handlers.ts                      # Foreground/background notification handling
    └── index.ts
```

## Design tokens

Mobile `apps/mobile/global.css` already provides all 20 semantic color tokens (`--color-background`, `--color-foreground`, `--color-muted`, `--color-muted-foreground`, `--color-card`, `--color-card-foreground`, `--color-popover`, `--color-popover-foreground`, `--color-primary`, `--color-primary-foreground`, `--color-secondary`, `--color-secondary-foreground`, `--color-accent`, `--color-accent-foreground`, `--color-destructive`, `--color-destructive-foreground`, `--color-border`, `--color-input`, `--color-ring`, `--radius`) under both `@variant light` and `@variant dark`. No new tokens required for mobile-chat v2.

Palette delta vs desktop: mobile is cool-neutral, desktop is warm-ember. Cross-app brand alignment deferred — flagged in 09-team-contributions.md as an open product decision.

## Tailwind class translation rules (from design audit)

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

## Hit targets

All interactive controls in pause sheets (UC-PAUSE-01/02/03 actions) and composer toolbar (model/thinking/permission pickers, Send/Stop) MUST be at least 44pt tall to meet WCAG mobile guidelines. Desktop's `py-1 px-2` (8pt) is below threshold; mobile equivalents use `h-11` minimum.
