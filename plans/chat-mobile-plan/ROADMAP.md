---
roadmap: 1
project: Mobile Chat v2
generated: 2026-05-21T00:00:00Z
prd: ./README.md
sprint_count: 11
pr_sequencing: true
gate_strategy: ui-first-via-storybook
---

# Sprint Roadmap: Mobile Chat v2

## Overview

**Sprints:** 11
**Total Tasks:** 95
**Current Sprint:** — (all Planned)

**Planning Specialists:** `react-native-ui-planner` · `node-planner` · `frontend-designer`

**Gate strategy.** This roadmap is organized **UI-first**: Phase 1 (Sprints 01–05) ships pure, props-driven components with co-located Storybook stories — verified by a reviewer who launches the mobile app in Storybook mode (`EXPO_PUBLIC_STORYBOOK=true`) on iOS Simulator and Android Emulator and navigates each component's state matrix. Phase 2 (Sprints 06–11) composes those components into real app screens, wires them to real services (Electric, host-service tRPC, relay-routed push pipeline), and verifies each user-facing surface end-to-end via Maestro flows against real services.

> **Skill-rule override (per user direction, 2026-05-21).** The `kb-sprint-plan` skill's default test-step rule rejects `\bstorybook\b` as a verification surface ("Storybook is a developer tool, not the product"). This roadmap **intentionally overrides** that rule for Phase 1 only, because the testing strategy spelled out in `13-testing-strategy.md` explicitly designates Storybook 9 (under custom root toggle `EXPO_PUBLIC_STORYBOOK=true` with build-time stripping for production) as the Phase 1 verification harness, and the user has selected this strategy. Phase 2 sprints use Maestro E2E against the running app per the default rule.

> **PR sequencing enabled.** Lifecycle: 🔵 Planned → 🟠 In flight → 🟣 In review → ✅ Completed → 🔴 Blocked. PR cell required for Completed status. See [`~/Projects/brain/docs/PR-SEQUENCING.md`](~/Projects/brain/docs/PR-SEQUENCING.md) for the full convention.

## Sprint Sequence

