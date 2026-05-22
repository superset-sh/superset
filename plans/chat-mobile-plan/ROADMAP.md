---
roadmap: 1
project: Mobile Chat v2
generated: 2026-05-21T00:00:00Z
prd: ./README.md
sprint_count: 7
pr_sequencing: true
gate_strategy: ui-first-via-storybook
phase_1_driver: pixel-perfect
---

# Sprint Roadmap: Mobile Chat v2

## Overview

**Sprints:** 7
**Total Tasks:** 56 + pixel-perfect-managed Phase 1
**Current Sprint:** Sprint 01 (🟠 In flight via pixel-perfect; scaffold gate passed)

**Planning Specialists:** `pixel-perfect` (Phase 1) · `react-native-ui-planner` · `node-planner` · `frontend-designer`

**Gate strategy.** This roadmap is organized **UI-first**. **Phase 1 (Sprint 01)** is driven end-to-end by the `pixel-perfect` plugin on the single branch `chat-mobile-ui-elements`: pixel-perfect executes `init → scaffold → plan → atoms → molecules → compose` with gate state tracked in `apps/mobile/design/manifest.json`. Each gate ships pure, props-driven components with co-located Storybook stories — verified by a reviewer who launches the mobile app in Storybook mode (`bun storybook` from `apps/mobile/`) on iOS Simulator and Android Emulator and navigates each component's state matrix. **Phase 2 (Sprints 02–07)** composes those components into real app screens, wires them to real services (Electric, host-service tRPC, relay-routed push pipeline), and verifies each user-facing surface end-to-end via Maestro flows against real services.

> **Skill-rule override (per user direction, 2026-05-21).** The `kb-sprint-plan` skill's default test-step rule rejects `\bstorybook\b` as a verification surface ("Storybook is a developer tool, not the product"). This roadmap **intentionally overrides** that rule for Phase 1 only, because the testing strategy spelled out in `13-testing-strategy.md` explicitly designates Storybook 9 (under custom root toggle `EXPO_PUBLIC_STORYBOOK=true` with build-time stripping for production) as the Phase 1 verification harness, and the user has selected this strategy. As of the pixel-perfect migration, Phase 1 no longer routes through `kb-sprint-tasks-plan` at all — pixel-perfect's own `plan → atoms → molecules → compose` workflow drives decomposition and verification — so the override is mostly moot in practice. Phase 2 sprints continue to use Maestro E2E against the running app per the default rule.

> **PR sequencing enabled.** Lifecycle: 🔵 Planned → 🟠 In flight → 🟣 In review → ✅ Completed → 🔴 Blocked. PR cell required for Completed status. See [`~/Projects/brain/docs/PR-SEQUENCING.md`](~/Projects/brain/docs/PR-SEQUENCING.md) for the full convention.

## Sprint Sequence

