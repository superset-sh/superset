---
stability: CONSTITUTION
last_validated: 2026-05-21
prd_version: 1.3.1
---

# Mobile Chat v2 — Component Organization Addendum

Establishes component organization conventions for `apps/mobile/components/chat/` derived from AGENTS.md rules and Cadra monorepo reference patterns (see `plans/mobile-app-structure-comparison.md`).

## Convention 1: Folder-per-component with barrel exports

Every React UI component gets its own PascalCase folder:

```
ComponentName/
├── ComponentName.tsx      # ONE component per file
├── index.ts               # Barrel export: export { ComponentName } from './ComponentName'
└── components/            # Subcomponents used only by this parent
```

Exception: Tiptap editor extensions (`SlashCommandNode.tsx`, `FileMentionNode.tsx`) are single files inside `TiptapPromptEditor/` — they are config objects, not UI components.

## Convention 2: Subcomponent nesting (co-locate by usage)

Components only used by one parent nest under that parent's `components/` directory. This mirrors Cadra's deep nesting pattern (e.g., `ActiveLiftingActivityManager/components/ActiveLiftingActivitySheet/components/ExerciseList/`).

**Chat-specific nesting rules:**

| Component | Parent | Why |
|---|---|---|
| `UserMessage`, `AssistantMessage`, `ToolCallBlock`, `PlanBlock`, `SubagentExecutionMessage`, `MessagePartsRenderer` | `MessageList/components/` | Only rendered inside MessageList |
| `MessageMarkdown`, `ReasoningBlock` | `AssistantMessage/components/` | Subparts of assistant message rendering |
| `TiptapPromptEditor`, `SlashCommandMenu`, `ModelPicker`, `PermissionModePicker` | `ChatInputFooter/components/` | Compose the input area |
| `PendingApprovalCard`, `PendingApprovalFooter`, `PendingQuestionSheet`, `PendingActionIndicator` | `ChatInterface/components/` | Rendered inside ChatInterface alongside MessageList and ChatInputFooter |

Promote to a higher level only when a component is used in 2+ places (AGENTS.md "used 2+ times" rule).

## Convention 3: Co-located hooks and utils

Hooks and utils live next to the component that uses them:

| Location | Contains |
|---|---|
| `MessageList/hooks/useMessageSnapshot.ts` | FlashList data binding, snapshot diffing |
| `ChatInputFooter/hooks/usePendingQuestion.ts` | Bottom sheet state for pending questions |
| `TiptapPromptEditor/hooks/useTiptapEditor.ts` | Editor instance lifecycle |
| `TiptapPromptEditor/utils/serializeEditorToText.ts` | Editor → plain text serialization |
| `ChatInterface/hooks/useChatScroll.ts` | Auto-scroll and scroll-back affordance |
| `ChatScreen/hooks/useSessionResume.ts` | Reconnect/cursor reconciliation on foreground |

## Convention 4: Route vs screen boundary

Following the hybrid approach from `plans/mobile-app-structure-comparison.md`:

**Keep in `app/`:**
- `_layout.tsx` files (navigation config, tab/stack setup)
- Redirect-only routes (no UI, just `<Redirect>`)

**Move to `screens/`:**
- Any route file with actual UI components
- Screen-specific hooks and components
- Barrel-exported via `export { default } from "@/screens/..."`

```
app/(authenticated)/chat/[sessionId]/index.tsx    → re-exports ChatScreen
screens/(authenticated)/chat/[sessionId]/ChatScreen/ → actual implementation
```

## Convention 5: Lib organization

Utility libraries under `lib/` follow flat-file or small-directory pattern:

- `lib/host-service-client.ts` — single file, not a directory (one concern: tRPC HTTP client)
- `lib/collections/` — directory with index barrel (multiple collection definitions)
- `lib/push-notifications/` — directory with index barrel (token + handlers + types)

## Source references

- AGENTS.md "Project Structure" section — canonical rules for the Superset monorepo
- Cadra monorepo `CLAUDE.md` — PascalCase folder-per-component enforcement
- `plans/mobile-app-structure-comparison.md` — hybrid route/screen approach analysis
- `plans/20260521-mobile-chat-design-audit.md` — uniwind/Tailwind compatibility for chat components