| # | Sprint | Gate | Tasks | Dependencies | Status | Branch | PR |
|---|--------|------|-------|--------------|--------|--------|----|
| 1 | [Sprint 01: Storybook Infra + Sessions List Components](#sprint-01-storybook-infra--sessions-list-components) | Sessions-list-tier components render correctly in Storybook on simulator/emulator across all state matrices | 10 | — | 🔵 Planned | `chat-mobile-storybook-sessions` | — |
| 2 | [Sprint 02: Chat View Components](#sprint-02-chat-view-components) | Chat-tree render components render correctly in Storybook across all message-type states | 9 | Sprint 01 | 🔵 Planned | `chat-mobile-chat-render` | — |
| 3 | [Sprint 03: Composer Components](#sprint-03-composer-components) | Composer components (Tiptap editor + pickers + slash menu + new-chat sheet) render correctly in Storybook with all interaction states | 10 | Sprint 01 | 🔵 Planned | `chat-mobile-composer` | — |
| 4 | [Sprint 04: Pause Container Components](#sprint-04-pause-container-components) | All four pause containers render correctly in Storybook (approval card + sticky footer with 1-of-N, ask_user bottom sheet, plan-review full-screen, pending-action pill) | 9 | Sprint 01, 02 | 🔵 Planned | `chat-mobile-pause-components` | — |
| 5 | [Sprint 05: Platform Surface Components](#sprint-05-platform-surface-components) | Platform surface components render correctly in Storybook (push pre-prompt, re-enable-in-settings banner per permission state, host-offline banner per dispatch outcome variant) | 6 | Sprint 01 | 🔵 Planned | `chat-mobile-platform-components` | — |
| 6 | [Sprint 06: Sessions List Integration](#sprint-06-sessions-list-integration) | A signed-in user taps the Chat tab and uses the full real sessions list — workspace sections with sticky scroll, search, load-more, host picker, empty states — backed by Electric collections; sessions created on desktop appear within 3s | 12 | Sprint 01 | 🔵 Planned | `chat-mobile-sessions-int` | — |
| 7 | [Sprint 07: Chat View Read + Session Management](#sprint-07-chat-view-read--session-management) | User taps a real session, opens the chat view, sees real message history rendered with all types and live streaming-cursor updates; End / Rename / Delete via overflow + swipe-delete work end-to-end | 8 | Sprint 02, 06 | 🔵 Planned | `chat-mobile-chat-view-int` | — |
| 8 | [Sprint 08: Compose + Send Integration](#sprint-08-compose--send-integration) | User taps FAB to create a real session, types and sends a message (real optimistic + streaming), Stops a running turn; slash commands and model picker load real data from host | 6 | Sprint 03, 07 | 🔵 Planned | `chat-mobile-send-int` | — |
| 9 | [Sprint 09: Pause Response Integration](#sprint-09-pause-response-integration) | Real agent tool-approval / ask_user / plan-approval pauses trigger correct containers with live data; user responds and agent resumes end-to-end | 5 | Sprint 04, 08 | 🔵 Planned | `chat-mobile-pause-int` | — |
| 10 | [Sprint 10: Push Notifications (Server + Mobile)](#sprint-10-push-notifications-server--mobile) | Real agent event on connected host triggers OS push delivered via APNs/FCM through Expo; tap opens correct session with silent host alignment; pre-prompt + foreground suppression + re-enable flow all work end-to-end | 19 | Sprint 05, 09 | 🔵 Planned | `chat-mobile-push` | — |
| 11 | [Sprint 11: Offline + Background Resume](#sprint-11-offline--background-resume) | Real host-offline produces banner + disabled Send + correct dispatch outcome surfacing; real reconnect auto-resumes; background → foreground catches up missed events | 3 | Sprint 05, 08, 10 | 🔵 Planned | `chat-mobile-offline` | — |

---

## Per-Sprint Details

### Sprint 01: Storybook Infra + Sessions List Components

**Sequence:** 1
**Timeline:** Phase 1 — UI Components
**Status:** 🔵 Planned
**Branch:** `chat-mobile-storybook-sessions`
**PR:** —

#### Human Testing Gate

**Gate:** Reviewer launches the mobile app in Storybook mode on iOS Simulator and Android Emulator and navigates every sessions-list-tier component (SessionRow, WorkspaceSection, LoadMorePill, HostChip, NewChatFab, SessionSearchBar, SessionsEmptyState, HostPickerSheet) seeing every documented state render correctly against design tokens on both light and dark themes.

**Test Steps:**
1. From `apps/mobile/`, start the app in Storybook mode: `EXPO_PUBLIC_STORYBOOK=true bun start` — open the iOS Simulator and Android Emulator simultaneously.
2. Navigate Storybook's on-device controls to **SessionRow** stories and tap through each variant — confirm the streaming (`⌖`), pause-pending (`⚠`), idle (`●`), and dormant (`○`) status icons render with the correct token-derived colors, and long-press copies the title to the clipboard.
3. Navigate to **WorkspaceSection** stories — verify collapsed/expanded chevron states, the sticky-header visual layout, and the empty-workspace-with-CTA variant.
4. Navigate to **LoadMorePill** stories — confirm the "Load more (N more)" button at 44pt with `--color-secondary` background and `--radius` corners.
5. Navigate to **HostChip**, **NewChatFab**, and **SessionSearchBar** stories — confirm shadow + 56pt FAB, online/offline chip indicator, placeholder + focused state + clear (✕) affordance.
6. Navigate to **SessionsEmptyState** stories — verify all four variants (no-hosts / no-workspaces / no-sessions / no-search) render with the correct icon, heading, body copy, and CTA per the design sticker sheet.
7. Navigate to **HostPickerSheet** stories — confirm sheet handle, header, online/offline row badges, currently-selected check, and meta-line typography across populated and empty variants.
8. Toggle Storybook from light to dark theme via the on-device controls and re-verify every component renders correctly on both themes.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| MOB-INFRA-001 | Install chat-tree runtime dependencies in apps/mobile | react-native-ui-implementer | 60 min |
| MOB-INFRA-002 | Configure Storybook 9 with root toggle and custom .rnstorybook directory | react-native-ui-implementer | 180 min |
| MOB-NAV-002 | Build SessionRow component with status icon and Storybook stories | react-native-ui-implementer | 120 min |
| MOB-NAV-003 | Build WorkspaceSection + LoadMorePill subcomponents with stories | react-native-ui-implementer | 180 min |
| MOB-NAV-004 | Build HostChip, NewChatFab, SessionSearchBar, and SessionsEmptyState components with stories | react-native-ui-implementer | 180 min |
| MOB-NAV-008-UI | Build HostPickerSheet component (props-driven; no real data wiring) with stories | react-native-ui-implementer | 150 min |
| DESIGN-NAV-001 | Sticker sheet — SessionsListScreen header, session row, workspace section header, LoadMorePill | frontend-designer | 90 min |
| DESIGN-NAV-002 | Sticker sheet — HostPickerSheet (host picker bottom sheet) | frontend-designer | 45 min |
| DESIGN-NAV-003 | Sticker sheet — NewChatSheet (workspace picker) + empty states | frontend-designer | 60 min |
| DESIGN-PLATF-003 | Iconography spec — Lucide icon set for chat actions | frontend-designer | 30 min |

**Next Sprint Tasks:** *(populated JIT when sprint becomes active by kb-sprint-tasks-plan)*

#### Dependencies

- Blocks: Sprint 02, 03, 04, 05, 06
- Dependent on: None

#### PRD Coverage

- UC-NAV-01 (components)
- UC-NAV-02 (components — SessionRow, WorkspaceSection, LoadMorePill)
- UC-NAV-03 (HostPickerSheet component)
- UC-NAV-04 (NewChatFab + SessionsEmptyState component)
- UC-NAV-06 (SessionsEmptyState component)
- UC-NAV-07 (SessionSearchBar component)
- 11-technical-requirements/04-dependencies.md
- 11-technical-requirements/05-ui-infrastructure.md
- 12-component-organization-addendum.md
- 13-testing-strategy.md

---

### Sprint 02: Chat View Components

**Sequence:** 2
**Timeline:** Phase 1 — UI Components
**Status:** 🔵 Planned
**Branch:** `chat-mobile-chat-render`
**PR:** —

#### Human Testing Gate

**Gate:** Reviewer launches the mobile app in Storybook mode on simulator/emulator and navigates every chat-tree render component (UserMessage, AssistantMessage, MessageMarkdown, ToolCallBlock, PlanBlock, ReasoningBlock, SubagentExecutionMessage, ScrollBackButton) confirming every documented message-type and interaction state renders correctly against the design sticker sheets.

**Test Steps:**
1. Launch the mobile app in Storybook mode (`EXPO_PUBLIC_STORYBOOK=true bun start`) on iOS Simulator and Android Emulator.
2. Navigate to **UserMessage** stories — confirm right-aligned bubble with `bg-secondary` styling and `max-w-[85%]` cap across short / multi-paragraph / long-with-truncation variants; long-press copies text to the clipboard.
3. Navigate to **AssistantMessage** stories — confirm left-aligned full-width rendering with optional streaming-cursor variant (Reanimated blink).
4. Navigate to **MessageMarkdown** stories — verify code blocks render with syntax highlighting, lists / headings / blockquotes / tables / horizontal rules render correctly, inline code uses contrasting background, links are tappable, long-press on a code block copies its full content.
5. Navigate to **ToolCallBlock** stories — confirm collapsed card with running / completed / failed status indicators and right-pointing chevron; no expansion UI per UC-RENDER-04.
6. Navigate to **PlanBlock** and **ReasoningBlock** stories — confirm collapsed and expanded variants with smooth chevron rotation.
7. Navigate to **SubagentExecutionMessage** stories — confirm visual nesting and left-border indentation per the design spec.
8. Navigate to **ScrollBackButton** stories — confirm Reanimated FadeIn / FadeOut animation states and 44pt hit target.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| MOB-RENDER-001 | Build UserMessage and AssistantMessage components with Storybook stories | react-native-ui-implementer | 180 min |
| MOB-RENDER-003 | Build MessageMarkdown renderer with react-native-markdown-display | react-native-ui-implementer | 240 min |
| MOB-RENDER-004 | Build ToolCallBlock collapsed-only card with status indicator | react-native-ui-implementer | 120 min |
| MOB-RENDER-005 | Build PlanBlock and ReasoningBlock collapsible cards with stories | react-native-ui-implementer | 180 min |
| MOB-RENDER-006 | Build SubagentExecutionMessage nested-group renderer | react-native-ui-implementer | 120 min |
| MOB-RENDER-008-UI | Build ScrollBackButton component (Reanimated fade, props-driven) with stories | react-native-ui-implementer | 90 min |
| DESIGN-CHAT-001 | Sticker sheet — message tree foundation (UserMessage, AssistantMessage, ToolCallBlock, PlanBlock, ReasoningBlock, SubagentExecutionMessage) | frontend-designer | 90 min |
| DESIGN-CHAT-002 | Sticker sheet — MessageMarkdown and streaming cursor | frontend-designer | 75 min |
| DESIGN-CHAT-003 | Sticker sheet — message list affordances (auto-scroll anchor + scroll-back button) | frontend-designer | 30 min |

**Next Sprint Tasks:** *(populated JIT when sprint becomes active by kb-sprint-tasks-plan)*

#### Dependencies

- Blocks: Sprint 07
- Dependent on: Sprint 01

#### PRD Coverage

- UC-RENDER-01 (UserMessage, AssistantMessage components)
- UC-RENDER-03 (MessageMarkdown component)
- UC-RENDER-04 (ToolCallBlock component)
- UC-RENDER-05 (PlanBlock + ReasoningBlock components)
- UC-RENDER-06 (SubagentExecutionMessage component)
- UC-RENDER-07 (ScrollBackButton component)

---

### Sprint 03: Composer Components

**Sequence:** 3
**Timeline:** Phase 1 — UI Components
**Status:** 🔵 Planned
**Branch:** `chat-mobile-composer`
**PR:** —

#### Human Testing Gate

**Gate:** Reviewer launches the mobile app in Storybook mode on simulator/emulator and navigates every composer component (TiptapPromptEditor, SlashCommandNode + FileMentionNode atomic-pill behavior, SlashCommandMenu, ModelPicker, PermissionModePicker, ThinkingLevelPicker, NewChatSheet) confirming every input + popover + Tiptap-pill state renders correctly per the design sticker sheets.

**Test Steps:**
1. Launch the mobile app in Storybook mode on iOS Simulator and Android Emulator.
2. Navigate to **TiptapPromptEditor** stories — confirm empty-with-placeholder, typed-text, slash-pill-inserted, file-mention-placeholder, multi-line autogrow, and autogrow-cap states; verify keyboard reveals smoothly and caret positions correctly.
3. Navigate to **SlashCommandMenu** stories — verify the popover with built-in commands only, built-in + custom commands mixed, description + arg-hint rendering, preview-loading state, and empty-loading state.
4. Navigate to **ModelPicker** stories — confirm popover with mock model list (Opus 4.7, Sonnet 4.6, Haiku 4.5, GPT-5.5 etc.) and selected-model label state in the trigger.
5. Navigate to **PermissionModePicker** and **ThinkingLevelPicker** stories — confirm popover with `off / low / medium / high / xhigh` for thinking-level, plus permission mode variants, and selected-state rendering in each trigger.
6. Navigate to **NewChatSheet** stories — confirm workspace-row layout, sort treatment (sessions-first then empty), empty-host inline message, and no-sessions-yet meta line.
7. Toggle light/dark theme and re-verify every component on both themes; verify all toolbar controls meet the 44pt hit-target rule.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| MOB-COMP-001 | Build TiptapPromptEditor WebView shell with @10play/tentap-editor | react-native-ui-implementer | 240 min |
| MOB-COMP-002 | Build SlashCommandNode and FileMentionNode Tiptap editor extensions | react-native-ui-implementer | 180 min |
| MOB-COMP-003-UI | Build SlashCommandMenu @rn-primitives popover (props-driven, mock command list) with stories | react-native-ui-implementer | 150 min |
| MOB-COMP-004-UI | Build ModelPicker @rn-primitives popover (props-driven, mock model list) with stories | react-native-ui-implementer | 90 min |
| MOB-COMP-005 | Build PermissionModePicker @rn-primitives popover | react-native-ui-implementer | 90 min |
| MOB-COMP-006 | Build ThinkingLevelPicker @rn-primitives popover | react-native-ui-implementer | 90 min |
| MOB-NAV-009-UI | Build NewChatSheet component (props-driven workspace list) with stories | react-native-ui-implementer | 120 min |
| DESIGN-COMP-001 | Sticker sheet — ChatInputFooter composer layout and toolbar | frontend-designer | 75 min |
| DESIGN-COMP-002 | Sticker sheet — TiptapPromptEditor states and slash-pill rendering | frontend-designer | 60 min |
| DESIGN-COMP-003 | Sticker sheet — SlashCommandMenu popover | frontend-designer | 45 min |

**Next Sprint Tasks:** *(populated JIT when sprint becomes active by kb-sprint-tasks-plan)*

#### Dependencies

- Blocks: Sprint 08
- Dependent on: Sprint 01

#### PRD Coverage

- UC-COMP-01 (TiptapPromptEditor + extensions + SlashCommandMenu component)
- UC-COMP-04 (ModelPicker component)
- UC-COMP-05 (PermissionModePicker + ThinkingLevelPicker components)
- UC-NAV-04 (NewChatSheet component)

---

### Sprint 04: Pause Container Components

**Sequence:** 4
**Timeline:** Phase 1 — UI Components
**Status:** 🔵 Planned
**Branch:** `chat-mobile-pause-components`
**PR:** —

#### Human Testing Gate

**Gate:** Reviewer launches the mobile app in Storybook mode on simulator/emulator and navigates every pause container component (PendingApprovalCard, PendingApprovalFooter with 1-of-N indicator, PendingQuestionSheet with keyboard-active state, PlanReviewScreen with feedback-expanded state, PendingActionIndicator per pause variant) confirming every state matrix renders correctly per the design sticker sheets.

**Test Steps:**
1. Launch the mobile app in Storybook mode on iOS Simulator and Android Emulator.
2. Navigate to **PendingApprovalCard** stories — confirm tool-name typography, short description, arguments preview (collapsed JSON with truncation), pending state with `--color-destructive` left accent, and resolved-approved / resolved-declined states.
3. Navigate to **PendingApprovalFooter** stories — confirm 44pt-tall Approve / Decline / Always-allow buttons, 1-of-N indicator in multi-approval variant, safe-area-bottom awareness, and optimistic-tap ghosting state.
4. Navigate to **PendingQuestionSheet** stories — confirm bottom-sheet snap points (50% / 85%), question text prominence, horizontal-scroll suggested-answer pill row, BottomSheetTextInput multi-line, Send button alignment; verify the keyboard-active state visually pushes the sheet to 85%.
5. Navigate to **PlanReviewScreen** stories — confirm full-screen layout with navigation header + X close, scrollable markdown body (multi-screen content), expandable "Add feedback" section, docked Approve / Reject above safe area, and Reject-disabled when feedback empty.
6. Navigate to **PendingActionIndicator** stories — confirm pill variants per pause type (approval / question / plan) with correct copy and Reanimated FadeIn/FadeOut visual feedback.
7. Toggle light/dark theme and re-verify; confirm all action buttons meet the 44pt hit-target rule per `05-ui-infrastructure.md`.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| MOB-PAUSE-001 | Build PendingApprovalCard inline component with arguments preview | react-native-ui-implementer | 180 min |
| MOB-PAUSE-002 | Build PendingApprovalFooter sticky thumb-docked action footer with 1-of-N indicator | react-native-ui-implementer | 180 min |
| MOB-PAUSE-004 | Build PendingQuestionSheet with @gorhom/bottom-sheet and BottomSheetTextInput | react-native-ui-implementer | 180 min |
| MOB-PAUSE-006-UI | Build PlanReviewScreen full-screen component (standalone; expo-router push wiring deferred to Phase 2) with stories | react-native-ui-implementer | 200 min |
| MOB-PAUSE-008 | Build PendingActionIndicator floating pill with route-aware dispatch | react-native-ui-implementer | 180 min |
| DESIGN-PAUSE-001 | Sticker sheet — PendingApprovalCard (inline) + PendingApprovalFooter (sticky) | frontend-designer | 90 min |
| DESIGN-PAUSE-002 | Sticker sheet — PendingQuestionSheet (ask_user bottom sheet) | frontend-designer | 60 min |
| DESIGN-PAUSE-003 | Sticker sheet — PlanReviewScreen (full-screen modal pushed route) | frontend-designer | 75 min |
| DESIGN-PAUSE-004 | Sticker sheet — PendingActionIndicator (floating pill) | frontend-designer | 30 min |

**Next Sprint Tasks:** *(populated JIT when sprint becomes active by kb-sprint-tasks-plan)*

#### Dependencies

- Blocks: Sprint 09
- Dependent on: Sprint 01, 02 (DESIGN-CHAT-001 informs PendingApprovalCard layout consistency)

#### PRD Coverage

- UC-PAUSE-01 (PendingApprovalCard + PendingApprovalFooter components)
- UC-PAUSE-02 (PendingQuestionSheet component)
- UC-PAUSE-03 (PlanReviewScreen component)
- UC-PAUSE-04 (PendingActionIndicator component)

---

### Sprint 05: Platform Surface Components

**Sequence:** 5
**Timeline:** Phase 1 — UI Components
**Status:** 🔵 Planned
**Branch:** `chat-mobile-platform-components`
**PR:** —

#### Human Testing Gate

**Gate:** Reviewer launches the mobile app in Storybook mode on simulator/emulator and confirms every platform-surface component renders correctly — the PushPrePromptScreen with Enable / Not now CTAs, the re-enable-in-settings banner per permission state (granted / denied / undetermined), and the host-offline banner per dispatch outcome variant (offline / unpaid / dispatch_failed / session-unavailable).

**Test Steps:**
1. Launch the mobile app in Storybook mode on iOS Simulator and Android Emulator.
2. Navigate to **PushPrePromptScreen** stories — confirm the centered illustration / bell icon, heading copy, body copy (matching `07-notifications.md` permission rationale), benefits list, Enable primary button (`--color-primary` fill at 44pt), and Not-now text button at 48pt tap area.
3. Navigate to **RebableInSettingsBanner** stories — verify the granted (hidden), denied (visible with `--color-destructive` accent and "Re-enable in Settings" + `Linking.openSettings()` CTA), and undetermined (informational) variants.
4. Navigate to **HostOfflineBanner** stories — confirm every dispatch outcome variant renders distinct copy: offline-idle ("Host offline — tap to retry"), offline-retrying (spinner + "Reconnecting…"), online (hidden), session-unavailable ("Session unavailable" + back link), `skipped_unpaid` ("Plan upgrade required" or equivalent), `dispatch_failed` ("Host dispatch failed" with retry).
5. Navigate to the **NotificationIconPreview** story — confirm the 192×192 transparent PNG asset renders as a white silhouette at multiple display sizes (192pt, 96pt, 24pt) and matches the Android status-bar small-icon constraints.
6. Toggle light/dark theme and re-verify each component on both themes.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| MOB-PLATF-001 | Build PushPrePromptScreen in-app pre-prompt with Enable/Not now actions | react-native-ui-implementer | 120 min |
| MOB-PLATF-005-UI | Build RebableInSettingsBanner component (props-driven, no permission API wiring) with stories per state | react-native-ui-implementer | 60 min |
| MOB-PLATF-007-UI | Build HostOfflineBanner component (props-driven, no detection wiring) with stories for all dispatch outcome variants | react-native-ui-implementer | 120 min |
| DESIGN-PLATF-001 | Sticker sheet — PushPrePromptScreen (permission pre-prompt) | frontend-designer | 45 min |
| DESIGN-PLATF-002 | Sticker sheet — host-offline banner + retry affordance | frontend-designer | 30 min |
| DESIGN-PLATF-004 | Android notification icon spec + 192×192 transparent PNG asset | frontend-designer | 20 min |

**Next Sprint Tasks:** *(populated JIT when sprint becomes active by kb-sprint-tasks-plan)*

#### Dependencies

- Blocks: Sprint 10, 11
- Dependent on: Sprint 01

#### PRD Coverage

- UC-PLATF-01 (PushPrePromptScreen + RebableInSettingsBanner components)
- UC-PLATF-03 (HostOfflineBanner component)

---

### Sprint 06: Sessions List Integration

**Sequence:** 6
**Timeline:** Phase 2 — Integration
**Status:** 🔵 Planned
**Branch:** `chat-mobile-sessions-int`
**PR:** —

#### Human Testing Gate

**Gate:** A signed-in user taps the Chat tab on the mobile app and uses the complete real sessions list — workspaces grouped under section headers with sticky scroll, search across workspaces, load-more pagination, host switcher backed by `v2_users_hosts`, collapse persistence across restarts, empty-state branches — and a session created from desktop appears in the mobile list within three seconds.

**Test Steps:**
1. Sign in on the mobile app on iOS Simulator and Android Emulator and confirm the bottom navigation shows three tabs: Tasks, Chat, More.
2. Tap **Chat** and confirm the sessions list shows YOUR REAL sessions, grouped by workspace under `{project · branch}` headers sorted by most-recent activity.
3. Scroll down through a long workspace section and confirm the current section header stays pinned to the top of the viewport until the next section pushes it out.
4. Tap a workspace header to collapse it; tap again to expand. Force-quit and reopen the app — collapsed state restored.
5. Type a query into the search bar — confirm only sessions whose title contains the query (case-insensitive) remain visible across workspaces; sections with zero matches hide; tap **✕** to clear.
6. On a multi-workspace host, scroll to the 5th session in a section and tap **Load more (N more)** — confirm 5 more rows append in-place without navigating away.
7. Tap the host chip at top-right — confirm the host-picker bottom sheet lists your real accessible hosts with correct online/offline state; tap a different host and confirm the sessions list re-scopes.
8. Create a chat session on desktop — confirm it appears in the mobile sessions list within ~3 seconds via the Electric shape.
9. Sign in as a user with zero accessible hosts — confirm the "No devices yet" empty state with **Go to Workspaces** CTA appears.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| MOB-INFRA-003 | Install Maestro and seed apps/mobile/.maestro/ with login sub-flow | react-native-ui-implementer | 90 min |
| MOB-INFRA-005 | Add chat_sessions, v2_workspaces, v2_hosts, v2_users_hosts Electric collections | react-native-ui-implementer | 120 min |
| MOB-INFRA-006 | Build SelectedHostProvider + useSelectedHost hook with expo-secure-store persistence | react-native-ui-implementer | 120 min |
| MOB-INFRA-007 | Build useSessionsForHost derived selector hook over chat_sessions + v2_workspaces | react-native-ui-implementer | 120 min |
| MOB-NAV-001 | Create Chat tab route layout under app/(authenticated)/(chat)/_layout.tsx | react-native-ui-implementer | 90 min |
| MOB-NAV-005-INT | Assemble SessionsListScreen composing Phase 1 components with real Electric data | react-native-ui-implementer | 240 min |
| MOB-NAV-006 | Wire sticky-header scroll behavior and validate contact-directory pattern | react-native-ui-implementer | 90 min |
| MOB-NAV-007 | Persist workspace collapse/expand state per (userId, hostId) | react-native-ui-implementer | 60 min |
| MOB-NAV-008-INT | Wire HostPickerSheet to useAccessibleHosts + SelectedHostProvider state | react-native-ui-implementer | 90 min |
| MOB-NAV-010 | Build empty-state rendering for no-hosts, no-workspaces, no-sessions | react-native-ui-implementer | 60 min |
| MOB-NAV-011 | Wire SessionsListScreen footer to 3-tab bar (Tasks, Chat, More) | react-native-ui-implementer | 60 min |
| MOB-PLATF-009 | Verify multi-device sync via existing chat_sessions Electric shape (test + Maestro) | react-native-ui-implementer | 90 min |

**Next Sprint Tasks:** *(populated JIT when sprint becomes active by kb-sprint-tasks-plan)*

#### Dependencies

- Blocks: Sprint 07
- Dependent on: Sprint 01 (Phase 1 sessions-list components)

#### PRD Coverage

- UC-SESS-01 (sessions list with real Electric)
- UC-NAV-01 (Chat tab landing)
- UC-NAV-02 (sticky sections, collapse, per-section pagination)
- UC-NAV-03 (host picker real wiring)
- UC-NAV-06 (empty-state branching)
- UC-NAV-07 (cross-workspace search)
- UC-PLATF-05 (multi-device session sync via Electric)
- 11-technical-requirements/02-api-design.md (Electric collections)
- 11-technical-requirements/06-open-sub-decisions.md (resolved sub-decision #6 — host selection)

---

### Sprint 07: Chat View Read + Session Management

**Sequence:** 7
**Timeline:** Phase 2 — Integration
**Status:** 🔵 Planned
**Branch:** `chat-mobile-chat-view-int`
**PR:** —

#### Human Testing Gate

**Gate:** A user taps any real session from the Chat tab, opens the chat view, sees the full real message history rendered with all message types and live streaming-cursor updates for mid-turn sessions; End / Rename / Delete actions via the overflow menu and swipe-to-delete on the list each succeed end-to-end against the host-service.

**Test Steps:**
1. Sign in on the mobile app and tap a real session row from the Chat tab — confirm the chat view opens with the session title in the header and message history loads via `chat.listMessages` (loading indicator visible during fetch).
2. Confirm the message history renders: assistant messages left-aligned full-width with markdown, user messages right-aligned in a styled bubble capped at ~85% width.
3. Long-press any message — confirm its text copies to the clipboard.
4. Scroll up through history — confirm a floating scroll-to-bottom button fades in; tap it to return to the latest message.
5. Open a session whose host is currently mid-turn — confirm the assistant text streams in atomically every snapshot tick with a blinking cursor; cursor disappears when streaming completes.
6. Open the overflow (•••) menu and tap **Rename** — type a new title and tap Save — confirm the title updates in both the chat header and the sessions list.
7. Open the overflow menu and tap **End session** — confirm a confirmation toast and the chat view returns to a read-only state.
8. Return to the sessions list, swipe a session left → tap **Delete** → confirm the destructive dialog → confirm the session disappears from the list within a few seconds.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| MOB-INFRA-004 | Build typed host-service tRPC HTTP client at lib/host-service-client.ts | react-native-ui-implementer | 180 min |
| MOB-SESS-001 | Render session list-row tap to (chat)/[sessionId] route | react-native-ui-implementer | 60 min |
| MOB-SESS-002 | Build ChatScreen shell with header, loading state, and chat.listMessages fetch | react-native-ui-implementer | 240 min |
| MOB-SESS-003 | Build session-level overflow menu with End / Rename / Delete actions | react-native-ui-implementer | 180 min |
| MOB-SESS-004 | Wire long-press / swipe-to-delete on SessionRow with confirmation | react-native-ui-implementer | 120 min |
| MOB-RENDER-002 | Wire streaming text snapshot polling via chat.getDisplayState + chat.listMessages | react-native-ui-implementer | 180 min |
| MOB-RENDER-007 | Build MessageList FlashList virtualization with MessagePartsRenderer composing Phase 1 renderers | react-native-ui-implementer | 240 min |
| MOB-RENDER-008-INT | Wire ScrollBackButton to FlashList scroll state via useChatScroll | react-native-ui-implementer | 90 min |

**Next Sprint Tasks:** *(populated JIT when sprint becomes active by kb-sprint-tasks-plan)*

#### Dependencies

- Blocks: Sprint 08, 09, 11
- Dependent on: Sprint 02 (chat render components), Sprint 06 (sessions list provides entry points)

#### PRD Coverage

- UC-SESS-02 (resume session with real listMessages)
- UC-SESS-04 (End session)
- UC-SESS-05 (Delete session)
- UC-RENDER-02 (streaming snapshot polling)
- UC-RENDER-07 (auto-scroll + scroll-back affordance)

---

### Sprint 08: Compose + Send Integration

**Sequence:** 8
**Timeline:** Phase 2 — Integration
**Status:** 🔵 Planned
**Branch:** `chat-mobile-send-int`
**PR:** —

#### Human Testing Gate

**Gate:** A user taps the FAB on the sessions list to create a real new session, types a message in the Tiptap editor (with slash commands, models, and pickers loading real data), taps Send to see optimistic append plus a real streaming assistant response, and taps Stop to interrupt a running turn — all verified end-to-end via Maestro flows against a real host.

**Test Steps:**
1. From the Chat tab sessions list, tap the floating **+** FAB — confirm the workspace-picker bottom sheet opens with your real workspaces on the selected host.
2. Tap a workspace — confirm a new chat session is created via cloud `chat.createSession` (visible in the sessions list) and you land in its empty chat view.
3. Type a multi-line message into the input — confirm it grows up to its max height before introducing internal scroll; placeholder disappears.
4. Type `/` — confirm the popover loads REAL commands from the host via `chat.getSlashCommands` (built-in + project-level + user-level custom commands with descriptions and arg hints).
5. Highlight a slash command — confirm the REAL preview from `chat.previewSlashCommand` renders inline; tap to insert as a styled atomic pill.
6. Tap the model picker — confirm REAL models from `chat.getModels` (Opus 4.7, Sonnet 4.6, Haiku 4.5, GPT-5.5, etc.) appear; tap one and confirm the label updates.
7. Tap Send — confirm your message appears immediately (optimistic) and the input clears; watch the real agent response stream in atomically with a blinking cursor.
8. While streaming, tap **Stop** — confirm streaming halts on the host side and the partial response remains in the message list.
9. Send a message while the host is offline — confirm the optimistic append rolls back with an error toast and the input restores with your text.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| MOB-COMP-003-INT | Wire SlashCommandMenu to real chat.getSlashCommands + chat.previewSlashCommand | react-native-ui-implementer | 90 min |
| MOB-COMP-004-INT | Wire ModelPicker to real chat.getModels query | react-native-ui-implementer | 60 min |
| MOB-COMP-007 | Build ChatInputFooter container composing Phase 1 components | react-native-ui-implementer | 180 min |
| MOB-COMP-008 | Wire chat.sendMessage with optimistic append and input clear | react-native-ui-implementer | 180 min |
| MOB-COMP-009 | Wire chat.stop and Send/Stop button swap during streaming | react-native-ui-implementer | 90 min |
| MOB-NAV-009-INT | Wire NewChatSheet to chat.createSession + workspace data + FAB integration | react-native-ui-implementer | 120 min |

**Next Sprint Tasks:** *(populated JIT when sprint becomes active by kb-sprint-tasks-plan)*

#### Dependencies

- Blocks: Sprint 09, 11
- Dependent on: Sprint 03 (composer components), Sprint 07 (ChatScreen + host-service-client)

#### PRD Coverage

- UC-SESS-03 (start new session via FAB → workspace picker)
- UC-COMP-01 (slash command popover wired)
- UC-COMP-02 (send message with optimistic append)
- UC-COMP-03 (stop running turn)
- UC-COMP-04 (model picker wired to chat.getModels)
- UC-NAV-04 (FAB workflow wired)

---

### Sprint 09: Pause Response Integration

**Sequence:** 9
**Timeline:** Phase 2 — Integration
**Status:** 🔵 Planned
**Branch:** `chat-mobile-pause-int`
**PR:** —

#### Human Testing Gate

**Gate:** When the agent really pauses mid-turn during an active session, the user sees the correct container per pause type (inline approval card + sticky footer for tool approval, bottom sheet for ask_user, full-screen pushed modal for plan), responds, and the agent resumes — verified end-to-end via Maestro flows against a real host running scripted agent scenarios.

**Test Steps:**
1. Trigger a real agent action that requires tool approval — confirm the inline `PendingApprovalCard` appears in the message stream with REAL tool name, description, and arguments preview, plus the sticky `PendingApprovalFooter` above the chat input with 44pt-tall Approve / Decline / Always-allow buttons.
2. Tap **Approve** — confirm the footer dismisses, the card resolves to a collapsed ToolCallBlock, and the agent resumes.
3. Trigger multiple back-to-back tool approvals — confirm the footer shows `1 of N` and processes them in order.
4. Trigger an `ask_user` pause — confirm the bottom sheet opens with the REAL question and any suggested-answer pills. Tap a pill to prefill, edit, and tap Send — confirm the agent receives and resumes.
5. Swipe down on an `ask_user` sheet without responding — confirm the floating "Tap to respond" pill appears near the chat input; tap it and confirm the sheet re-opens with the same question.
6. Trigger a plan-approval — confirm the full-screen modal pushes via expo-router (`/(chat)/[sessionId]/plan-review/[planId]`) with the REAL plan markdown. Expand "Add feedback", type feedback, tap Approve — confirm the agent receives and resumes.
7. On another plan-approval, tap Reject and confirm the button is disabled until feedback is non-empty.
8. Tap the X close on a plan-review screen without responding — confirm the pending-action pill appears and tapping it re-pushes the modal.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| MOB-PAUSE-003 | Wire chat.respondToApproval with optimistic dismiss and rollback | react-native-ui-implementer | 120 min |
| MOB-PAUSE-005 | Wire chat.respondToQuestion with optimistic dismiss and swipe-down handling | react-native-ui-implementer | 120 min |
| MOB-PAUSE-006-INT | Wire PlanReviewScreen as pushed expo-router route triggered by displayState.pendingPlan | react-native-ui-implementer | 120 min |
| MOB-PAUSE-007 | Wire chat.respondToPlan with optimistic dismiss and close-X handling | react-native-ui-implementer | 120 min |
| MOB-PAUSE-009 | Assemble ChatInterface container composing all pause components driven by real displayState | react-native-ui-implementer | 180 min |

**Next Sprint Tasks:** *(populated JIT when sprint becomes active by kb-sprint-tasks-plan)*

#### Dependencies

- Blocks: Sprint 10
- Dependent on: Sprint 04 (pause components), Sprint 08 (compose + send + ChatInputFooter)

#### PRD Coverage

- UC-PAUSE-01 (tool approval response wired)
- UC-PAUSE-02 (ask_user response wired)
- UC-PAUSE-03 (plan approval response wired + expo-router push)
- UC-PAUSE-04 (PendingActionIndicator wired to live pause state)

---

### Sprint 10: Push Notifications (Server + Mobile)

**Sequence:** 10
**Timeline:** Phase 2 — Integration
**Status:** 🔵 Planned
**Branch:** `chat-mobile-push`
**PR:** —

#### Human Testing Gate

**Gate:** When an agent really completes a turn or pauses for input on a connected host, the user's mobile device receives a real OS push notification delivered through APNs / FCM via the Expo Push API; tapping the notification opens the correct session with silent host alignment; the in-app pre-prompt fires before any OS dialog, the foreground handler suppresses banners when viewing the matching session, and the re-enable-in-settings flow surfaces when permission is revoked.

**Test Steps:**
1. Sign in fresh on a device with notification permission undetermined. Tap the Chat tab and enter a session for the first time — confirm the **PushPrePromptScreen** appears BEFORE any OS dialog.
2. Tap Enable — confirm the OS permission dialog appears; grant permission.
3. Background the mobile app. On a connected host, trigger an agent turn that completes — within seconds, confirm a real OS push notification titled "Agent complete" arrives on the device with the workspace name in the body.
4. Background the mobile app. Trigger a tool-approval / ask_user / plan pause on a connected host — confirm a real OS push titled "Agent needs your input" arrives.
5. Tap the push notification — confirm the app opens directly to the right session's chat view; if the session is on a different host than the currently-selected one, confirm the selected host silently aligns and back-navigation lands on the correct sessions list.
6. While viewing the chat for session X, trigger an event for session X on the host — confirm the foreground banner is SUPPRESSED (no banner appears).
7. While viewing a different session, trigger an event for session X — confirm the foreground banner DOES appear.
8. Revoke notification permission via the OS Settings; foreground the app — confirm the **Re-enable in Settings** banner appears in More tab settings. Tap it — confirm the OS Settings page opens.
9. Sign out — confirm the device token is de-registered (subsequent agent events for this user/device produce no push).

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| RELAY-PLATF-003 | Implement Upstash KV push-token storage module | node-implementer | 120 min |
| RELAY-PLATF-001 | Add POST /push/register Hono route (JWT-gated) | node-implementer | 120 min |
| RELAY-PLATF-002 | Add DELETE /push/register/:deviceId Hono route (JWT-gated) | node-implementer | 60 min |
| RELAY-PLATF-004 | Build src/push.ts Expo Push API fanout core | node-implementer | 180 min |
| RELAY-PLATF-006 | Handle DeviceNotRegistered + MismatchSenderId cleanup paths | node-implementer | 120 min |
| RELAY-PLATF-005 | Add push:lifecycle tunnel-WS upstream message handling in TunnelManager | node-implementer | 120 min |
| HOST-PLATF-001 | Emit push:lifecycle upstream from host tunnel client on agent lifecycle events | node-implementer | 180 min |
| RELAY-PLATF-007 | Observability: Sentry breadcrumbs + push_fanout_count metric | node-implementer | 90 min |
| RELAY-PLATF-008 | Background TTL sweep for stale push tokens | node-implementer | 90 min |
| RELAY-PLATF-009 | End-to-end smoke: host → relay → real-Expo → ticket round-trip | node-implementer | 180 min |
| RELAY-INFRA-001 | Upload EAS push credentials (iOS APNs .p8 + Android FCM v1 JSON) | node-implementer | 90 min |
| RELAY-INFRA-002 | Document push pipeline operational shape (env, deploy, smoke) | node-implementer | 60 min |
| MOB-INFRA-008 | Configure expo-notifications plugin in app.config.ts and add iOS/Android notification assets | react-native-ui-implementer | 90 min |
| MOB-INFRA-009 | Configure EAS iOS APNs and Android FCM v1 credentials for push | react-native-ui-implementer | 90 min |
| MOB-PLATF-002 | Build push-notification permission flow + token registration call | react-native-ui-implementer | 240 min |
| MOB-PLATF-003 | Build route-aware setNotificationHandler for foreground suppression | react-native-ui-implementer | 90 min |
| MOB-PLATF-004 | Wire addNotificationResponseReceivedListener to handleChatDeepLink | react-native-ui-implementer | 90 min |
| MOB-PLATF-005-INT | Wire RebableInSettingsBanner to real permission status via getPermissionsAsync | react-native-ui-implementer | 45 min |
| MOB-NAV-012 | Build deep-link handler at utils/handleDeepLink for push-notification taps | react-native-ui-implementer | 120 min |

**Next Sprint Tasks:** *(populated JIT when sprint becomes active by kb-sprint-tasks-plan)*

#### Dependencies

- Blocks: Sprint 11
- Dependent on: Sprint 05 (push pre-prompt + re-enable banner components), Sprint 09 (pause containers for tap-to-open auto-open behavior)

#### PRD Coverage

- UC-PLATF-01 (full server + mobile push pipeline)
- UC-NAV-05 (push-notification deep-link routing with silent host alignment)
- 11-technical-requirements/07-notifications.md (wire-level design)
- 11-technical-requirements/02-api-design.md §4 (relay /push endpoints)

---

### Sprint 11: Offline + Background Resume

**Sequence:** 11
**Timeline:** Phase 2 — Integration
**Status:** 🔵 Planned
**Branch:** `chat-mobile-offline`
**PR:** —

#### Human Testing Gate

**Gate:** When the user's host becomes unreachable, the chat view shows a "Host offline" banner with retry and disables Send (with copy distinguishing offline / unpaid / dispatch_failed outcomes); when the host returns, the banner auto-clears and Send re-enables; backgrounding the app and returning catches up all messages, tool calls, and pause prompts that arrived during background — verified end-to-end via Maestro flows.

**Test Steps:**
1. With an open chat session, stop the host-service process (or sever the relay tunnel) — within a few seconds, confirm the "Host offline — tap to retry" banner appears at the top of the chat view and Send is disabled in the composer.
2. Tap **Retry** while still offline — confirm the banner remains. Bring the host back online — confirm the banner clears within a few seconds, Send re-enables, and any missed messages from the host appear via reconcile.
3. Mid-session, background the mobile app for 30+ seconds while an agent turn runs on the host. Foreground the app — confirm a brief loading indicator appears and any missed messages, tool calls, or pause prompts that arrived during background appear once resume completes.
4. Trigger a host-side `skipped_unpaid` dispatch outcome — confirm the banner copy reflects "Plan upgrade required" or equivalent (not generic offline).
5. Trigger a host-side `dispatch_failed` outcome — confirm the banner copy reflects "Host dispatch failed" with retry affordance.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| MOB-PLATF-006 | Build useSessionResume hook with cursor protocol for background→foreground | react-native-ui-implementer | 180 min |
| MOB-PLATF-007-INT | Wire HostOfflineBanner to real dispatch outcome detection + Send disable | react-native-ui-implementer | 90 min |
| MOB-PLATF-008 | Build reconnect logic with periodic poll and getSnapshot reconcile | react-native-ui-implementer | 120 min |

**Next Sprint Tasks:** *(populated JIT when sprint becomes active by kb-sprint-tasks-plan)*

#### Dependencies

- Blocks: None
- Dependent on: Sprint 05 (HostOfflineBanner component), Sprint 08 (ChatInputFooter for Send disable), Sprint 10 (push reconnect-detection trigger)

#### PRD Coverage

- UC-PLATF-02 (session resume after background → foreground)
- UC-PLATF-03 (host-offline UI state + dispatch outcome surfacing)
- UC-PLATF-04 (automatic reconnect when host returns)

---

## Cross-Cutting Notes

### Phase 1 ↔ Phase 2 contract

Phase 1 components are **pure** (props-driven, no data fetches, no side effects beyond local UI state). Phase 2 sprints **compose** them into real screens and wire them to data via TanStack DB Electric collections, the host-service tRPC client, and the displayState polling reducer.

Component prop interfaces declared during Phase 1 MUST anticipate the Phase 2 data shapes from `01-data-schema.md` and `02-api-design.md`. The implementer working a Phase 1 component task is responsible for sketching the prop shape that Phase 2 wiring will supply. Each Phase 1 task brief documents the props in its co-located README or Storybook story args; deviations during Phase 2 integration trigger a return ticket to revise the component.

### Design enrichment notes (apply during task expansion)

The following design enrichments from the design planner attach to specific implementer tasks during `kb-sprint-tasks-plan` expansion:

- **44pt hit-target rule** applies to all pause-footer buttons (MOB-PAUSE-002), composer toolbar controls (MOB-COMP-007), action buttons in sheets (MOB-PAUSE-004), and the close affordance on PlanReviewScreen (MOB-PAUSE-006). Source: `05-ui-infrastructure.md` Hit targets section + WCAG mobile guidelines.
- **Optimistic-tap pattern** (UI ghosts to ~50% on tap; rolls back with toast on error) applies to MOB-PAUSE-003 / MOB-PAUSE-005 / MOB-PAUSE-007 and to MOB-COMP-008 (sendMessage). Source: UC-PAUSE-01/02/03 ACs + UC-COMP-02 AC.
- **BottomSheetTextInput requirement** (not plain TextInput) for MOB-PAUSE-004 — keyboard avoidance is the decisive factor per `07-uc-pause.md` Design Rationale.
- **Sticky-header fallback path** for MOB-NAV-006 — try FlashList `stickyHeaderIndices` first; fall back to RN `SectionList` with `stickySectionHeadersEnabled` if FlashList 1.7.x stickiness misbehaves on Android `inverted` lists.
- **Tailwind→RN translation rules** (`space-y-* → gap-* on flex-col View`, `transition-* → Reanimated`, `hover:* → active:*`, `dark:* → @variant dark` tokens) apply broadly to MOB-RENDER-* and MOB-COMP-* component implementations. Source: design audit `plans/20260521-mobile-chat-design-audit.md`.
- **Status icon glyph palette** (`⌖ ⚠ ● ○` from `09-uc-nav.md` §A or Lucide equivalents `Activity / AlertTriangle / Circle-filled / Circle-outline`) for MOB-NAV-002 — implementer must commit to one approach and not mix glyphs + icons.
- **Palette delta (mobile cool-neutral vs desktop warm-ember)** is an OPEN product decision per `05-ui-infrastructure.md` and `10-team-contributions.md` — implementers must NOT auto-reconcile; flag any cross-app palette divergence in the PR description.

### PR sequencing operational notes

- Each sprint maps to one branch + one PR by default (per `~/Projects/brain/docs/PR-SEQUENCING.md`). Multi-sprint PRs are allowed when sprints share a coherent reviewable surface (e.g., Sprint 10's server-side + mobile-side push could share one PR if the team prefers a single atomic review).
- Sub-100-line incidental changes that span sprints (typo fixes, version bumps) can be folded into any active sprint's PR without re-planning.
- When a sprint subdivides mid-execution, run `/kb-sprint-plan --delta-replan` to split it. The delta-replan preserves Branch + PR cells verbatim for unchanged sprints.

### Out-of-scope reminders (per `01-scope.md`)

These remain explicitly out of scope and must NOT be added during sprint execution without a PRD revision (run `/kb-prd-plan --update`):

- Attachments (file picker / image picker / drag-drop / paste-image / attachment payload UI in messages) — `[DEFERRED: separate PRD]`
- File mentions (host file-tree autocomplete) — `[DEFERRED: separate PRD]`
- User mentions, linked issues, Plus menu, restart-from-message, edit-last-message, MCP overview — `[DEFERRED: separate PRD]`
- Local chat code execution on mobile device — `[NOT SUPPORTED]`
- Rich text in composed messages, multi-keystroke shortcuts — `[NOT SUPPORTED]`
- Notification preferences / Time-Sensitive / action buttons / per-host prefs / badging / Universal Links / threading / "agent failed" — all `[DEFERRED: separate PRD]`
- Pure-Electric message persistence — `[DEFERRED: separate PRD]`
- Cross-platform UI component library (shared `packages/chat-ui`) — `[NOT SUPPORTED]`
- Real-time tRPC subscriptions for chat — `[NOT SUPPORTED]`
- Server-side presence tracking for push suppression — `[NOT SUPPORTED]`