| # | Sprint | Gate | Tasks | Dependencies | Status | Branch | PR |
|---|--------|------|-------|--------------|--------|--------|----|
| 1 | [Sprint 01: Pixel-Perfect UI Components](#sprint-01-pixel-perfect-ui-components) | Reviewer launches Storybook on simulator/emulator and walks the full component inventory (Design System + sessions-list w/ project-first chrome + chat-tree + composer + pause + platform-surface) across state matrices on light + dark themes; pixel-perfect manifest gates `atoms`, `molecules`, `compose` all show `passed` | pixel-perfect-managed | — | 🟠 In flight | `chat-mobile-ui-elements` | — |
| 2 | [Sprint 02: Sessions List Integration](#sprint-02-sessions-list-integration) | A signed-in user taps the Chat tab and uses the full real sessions list — flat recency-sorted list scoped to the selected project (header project chip + ProjectPickerSheet when org ≥2 projects), search, filter sheet (workspace + status) with applied removable tag chips, empty states — backed by Electric collections; sessions created on desktop appear within 3s | 14 | Sprint 01 | 🔵 Planned | `chat-mobile-sessions-int` | — |
| 3 | [Sprint 03: Chat View Read + Session Management](#sprint-03-chat-view-read--session-management) | User taps a real session and the chat view mounts with a lazy relay tunnel opening against `workspace.hostId` (skeleton during handshake, inline retry on error); real message history renders with all types and live streaming-cursor updates; End / Rename / Delete via overflow + swipe-delete work end-to-end | 9 | Sprint 01, 02 | 🔵 Planned | `chat-mobile-chat-view-int` | — |
| 4 | [Sprint 04: Compose + Send Integration](#sprint-04-compose--send-integration) | User taps FAB to create a real session (workspace picker scoped to the selected project across all hosts), types and sends a message (real optimistic + streaming), Stops a running turn; slash commands and model picker load real data from host | 6 | Sprint 01, 03 | 🔵 Planned | `chat-mobile-send-int` | — |
| 5 | [Sprint 05: Pause Response Integration](#sprint-05-pause-response-integration) | Real agent tool-approval / ask_user / plan-approval pauses trigger correct containers with live data; user responds and agent resumes end-to-end | 5 | Sprint 01, 04 | 🔵 Planned | `chat-mobile-pause-int` | — |
| 6 | [Sprint 06: Push Notifications (Server + Mobile)](#sprint-06-push-notifications-server--mobile) | Real agent event on connected host triggers OS push delivered via APNs/FCM through Expo; tap opens correct session with silent project alignment + lazy host resolution (readiness gate falls back to tRPC `chat.getSnapshot` on cold-launch race); pre-prompt + foreground suppression + re-enable flow all work end-to-end | 19 | Sprint 01, 05 | 🔵 Planned | `chat-mobile-push` | — |
| 7 | [Sprint 07: Offline + Background Resume](#sprint-07-offline--background-resume) | Real host-offline produces banner + disabled Send + correct dispatch outcome surfacing; real reconnect auto-resumes; background → foreground catches up missed events | 3 | Sprint 01, 04, 06 | 🔵 Planned | `chat-mobile-offline` | — |

---

## Per-Sprint Details

### Sprint 01: Pixel-Perfect UI Components

**Sequence:** 1
**Timeline:** Phase 1 — UI Components (driven by pixel-perfect plugin)
**Status:** 🟠 In flight
**Branch:** `chat-mobile-ui-elements`
**PR:** —

#### Pixel-Perfect Manifest

Gate state tracked in `apps/mobile/design/manifest.json`:

- **Top-level gates:** `discover`, `target`, `equip` all `passed`
- **Per-platform gates** (`mobile-ios`, `mobile-android`): `scaffold: passed`, `plan/atoms/molecules/compose: pending`
- **Tools locked:** Expo · uniwind · react-native-reusables (`@rn-primitives/*`) · lucide-react-native · storybook-native
- **Vibe locked** to existing `apps/mobile/global.css` tokens (RNR neutral palette, cool gray hsl 240, light + dark via `@variant`, 0.5rem radius) — pixel-perfect:build MUST NOT redefine theme tokens

#### Pixel-Perfect Workflow

1. `/pixel-perfect:build --platform mobile-ios` (and `--platform mobile-android`) — **plan phase**: pixel-perfect reads `plans/chat-mobile-plan/` (PRD + UCs + tech requirements + component organization addendum) and the Component Inventory below, then writes its atoms/molecules/compose plan to the manifest
2. **Atoms phase**: pure primitives built first (each verified per-component in Storybook before flipping `atoms: passed`)
3. **Molecules phase**: compositions of atoms (verified in Storybook against state matrices before flipping `molecules: passed`)
4. **Compose phase**: full views/screens with realistic prop data (verified in Storybook before flipping `compose: passed`)
5. Each gate flips in `manifest.json` only after the human reviewer accepts the Storybook walkthrough for that tier

#### Human Testing Gate

**Gate:** Reviewer launches the mobile app in Storybook mode on iOS Simulator and Android Emulator, walks the full component inventory across state matrices on both light and dark themes, and confirms every component renders correctly against the existing `apps/mobile/global.css` tokens. The pixel-perfect manifest's `atoms`, `molecules`, and `compose` gates all show `passed` for both `mobile-ios` and `mobile-android`.

**Test Steps:**
1. From `apps/mobile/`, run `bun storybook` — this generates `.rnstorybook/storybook.requires.ts` and launches Expo with `EXPO_PUBLIC_STORYBOOK=true`. Open the iOS Simulator and Android Emulator simultaneously.
2. **Design System** group — navigate to Colors, Typography, Spacing, Icons. Confirm every swatch / variant / spacing step / icon reads from the existing global.css tokens (no deviation from the locked vibe).
3. **Sessions-list tier (project-first chrome — v2.0.0)** — navigate every story for SessionRow (two-line layout: title with status icon `⌖ ⚠ ● ○` + metadata line `🌿 branch · 💻 host · time`; truncation order title → branch → host → time; long-press copy), ProjectChip (static-label variant when org has 1 project; tappable chip with `▾` when ≥2), ProjectPickerSheet (sheet handle, project rows with workspace + session counts derived via cache-first `useLiveQuery`, currently-selected check, populated + single-project-hidden variants), FilterButton (`⚙` idle state + `⚙·N` badge state when `activeFilters` length ≥ 1, with `·0` hidden vs `·N` visible distinction), AppliedFilterTags (workspace chip `🌿 branch · host` + status chip `⌖ Streaming` | `⚠ Pause pending` | `● Idle`, removable `✕` per chip, trailing `Clear ✕`, horizontal-scroll overflow, stale-chip Electric-tombstone cleanup), SessionFilterSheet (stacked Workspace multi-select rows showing `branch · host` for cross-host disambiguation + Status multi-select with Streaming / Pause pending / Idle rows, Clear all + Apply footer, `accessibilityState={{ selected }}` on rows), NewChatFab (shadow + 56pt FAB), SessionSearchBar (project-scoped placeholder, focused + clear ✕), SessionsEmptyState (no-projects / no-workspaces / no-sessions / search-no-match / filters-no-match — five variants).
4. **Chat-tree tier** — navigate every story for UserMessage (right-aligned bubble, `bg-secondary`, `max-w-[85%]`, long-press copy), AssistantMessage (left-aligned full-width, optional streaming-cursor Reanimated blink variant), MessageMarkdown (code blocks with syntax highlighting, lists / headings / blockquotes / tables / HRs, inline code contrast, tappable links, long-press copy on code blocks), ToolCallBlock (collapsed-only card with running / completed / failed status indicators + right-chevron, no expansion UI per UC-RENDER-04), PlanBlock and ReasoningBlock (collapsed + expanded with smooth chevron rotation), SubagentExecutionMessage (nested visual indentation + left border), ScrollBackButton (FadeIn / FadeOut animation, 44pt hit target).
5. **Composer tier** — navigate every story for TiptapPromptEditor (empty-with-placeholder, typed-text, slash-pill-inserted, file-mention-placeholder, multi-line autogrow, autogrow-cap; verify keyboard reveal + caret positioning), SlashCommandMenu (built-in only, built-in + custom mixed, description + arg-hint, preview-loading, empty-loading), ModelPicker (popover with mock list incl. Opus 4.7 / Sonnet 4.6 / Haiku 4.5 / GPT-5.5, selected-model trigger label), PermissionModePicker + ThinkingLevelPicker (`off / low / medium / high / xhigh` for thinking-level, permission mode variants, selected-state trigger), NewChatSheet (workspace-row layout, sessions-first sort, empty-host inline message, no-sessions meta line). Verify every toolbar control meets the 44pt hit-target rule.
6. **Pause-container tier** — navigate every story for PendingApprovalCard (tool-name typography, short description, arguments preview collapsed JSON with truncation, pending with `--color-destructive` left accent, resolved-approved / resolved-declined), PendingApprovalFooter (44pt-tall Approve / Decline / Always-allow buttons, 1-of-N multi-approval indicator, safe-area-bottom awareness, optimistic-tap ghosting), PendingQuestionSheet (50% / 85% snap points, question text prominence, horizontal-scroll suggested-answer pills, BottomSheetTextInput multi-line, Send button alignment; verify keyboard-active state pushes sheet to 85%), PlanReviewScreen (full-screen layout with nav header + X close, scrollable markdown body multi-screen, expandable "Add feedback", docked Approve / Reject above safe area, Reject disabled when feedback empty), PendingActionIndicator (pill variants per pause type — approval / question / plan — with correct copy + FadeIn/FadeOut).
7. **Platform-surface tier** — navigate every story for PushPrePromptScreen (centered bell icon, heading + body copy matching `07-notifications.md`, benefits list, Enable primary button at 44pt with `--color-primary` fill, Not-now text button at 48pt tap area), RebableInSettingsBanner (granted hidden / denied visible with `--color-destructive` accent + "Re-enable in Settings" CTA / undetermined informational), HostOfflineBanner (offline-idle "Host offline — tap to retry" / offline-retrying spinner + "Reconnecting…" / online hidden / session-unavailable "Session unavailable" + back link / `skipped_unpaid` "Plan upgrade required" / `dispatch_failed` "Host dispatch failed" with retry), NotificationIconPreview (192×192 transparent PNG white silhouette rendered at 192pt / 96pt / 24pt sizes matching Android status-bar constraints).
8. Toggle light/dark theme via Storybook's on-device controls and re-verify every component renders correctly on both themes.

#### Component Inventory (input to pixel-perfect:build)

Preserves the original MOB-* and DESIGN-* IDs as a reference inventory. Pixel-perfect's plan phase decides the actual atoms / molecules / compose split; these IDs document scope and PRD coverage but no longer drive task dispatch.

**Sessions-list tier (project-first per v2.0.0)** (was Sprint 01)
- `MOB-NAV-002-V2` SessionRow (flat two-line layout with title + `🌿 branch · 💻 host · time` metadata; truncation order title→branch→host→time) · `MOB-NAV-004-V2` NewChatFab / SessionSearchBar (project-scoped) / SessionsEmptyState (5 variants) · `MOB-NAV-013` ProjectChip · `MOB-NAV-014` ProjectPickerSheet · `MOB-NAV-015` SessionFilterSheet · `MOB-NAV-016` AppliedFilterTags · `MOB-NAV-017` FilterButton (with `·N` badge state)
- `DESIGN-NAV-001-V2` SessionsListScreen flat-layout sticker sheet (project chip + search + filter button + applied-tag row + flat session rows) · `DESIGN-NAV-002-V2` ProjectPickerSheet sticker sheet · `DESIGN-NAV-003` NewChatSheet (project-scoped workspace rows) + empty states sticker sheet · `DESIGN-NAV-004` SessionFilterSheet + AppliedFilterTags sticker sheet · `DESIGN-PLATF-003` Lucide iconography spec for chat actions
- **Retired in v2.0.0:** `MOB-NAV-003` WorkspaceSection + LoadMorePill (workspace sectioning replaced by flat list) · `MOB-NAV-004` HostChip (replaced by `MOB-NAV-013` ProjectChip) · `MOB-NAV-008-UI` HostPickerSheet (replaced by `MOB-NAV-014` ProjectPickerSheet) · `DESIGN-NAV-001` v1.x workspace-section sticker sheet (superseded by `DESIGN-NAV-001-V2`) · `DESIGN-NAV-002` HostPickerSheet sticker sheet (superseded by `DESIGN-NAV-002-V2`)

**Chat-tree tier** (was Sprint 02)
- `MOB-RENDER-001` UserMessage + AssistantMessage · `MOB-RENDER-003` MessageMarkdown (react-native-markdown-display) · `MOB-RENDER-004` ToolCallBlock (collapsed-only) · `MOB-RENDER-005` PlanBlock + ReasoningBlock · `MOB-RENDER-006` SubagentExecutionMessage · `MOB-RENDER-008-UI` ScrollBackButton (Reanimated fade)
- `DESIGN-CHAT-001` message tree foundation sticker sheet · `DESIGN-CHAT-002` MessageMarkdown + streaming cursor sticker sheet · `DESIGN-CHAT-003` message list affordances sticker sheet

**Composer tier** (was Sprint 03)
- `MOB-COMP-001` TiptapPromptEditor (`@10play/tentap-editor` WebView shell) · `MOB-COMP-002` SlashCommandNode + FileMentionNode Tiptap extensions · `MOB-COMP-003-UI` SlashCommandMenu (@rn-primitives popover) · `MOB-COMP-004-UI` ModelPicker · `MOB-COMP-005` PermissionModePicker · `MOB-COMP-006` ThinkingLevelPicker · `MOB-NAV-009-UI` NewChatSheet
- `DESIGN-COMP-001` ChatInputFooter composer layout sticker sheet · `DESIGN-COMP-002` TiptapPromptEditor states + slash-pill sticker sheet · `DESIGN-COMP-003` SlashCommandMenu popover sticker sheet

**Pause-container tier** (was Sprint 04)
- `MOB-PAUSE-001` PendingApprovalCard (inline) · `MOB-PAUSE-002` PendingApprovalFooter (sticky thumb-docked with 1-of-N) · `MOB-PAUSE-004` PendingQuestionSheet (`@gorhom/bottom-sheet` + BottomSheetTextInput) · `MOB-PAUSE-006-UI` PlanReviewScreen (standalone full-screen; expo-router push wiring deferred to Phase 2) · `MOB-PAUSE-008` PendingActionIndicator (floating pill)
- `DESIGN-PAUSE-001` PendingApprovalCard + Footer sticker sheet · `DESIGN-PAUSE-002` PendingQuestionSheet sticker sheet · `DESIGN-PAUSE-003` PlanReviewScreen sticker sheet · `DESIGN-PAUSE-004` PendingActionIndicator sticker sheet

**Platform-surface tier** (was Sprint 05)
- `MOB-PLATF-001` PushPrePromptScreen · `MOB-PLATF-005-UI` RebableInSettingsBanner (props-driven, no permission API wiring) · `MOB-PLATF-007-UI` HostOfflineBanner (props-driven, no detection wiring; covers all dispatch outcome variants)
- `DESIGN-PLATF-001` PushPrePromptScreen sticker sheet · `DESIGN-PLATF-002` HostOfflineBanner + retry sticker sheet · `DESIGN-PLATF-004` Android notification icon spec + 192×192 transparent PNG

**Infra (already done in this branch via /pixel-perfect:scaffold)**
- ✅ `MOB-INFRA-001` chat-tree runtime dependencies installed via `bun add` (Storybook 9 native + `@storybook/addon-ondevice-controls` + `@storybook/addon-ondevice-actions`, `storybook@^9` pinned to avoid v10 normalizeStories incompat)
- ✅ `MOB-INFRA-002` Storybook 9 root toggle (env-only via `EXPO_PUBLIC_STORYBOOK=true`, no UI toggle) + `.rnstorybook/` config dir (`main.js`, `preview.tsx`, `index.tsx`) + Metro `withStorybook` wrap + Design System stories (Colors, Typography, Spacing, Icons reading existing tokens) + HelloWorld reference component

#### Dependencies

- Blocks: Sprint 02, 03, 04, 05, 06, 07
- Dependent on: pixel-perfect `scaffold` gate (passed for both `mobile-ios` and `mobile-android`)

#### PRD Coverage

- UC-NAV-01 (Chat tab landing — project-first header composition: ProjectChip + SessionSearchBar + FilterButton + AppliedFilterTags + flat SessionRow)
- UC-NAV-04 (NewChatFab + NewChatSheet + SessionsEmptyState components)
- UC-NAV-06 (SessionsEmptyState component — 5 variants: no-projects / no-workspaces / no-sessions / search-no-match / filters-no-match)
- UC-NAV-07 (SessionSearchBar component — project-scoped)
- UC-NAV-08 (ProjectPickerSheet + SessionFilterSheet + AppliedFilterTags + FilterButton)
- UC-RENDER-01 (UserMessage, AssistantMessage components)
- UC-RENDER-03 (MessageMarkdown component)
- UC-RENDER-04 (ToolCallBlock component)
- UC-RENDER-05 (PlanBlock + ReasoningBlock components)
- UC-RENDER-06 (SubagentExecutionMessage component)
- UC-RENDER-07 (ScrollBackButton component)
- UC-COMP-01 (TiptapPromptEditor + extensions + SlashCommandMenu component)
- UC-COMP-04 (ModelPicker component)
- UC-COMP-05 (PermissionModePicker + ThinkingLevelPicker components)
- UC-PAUSE-01 (PendingApprovalCard + PendingApprovalFooter components)
- UC-PAUSE-02 (PendingQuestionSheet component)
- UC-PAUSE-03 (PlanReviewScreen component)
- UC-PAUSE-04 (PendingActionIndicator component)
- UC-PLATF-01 (PushPrePromptScreen + RebableInSettingsBanner components)
- UC-PLATF-03 (HostOfflineBanner component)
- 11-technical-requirements/04-dependencies.md
- 11-technical-requirements/05-ui-infrastructure.md (v2.0.0 component table rewrite)
- 12-component-organization-addendum.md
- 13-testing-strategy.md

---

### Sprint 02: Sessions List Integration

**Sequence:** 2
**Timeline:** Phase 2 — Integration
**Status:** 🔵 Planned
**Branch:** `chat-mobile-sessions-int`
**PR:** —

#### Human Testing Gate

**Gate:** A signed-in user taps the Chat tab on the mobile app and uses the complete real sessions list — flat recency-sorted list scoped to the selected project (header project chip switching projects via `ProjectPickerSheet` when org has ≥2 projects, static label otherwise), search across all workspaces in the project, filter bottom sheet (workspace + status multi-select) with removable applied-tag chips and `·N` badge, empty-state branches — backed by Electric collections joined client-side, and a session created from desktop appears in the mobile list within three seconds.

**Test Steps:**
1. Sign in on the mobile app on iOS Simulator and Android Emulator and confirm the bottom navigation shows three tabs: Tasks, Chat, More.
2. Tap **Chat** and confirm the sessions list shows YOUR REAL sessions in a flat list sorted by `lastActiveAt` descending across every workspace in the currently-selected project; each row shows the two-line layout (title + `🌿 branch · 💻 host · time`).
3. On an org with ≥2 projects, tap the project chip in the header — confirm the **ProjectPickerSheet** opens listing your real projects with workspace + session counts; tap a different project and confirm the list re-scopes. On an org with exactly 1 project, confirm the project name renders as a static label (no chevron, no tap target).
4. Type a query into the search bar — confirm only sessions whose title contains the query (case-insensitive) remain visible across every workspace in the selected project; tap **✕** to clear.
5. Tap the **⚙** filter button to open the **SessionFilterSheet** — confirm two stacked multi-select sections: Workspaces (rows showing `{branch} · {hostIcon} {hostName}` with host suffix disambiguating duplicates) and Status (Streaming / Pause pending / Idle); toggle selections, tap **Apply** — confirm the sheet closes and a `·N` badge appears on the ⚙ button.
6. Confirm an **AppliedFilterTags** row appears below the search bar with one chip per applied workspace (`🌿 branch · host`) and per applied status (`{icon} {label}`), plus a trailing `Clear ✕` chip; tap an individual chip's `✕` to remove only that filter.
7. Delete one of the workspaces referenced by an applied chip on desktop — confirm the stale chip silently drops from the mobile applied-tag row on next render (Electric-tombstone cleanup).
8. Create a chat session on desktop — confirm it appears in the mobile sessions list within ~3 seconds via the Electric shape.
9. Sign in as a user with zero accessible projects in the active org — confirm the "No projects yet" empty state appears with the project chip omitted from the header.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| MOB-INFRA-003 | Install Maestro and seed apps/mobile/.maestro/ with login sub-flow | react-native-ui-implementer | 90 min |
| MOB-INFRA-005-V2 | Add chat_sessions, v2_workspaces, v2_projects Electric collections (project-first; v2_hosts/v2_users_hosts no longer needed at NAV layer) | react-native-ui-implementer | 120 min |
| MOB-INFRA-006-V2 | Build SelectedProjectProvider + useSelectedProject hook with expo-secure-store persistence; one-shot idempotent migration drops legacy `selectedHostId` and seeds `selectedProjectId` via most-recent-activity / alphabetical-first fallback; MUST complete before useSessionsForProject mounts to avoid empty-list flash | react-native-ui-implementer | 150 min |
| MOB-INFRA-007-V2 | Build useSessionsForProject derived selector over chat_sessions + v2_workspaces (cache-first per AGENTS.md TanStack DB rule) | react-native-ui-implementer | 120 min |
| MOB-INFRA-011 | Build useAccessibleProjects hook (Electric collection query over v2_projects scoped to activeOrganizationId) | react-native-ui-implementer | 60 min |
| MOB-NAV-001 | Create Chat tab route layout under app/(authenticated)/(chat)/_layout.tsx | react-native-ui-implementer | 90 min |
| MOB-NAV-005-INT | Assemble SessionsListScreen composing Phase 1 components with real Electric data, in-memory `searchQuery` + `activeFilters: { workspaceIds[], statuses[] }` state, both cleared on screen exit | react-native-ui-implementer | 240 min |
| MOB-NAV-008-V2 | Wire ProjectPickerSheet to useAccessibleProjects + SelectedProjectProvider; renders only when org has ≥2 projects; project rows show workspace + session counts via cache-first `useLiveQuery` | react-native-ui-implementer | 120 min |
| MOB-NAV-010-V2 | Build empty-state rendering for the five UC-NAV-06 variants (no-projects, no-workspaces, no-sessions, search-no-match, filters-no-match) | react-native-ui-implementer | 90 min |
| MOB-NAV-011 | Wire SessionsListScreen footer to 3-tab bar (Tasks, Chat, More) | react-native-ui-implementer | 60 min |
| MOB-NAV-013-V2 | Wire SessionFilterSheet to activeFilters state on SessionsListScreen; workspace rows pulled from useSessionsForProject's underlying workspace join, status rows derived from session display state | react-native-ui-implementer | 120 min |
| MOB-NAV-014-V2 | Wire AppliedFilterTags below search bar; per-chip removal + Clear all; silently drop stale workspace chips on Electric tombstone (no crash, no placeholder) | react-native-ui-implementer | 90 min |
| MOB-NAV-017-V2 | Wire FilterButton badge: `·N` count = `activeFilters.workspaceIds.length + activeFilters.statuses.length`; badge hidden when 0 | react-native-ui-implementer | 45 min |
| MOB-PLATF-009 | Verify multi-device sync via existing chat_sessions Electric shape (test + Maestro) | react-native-ui-implementer | 90 min |

**Next Sprint Tasks:** *(populated JIT when sprint becomes active by kb-sprint-tasks-plan)*

#### Dependencies

- Blocks: Sprint 03
- Dependent on: Sprint 01 (Phase 1 pixel-perfect components — sessions-list tier)

#### PRD Coverage

- UC-SESS-01 (sessions list with real Electric, project-scoped)
- UC-NAV-01 (Chat tab landing — project-first header composition)
- UC-NAV-04 (FAB → workspace picker scoped to selected project — deferred wiring to Sprint 04)
- UC-NAV-06 (empty-state branching — five variants)
- UC-NAV-07 (project-scoped title search across all workspaces)
- UC-NAV-08 (workspace + status filter sheet, applied chip tags, filter badge — full wiring)
- UC-PLATF-05 (multi-device session sync via Electric)
- 11-technical-requirements/02-api-design.md (Electric collections — project-first scoping)
- 11-technical-requirements/06-open-sub-decisions.md (re-resolved sub-decision #6 — project-first model)

---

### Sprint 03: Chat View Read + Session Management

**Sequence:** 3
**Timeline:** Phase 2 — Integration
**Status:** 🔵 Planned
**Branch:** `chat-mobile-chat-view-int`
**PR:** —

#### Human Testing Gate

**Gate:** A user taps any real session from the Chat tab; the chat view mounts and the **lazy relay tunnel** opens against `workspace.hostId` via `useChatTunnel` (skeleton loader during the ~300ms handshake; inline `Can't reach {hostName}` retry banner on failure); the full real message history renders with all message types and live streaming-cursor updates for mid-turn sessions; End / Rename / Delete actions via the overflow menu and swipe-to-delete on the list each succeed end-to-end against the host-service.

**Test Steps:**
1. Sign in on the mobile app and tap a real session row from the Chat tab — confirm the chat view mounts immediately and a skeleton loader appears for ~300ms (the lazy tunnel handshake from `useChatTunnel`); the loading state then transitions to message history loaded via `chat.listMessages`.
2. Stop the host-service process, then tap another session row — confirm the chat view shows an inline `Can't reach {hostName}` error banner with a **Retry** affordance instead of the message list; bring the host back online, tap Retry, confirm the tunnel re-opens and the message list renders.
3. Confirm the message history renders: assistant messages left-aligned full-width with markdown, user messages right-aligned in a styled bubble capped at ~85% width.
4. Long-press any message — confirm its text copies to the clipboard.
5. Scroll up through history — confirm a floating scroll-to-bottom button fades in; tap it to return to the latest message.
6. Open a session whose host is currently mid-turn — confirm the assistant text streams in atomically every snapshot tick with a blinking cursor; cursor disappears when streaming completes.
7. Open the overflow (•••) menu and tap **Rename** — type a new title and tap Save — confirm the title updates in both the chat header and the sessions list.
8. Open the overflow menu and tap **End session** — confirm a confirmation toast and the chat view returns to a read-only state.
9. Return to the sessions list, swipe a session left → tap **Delete** → confirm the destructive dialog → confirm the session disappears from the list within a few seconds.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| MOB-INFRA-004 | Build typed host-service tRPC HTTP client at lib/host-service-client.ts | react-native-ui-implementer | 180 min |
| MOB-INFRA-010 | Build `useChatTunnel` hook — manages lazy relay-tunnel lifecycle for the chat session route: opens on mount against `workspace.hostId`, drops on unmount, drops on app background, re-opens on foreground while chat mounted; de-duplicates concurrent opens to the same hostId across remounts (single in-flight per host); surfaces `{ status: 'connecting' \| 'open' \| 'error', retry }` for skeleton + retry UI; default 5s handshake timeout | react-native-ui-implementer | 180 min |
| MOB-SESS-001 | Render session list-row tap to (chat)/[sessionId] route | react-native-ui-implementer | 60 min |
| MOB-SESS-002 | Build ChatScreen shell with header, mounted `useChatTunnel`, skeleton loader during handshake, inline `Can't reach {hostName}` retry banner on tunnel error, and chat.listMessages fetch | react-native-ui-implementer | 240 min |
| MOB-SESS-003 | Build session-level overflow menu with End / Rename / Delete actions | react-native-ui-implementer | 180 min |
| MOB-SESS-004 | Wire long-press / swipe-to-delete on SessionRow with confirmation | react-native-ui-implementer | 120 min |
| MOB-RENDER-002 | Wire streaming text snapshot polling via chat.getDisplayState + chat.listMessages | react-native-ui-implementer | 180 min |
| MOB-RENDER-007 | Build MessageList FlashList virtualization with MessagePartsRenderer composing Phase 1 renderers | react-native-ui-implementer | 240 min |
| MOB-RENDER-008-INT | Wire ScrollBackButton to FlashList scroll state via useChatScroll | react-native-ui-implementer | 90 min |

**Next Sprint Tasks:** *(populated JIT when sprint becomes active by kb-sprint-tasks-plan)*

#### Dependencies

- Blocks: Sprint 04, 05, 07
- Dependent on: Sprint 01 (Phase 1 pixel-perfect components — chat-tree tier), Sprint 02 (sessions list provides entry points)

#### PRD Coverage

- UC-SESS-02 (resume session with real listMessages)
- UC-SESS-04 (End session)
- UC-SESS-05 (Delete session)
- UC-NAV-05 (lazy tunnel resolution via `useChatTunnel` — chat-route mount opens tunnel against `workspace.hostId`; tunnel dropped on unmount)
- UC-RENDER-02 (streaming snapshot polling)
- UC-RENDER-07 (auto-scroll + scroll-back affordance)

---

### Sprint 04: Compose + Send Integration

**Sequence:** 4
**Timeline:** Phase 2 — Integration
**Status:** 🔵 Planned
**Branch:** `chat-mobile-send-int`
**PR:** —

#### Human Testing Gate

**Gate:** A user taps the FAB on the sessions list to create a real new session (NewChatSheet lists workspaces in the selected project across all hosts with `branch · host` row labels), types a message in the Tiptap editor (with slash commands, models, and pickers loading real data), taps Send to see optimistic append plus a real streaming assistant response, and taps Stop to interrupt a running turn — all verified end-to-end via Maestro flows against a real host.

**Test Steps:**
1. From the Chat tab sessions list, tap the floating **+** FAB — confirm the workspace-picker bottom sheet opens listing the workspaces in the **currently-selected project** across all hosts, with each row showing `{branch} · {hostIcon} {hostName}`.
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
| MOB-NAV-009-INT | Wire NewChatSheet to chat.createSession + workspace data (filtered by `projectId` across all hosts, rows show `branch · host`) + FAB integration | react-native-ui-implementer | 120 min |

**Next Sprint Tasks:** *(populated JIT when sprint becomes active by kb-sprint-tasks-plan)*

#### Dependencies

- Blocks: Sprint 05, 07
- Dependent on: Sprint 01 (Phase 1 pixel-perfect components — composer tier), Sprint 03 (ChatScreen + host-service-client)

#### PRD Coverage

- UC-SESS-03 (start new session via FAB → workspace picker)
- UC-COMP-01 (slash command popover wired)
- UC-COMP-02 (send message with optimistic append)
- UC-COMP-03 (stop running turn)
- UC-COMP-04 (model picker wired to chat.getModels)
- UC-NAV-04 (FAB workflow wired)

---

### Sprint 05: Pause Response Integration

**Sequence:** 5
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

- Blocks: Sprint 06
- Dependent on: Sprint 01 (Phase 1 pixel-perfect components — pause-container tier), Sprint 04 (compose + send + ChatInputFooter)

#### PRD Coverage

- UC-PAUSE-01 (tool approval response wired)
- UC-PAUSE-02 (ask_user response wired)
- UC-PAUSE-03 (plan approval response wired + expo-router push)
- UC-PAUSE-04 (PendingActionIndicator wired to live pause state)

---

### Sprint 06: Push Notifications (Server + Mobile)

**Sequence:** 6
**Timeline:** Phase 2 — Integration
**Status:** 🔵 Planned
**Branch:** `chat-mobile-push`
**PR:** —

#### Human Testing Gate

**Gate:** When an agent really completes a turn or pauses for input on a connected host, the user's mobile device receives a real OS push notification delivered through APNs / FCM via the Expo Push API; tapping the notification opens the correct session with **silent project alignment + lazy host resolution** (handleDeepLink awaits `v2_workspaces` collection readiness with a bounded timeout, falls back to tRPC `chat.getSnapshot({ sessionId })` on cold-launch race, resolves `workspace.projectId`, aligns `selectedProjectId`, pushes the chat route — `useChatTunnel` then opens the tunnel against `workspace.hostId` on mount); the in-app pre-prompt fires before any OS dialog, the foreground handler suppresses banners when viewing the matching session, and the re-enable-in-settings flow surfaces when permission is revoked.

**Test Steps:**
1. Sign in fresh on a device with notification permission undetermined. Tap the Chat tab and enter a session for the first time — confirm the **PushPrePromptScreen** appears BEFORE any OS dialog.
2. Tap Enable — confirm the OS permission dialog appears; grant permission.
3. Background the mobile app. On a connected host, trigger an agent turn that completes — within seconds, confirm a real OS push notification titled "Agent complete" arrives on the device with the workspace name in the body.
4. Background the mobile app. Trigger a tool-approval / ask_user / plan pause on a connected host — confirm a real OS push titled "Agent needs your input" arrives.
5. Tap the push notification — confirm the app opens directly to the right session's chat view; if the session's workspace belongs to a different project than the currently-selected one, confirm `selectedProjectId` silently aligns (back-navigation lands on the correct project's sessions list); the lazy tunnel handshake opens against `workspace.hostId` on chat-route mount (skeleton during handshake). On a cold launch where the workspace row isn't yet synced, confirm the tRPC `chat.getSnapshot` fallback resolves the workspace inline within the readiness gate timeout.
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
| MOB-NAV-012-V2 | Build deep-link handler at utils/handleDeepLink for push-notification taps: awaits `v2_workspaces` collection readiness with bounded timeout (~2s); falls back to tRPC `chat.getSnapshot({ sessionId })` on cold-launch race; resolves `workspace.projectId`; silently aligns `selectedProjectId` via SelectedProjectProvider; pushes chat route (lazy tunnel opens via useChatTunnel on mount) | react-native-ui-implementer | 150 min |

**Next Sprint Tasks:** *(populated JIT when sprint becomes active by kb-sprint-tasks-plan)*

#### Dependencies

- Blocks: Sprint 07
- Dependent on: Sprint 01 (Phase 1 pixel-perfect components — platform-surface tier: push pre-prompt + re-enable banner), Sprint 05 (pause containers for tap-to-open auto-open behavior)

#### PRD Coverage

- UC-PLATF-01 (full server + mobile push pipeline)
- UC-NAV-05 (push-notification deep-link routing with silent project alignment + lazy host resolution; cold-launch race fallback via tRPC `chat.getSnapshot`)
- 11-technical-requirements/07-notifications.md (wire-level design)
- 11-technical-requirements/02-api-design.md §4 (relay /push endpoints)

---

### Sprint 07: Offline + Background Resume

**Sequence:** 7
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
- Dependent on: Sprint 01 (Phase 1 pixel-perfect components — HostOfflineBanner from platform-surface tier), Sprint 04 (ChatInputFooter for Send disable), Sprint 06 (push reconnect-detection trigger)

#### PRD Coverage

- UC-PLATF-02 (session resume after background → foreground)
- UC-PLATF-03 (host-offline UI state + dispatch outcome surfacing)
- UC-PLATF-04 (automatic reconnect when host returns)

---

## Cross-Cutting Notes

### Phase 1 ↔ Phase 2 contract

Phase 1 components are **pure** (props-driven, no data fetches, no side effects beyond local UI state). Phase 2 sprints **compose** them into real screens and wire them to data via TanStack DB Electric collections, the host-service tRPC client, and the displayState polling reducer.

Component prop interfaces are decided during pixel-perfect's `plan` phase (Sprint 01) and MUST anticipate the Phase 2 data shapes from `01-data-schema.md` and `02-api-design.md`. Each component's prop shape is documented in its co-located Storybook story args (`ComponentName.stories.tsx`); deviations discovered during Phase 2 integration trigger a return ticket to pixel-perfect's compose phase to revise the component (rather than patching the consumer).

### Design enrichment notes

The following design enrichments apply across BOTH phases. Pixel-perfect's `plan` phase (Sprint 01) MUST encode these constraints into atom / molecule / view specs; Phase 2 integration sprints inherit them via the component contracts.

- **44pt hit-target rule** applies to all pause-footer buttons (MOB-PAUSE-002 — Sprint 01), composer toolbar controls (MOB-COMP-007 — Sprint 04 ChatInputFooter container), action buttons in sheets (MOB-PAUSE-004 — Sprint 01), and the close affordance on PlanReviewScreen (MOB-PAUSE-006 — Sprint 01). Source: `05-ui-infrastructure.md` Hit targets section + WCAG mobile guidelines.
- **Optimistic-tap pattern** (UI ghosts to ~50% on tap; rolls back with toast on error) applies to MOB-PAUSE-003 / MOB-PAUSE-005 / MOB-PAUSE-007 (all Sprint 05 wiring) and to MOB-COMP-008 (sendMessage wiring in Sprint 04). Pixel-perfect's Sprint 01 components must expose the ghosting state via props so Phase 2 wiring can drive it. Source: UC-PAUSE-01/02/03 ACs + UC-COMP-02 AC.
- **BottomSheetTextInput requirement** (not plain TextInput) for MOB-PAUSE-004 (Sprint 01) — keyboard avoidance is the decisive factor per `07-uc-pause.md` Design Rationale.
- **Tailwind→RN translation rules** (`space-y-* → gap-* on flex-col View`, `transition-* → Reanimated`, `hover:* → active:*`, `dark:* → @variant dark` tokens) apply broadly to all MOB-RENDER-* and MOB-COMP-* components built in Sprint 01. Source: design audit `plans/20260521-mobile-chat-design-audit.md`.
- **Status icon glyph palette** (`⌖ ⚠ ● ○` from `09-uc-nav.md` §A or Lucide equivalents `Activity / AlertTriangle / Circle-filled / Circle-outline`) for `MOB-NAV-002-V2` (Sprint 01 SessionRow in the v2.0.0 flat two-line layout: title with leading status icon on line 1, `🌿 branch · 💻 host · time` metadata on line 2; truncation order title → branch → host → time on overflow) — pixel-perfect must commit to one approach and not mix glyphs + icons across SessionRow variants.
- **Lazy tunnel handshake contract** for `MOB-INFRA-010` `useChatTunnel` (Sprint 03) — the hook exposes `{ status: 'connecting' | 'open' | 'error', retry }` as a prop contract that ChatScreen (`MOB-SESS-002`) consumes for its skeleton state (during the ~300ms handshake on chat-route mount) and inline retry banner (on tunnel error or 5s timeout). Sprint 01's chat-tree components must accept a `tunnelStatus` prop or render inside a host that gates on it; pre-shape this in pixel-perfect's plan phase so Sprint 03 wiring drops in without revising the component contract.
- **Workspace filter chip uniqueness** for `MOB-NAV-015` SessionFilterSheet + `MOB-NAV-016` AppliedFilterTags (Sprint 01) — when two `v2_workspaces` share a branch name across hosts (e.g., `main · macbook` and `main · desktop`), each appears as a separate filter row + chip with `branch · host` disambiguation. Stale chips (referencing a workspace tombstoned in the synced Electric collection) silently drop on next render without crashing or showing a placeholder.
- **Palette delta (mobile cool-neutral vs desktop warm-ember)** is an OPEN product decision per `05-ui-infrastructure.md` and `10-team-contributions.md`. The manifest locks Sprint 01 to the existing mobile cool-neutral palette in `apps/mobile/global.css` — pixel-perfect MUST NOT auto-reconcile to desktop's ember theme. Flag any cross-app palette divergence in the PR description for product review.

### PR sequencing operational notes

- **Phase 1 (Sprint 01)** ships as one branch (`chat-mobile-ui-elements`) and one PR, driven end-to-end by pixel-perfect. The PR opens when pixel-perfect's `atoms` gate first passes (ready for incremental review) and merges once all of `atoms`, `molecules`, and `compose` are `passed` in `apps/mobile/design/manifest.json`.
- **Phase 2 (Sprints 02–07)** map to one branch + one PR each by default (per `~/Projects/brain/docs/PR-SEQUENCING.md`). Multi-sprint PRs are allowed when sprints share a coherent reviewable surface (e.g., Sprint 06's server-side + mobile-side push could share one PR if the team prefers a single atomic review).
- Sub-100-line incidental changes that span sprints (typo fixes, version bumps) can be folded into any active sprint's PR without re-planning.
- When a Phase 2 sprint subdivides mid-execution, run `/kb-sprint-plan --delta-replan` to split it. The delta-replan preserves Branch + PR cells verbatim for unchanged sprints. For Sprint 01 subdivision needs, escalate to pixel-perfect's plan phase replan (`/pixel-perfect:build --replan`) instead.

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
