# Unify the mobile home screen: workspaces and chat sessions in one grouped list

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from the root `AGENTS.md` and `apps/mobile/AGENTS.md` (routing logic stays in `apps/mobile/app/`, UI/business logic lives in `apps/mobile/screens/` mirroring the route structure; one folder per component with an `index.ts` barrel; co-locate hooks/utils next to their only consumer, promote to the highest shared parent when used twice).

## Purpose / Big Picture

Today the mobile app makes the user navigate twice to reach a chat: the home screen lists workspaces, tapping a workspace opens a second screen listing that workspace's chat sessions (and live terminal agents), and only then can the user open a session. After this change, the home screen shows one scrollable list where each workspace appears as a group header with its recent sessions nested directly beneath it — the same layout as chat apps that group sessions by project. Tapping a session on home opens the chat thread in one tap. The per-workspace session list survives as the "view all sessions" destination and as the workspace's own landing page.

To see it working: run the app (`cd apps/mobile && bun dev`, or an existing dev build on the simulator), sign in, and observe the home screen. Each workspace row now has its recent chat sessions listed under it; tapping a session title opens the conversation directly; tapping the workspace header row still opens the full per-workspace session list.

## Assumptions

- Chat sessions for the whole organization are already synced to the device via the Electric collection `collections.chatSessions` (see `apps/mobile/lib/collections/collections.ts` and the usage in `apps/mobile/screens/(authenticated)/workspace/[id]/chat/ChatSessionsScreen.tsx`). No backend work is needed to show chat sessions grouped on home. Confirmed during discovery.
- Terminal-agent status (which coding agents are running in which workspace terminal) is only available per-workspace from the host service today (`terminalAgents.listByWorkspace` in `packages/host-service/src/trpc/router/terminal-agents/terminal-agents.ts`). Showing them on home requires a new host-wide query (Milestone 3) — one poll per host instead of one poll per workspace.
- Deep-pushing straight to a chat thread from home (`/(authenticated)/workspace/<id>/chat/<sessionId>`) works, because `useCreateChatWorkspace` (`apps/mobile/screens/(authenticated)/(home)/workspaces/components/NewChatWidget/hooks/useCreateChatWorkspace/useCreateChatWorkspace.ts`) already pushes that exact route after creating a workspace. Back returns to home.

## Open Questions

- None. Resolved by Satya 2026-07-10: sessions render **uncapped** (revisit if long histories become a problem — strikes the cap-3 decision below); worktree-missing workspaces stay **hidden** (cleanup is desktop-only, accepted tradeoff); teammates' chats are **editable org-wide** (`chat.updateSession`/`deleteSession` now scope to the organization, not `createdBy`).

## Progress

- [x] (2026-07-09 14:38Z) Discovery complete: mapped home screen, per-workspace session list, data sources, and host-service surface.
- [x] (2026-07-09 14:38Z) Plan drafted.
- [x] (2026-07-09 15:10Z) Design locked via HTML mock review: single-line header, agent-logo session chips, dots-only status.
- [x] (2026-07-09 15:40Z) Milestone 1: shared `SessionRow`/`AgentLogo`/`sessionRows`/`compactTime` + single-line `WorkspaceRow` (+ Open PR / Copy branch menu actions) + grouped home list; `ChatSessionsScreen` adopts the shared row.
- [x] (2026-07-09 15:40Z) Milestone 2: search matches session titles, placeholder updated, empty states preserved.
- [x] (2026-07-09 15:55Z) Milestone 3: `TerminalAgentStore.list()` + `listLive` persistence read + `terminalAgents.list` router query (host-service tests 17/17); mobile `useHostTerminalAgents` (one 5s poll per selected host) merged into home groups.
- [x] (2026-07-09 16:00Z) Final tidy: `screens/(authenticated)/(home)/workspaces/` → `home/` with `HomeScreen`; typecheck + lint clean.
- [x] (2026-07-09 15:45Z) Simulator smoke test: dev client on iPhone 16e against this worktree's Metro (port 8083) + local api/relay/electric-proxy; local-admin sign-in works and the new `HomeScreen` mounts and renders its empty state without runtime errors. (Recovery notes: worklets `.worklets` files copied from a sibling worktree to beat the SHA-1 race; host-service `dist-types` must be generated in fresh worktrees.)
- [x] (2026-07-10) Manual verification with real data on the simulator against a live local host: grouped rows, one-tap thread open, back stack, search. (Terminal rows dropped from scope — see Decision Log.)
- [x] (2026-07-10) Milestone 4 shipped in reduced form: ghost "+" button on the workspace row prompts for the first message (`Alert.prompt`) and starts the session via the host's `agents.run`, then pushes the thread route. No inline composer.
- [x] (2026-07-10) Design iterations with Satya on-device: two-line workspace rows reinstated (title / `branch · +LOC −LOC`), date-group headers (Now/Today/Yesterday/This week/This month/Older) replacing per-row workspace timestamps, hairline separators + tighter gaps, attention dot in the icon slot, tappable PR icon, chat context menu (rename/delete/fork placeholder), light haptics on sheet-opening taps, `ChatSessionsScreen`/changes screen deleted with `workspace/[id]` now redirecting home.
- [x] (2026-07-10) Full-diff code review run (8 finder angles + adversarial verification): 10 confirmed findings, folded in below as the remediation checklist.
- [x] (2026-07-10) Review remediation shipped: voice settle rework (single tracked backstop, settle on the recognizer's `end`, unmount aborts recognition), org-wide chat rename/delete, attention dots mirror desktop (`Start`→working, `Attached`→idle) and clear when the host drops, dead terminal-row plumbing deleted (buildSessionRows terminal arm, SessionRow terminal variant, StatusDot, `withTerminalTitles`, AgentLogo → shared `ClaudeLogo`), WorkspaceBackButton deleted, structure moves (SessionRow/compactTime/useHostTerminalAgents/prStateFor down to `home/`, NewChatWidget wrapper collapsed), sheet-dismiss + keyboard-refocus timers replaced with a shared `useAfterTransitionEnd` hook. Lint + typecheck green; sim smoke-tested.
- [ ] Milestone 6 device pass (voice), then PR (single PR, per Satya).
- [ ] Move plan to `done/` when the PR is created.

## Surprises & Discoveries

- Observation: Mobile has no "new chat session in an existing workspace" flow at all — `NewChatWidget` always creates a brand-new workspace (`workspaces.create` with an `agents` sugar array). Desktop starts sessions in existing workspaces via the host's `agents.run` mutation (`packages/host-service/src/trpc/router/agents/agents.ts`), which creates the cloud session and fires the first message.
  Evidence: `useCreateChatWorkspace.ts` only calls `client.workspaces.create.mutate`; `grep agents.run apps/mobile` has no hits.
- Observation: The native `modules/tab-bar` module exists but is unused; the app has no bottom tab bar. Home is a plain stack, so this redesign does not fight any tab structure.
  Evidence: `grep -rn "tab-bar" apps/mobile/app apps/mobile/screens` returns nothing.
- Observation: `chat_sessions` has no status or agent column (only id/workspace/title/timestamps), so chat rows cannot show a live status dot yet — dots appear on terminal rows only, and chat rows use a fixed Claude logo. Syncing session status via Electric (see plans/cross-client-session-tab-sync.md) would light them up.
  Evidence: `packages/db/src/schema/schema.ts:670`.
- Observation: Mobile typecheck in a fresh worktree fails on every `HostWorkspaceRow` property because `@superset/host-service/router` types resolve from generated `dist-types/` that don't exist until `bun run build:types` runs in `packages/host-service`. Separately, mobile's tsc reports pre-existing errors in `packages/port-scanner`/`pty-daemon`/`workspace-fs` (bun-flavored `.ts` imports) — identical on clean HEAD, not caused by this change.
  Evidence: stash-and-typecheck comparison, 2026-07-09.
- Observation: Rendering the preset-icon SVGs needed no asset copying after all — mobile's existing convention (hand-transcribed `react-native-svg` components, e.g. `SocialButton`) fit, so `AgentLogo` embeds the paths directly with theme-aware fills mirroring `getPresetIcon(name, isDark)`.
  Evidence: `screens/(authenticated)/components/AgentLogo/AgentLogo.tsx`.

## Decision Log

- Decision: Use a single always-expanded grouped list (workspace header + nested session rows), not accordions and not tabs.
  Rationale: Accordions reintroduce the extra tap this change exists to remove and hide the "what's active" signal behind a collapsed state that then needs persistence. A tab split (sessions inbox vs workspaces) keeps two mental models and still two screens. The grouped list keeps workspace context (branch, PR badge, diff stats) as the header while making every recent session one tap away — matching the reference layout the user supplied.
  Date/Author: 2026-07-09, Claude + Satya.
- Decision: Cap sessions shown per workspace on home at 3 most recent, with a "View all N sessions" row when there are more.
  Rationale: Sessions accumulate; uncapped groups would push other workspaces off screen. Three rows cover the active-work case; the existing per-workspace screen already renders the full list.
  Date/Author: 2026-07-09, Claude.
- Decision: Keep `ChatSessionsScreen` (route `/(authenticated)/workspace/[id]/chat/index`) as the workspace landing page and "view all" target. Workspace header tap behavior is unchanged (still opens it).
  Rationale: It is the only surface showing the complete session history and it anchors the workspace-scoped navigation (changes screen, back button). Removing it would orphan `changes/` navigation and break the `workspace/[id]/index` redirect.
  Date/Author: 2026-07-09, Claude.
- Decision: Bring terminal-agent rows to home via a new host-wide `terminalAgents.list` query (one poll per selected host) rather than fanning out `listByWorkspace` per workspace.
  Rationale: Home shows many workspaces; N concurrent 5-second polls through the relay is wasteful and slow. The host's `TerminalAgentStore` holds all bindings in memory, so a host-wide list is a few lines. The existing per-workspace endpoint stays for the per-workspace screen.
  Date/Author: 2026-07-09, Claude.
- Decision: Group home by workspace within the already-selected project/host scope; do not change the project filter model.
  Rationale: The reference app groups sessions by project because its hierarchy is project → session. Ours is project → workspace → session, and home is already scoped to one project via the filter sheet. Grouping by workspace is the faithful translation.
  Date/Author: 2026-07-09, Claude.
- Decision (CONFIRMED via mock review, 2026-07-09): Collapse the workspace header to a single line — PR state icon replaces the cloud icon in the icon slot (desktop's `DashboardSidebarWorkspaceIcon` pattern: open=emerald, merged=purple, draft=muted, closed=destructive; cloud/cloud-off only when no PR), drop the branch line, compact relative time ("2h") right-aligned next to diff stats. Branch and "Open PR #N" move into the existing long-press context menu; "worktree missing" replaces the timestamp inline when applicable.
  Rationale: The branch is derived from the workspace name in almost every row, so the second line mostly repeats the first. A ~25% shorter header keeps headers visually subordinate to session rows and fits roughly one more group per screen. Mocked in HTML for approval before implementation (see conversation artifact "Mobile Home — Unified List Mock").
  Date/Author: 2026-07-09, Satya (direction) + Claude (specifics). Confirmed by Satya after seeing the two-line variant truncate branches ("satya/relay-clos…") and wrap timestamps in a real screenshot.
- Decision (CONFIRMED via mock review, 2026-07-09): Session rows adopt the desktop dashboard sidebar's experimental activity-strip language (`DashboardSidebarWorkspaceAgentBadge` + `StatusIndicator`): the real agent logo (Claude, Codex, … from `packages/ui/src/assets/icons/preset-icons/`, dark/light variants via the `getPresetIcon` pattern) rendered inside a small muted circle chip, with the status dot overlaid on the chip's top-right corner using desktop's exact `STATUS_CONFIG` semantics — amber pulsing = working, red pulsing = needs input, green static = ready for review, no dot = idle. The dot carries ALL status: no "Needs input"/"Working" text labels anywhere (Satya explicitly cut them as redundant with the dots). Every session row's right column is a compact relative timestamp — last message for chats, last event for terminals. Chat rows show the session title; terminal rows show the agent label plus a small tty glyph marking them read-only. This replaces the earlier generic dot + "TERMINAL" chip + status pills from `ChatSessionsScreen`, which the shared `SessionRow` supersedes.
  Rationale: Reuses an established, user-approved visual language instead of inventing a mobile-only one, and the agent logo makes mixed chat/terminal groups scannable at a glance. Requires importing the preset-icon SVGs into the mobile bundle (they live in `packages/ui`, which mobile doesn't consume; copy the needed SVGs or expose them via a shared path during Milestone 1).
  Date/Author: 2026-07-09, Satya (direction: match desktop, agent logos, dots-only status) + Claude (specifics).
- Decision: Terminal agents are removed from the mobile app entirely — no terminal session rows anywhere.
  Rationale: Product direction from Satya ("we're removing terminal agents from the mobile app"). The host-wide `terminalAgents.list` poll survives only to drive the workspace-row attention dot (status per workspace); everything that rendered terminal rows is now dead code slated for deletion (see review findings 7–8). Milestone 3's interleaving goal and acceptance criterion 5 are obsolete.
  Date/Author: 2026-07-10, Satya.
- Decision (REVERSES single-line header, 2026-07-09): Workspace rows are two lines again — title on the first line, `branch · +LOC −LOC` on the second — after Satya saw the single-line variant with real data and asked for the thicker row. Per-row timestamps were then removed entirely in favor of date-group section headers.
  Date/Author: 2026-07-10, Satya (direction) + Claude (specifics).
- Decision: `ChatSessionsScreen` and the per-workspace changes screen are deleted; `workspace/[id]/index` redirects to home. Home is the only surface listing workspaces and sessions; workspace headers are no longer tappable (long-press menu only).
  Rationale: With every session one tap away on home, the intermediate screen lost its job. Consequence: the cap-3 "View all" target no longer exists (see Open Questions) and worktree-missing workspaces need a new recovery path (review finding 5).
  Date/Author: 2026-07-10, Satya + the home-restructure agent.
- Decision: Milestone 4 shipped as a prompt-first flow (`Alert.prompt` → `agents.run` → push thread) rather than an inline composer on the row.
  Date/Author: 2026-07-10.

## Code review findings (2026-07-10)

Full-session diff reviewed at high effort (8 finder angles, 33 candidates, independent adversarial verification). Ten confirmed findings, most severe first — this is the remediation checklist:

1. [ ] **Teammates' sessions: rename/delete silently no-op.** Home lists org-wide sessions (Electric shape filters on `organizationId` only), but `chat.updateSession`/`deleteSession` are scoped to `createdBy = caller` and return `{updated:false}`/`{deleted:false}` without throwing; `SessionRowMenu.tsx:26` never checks the result. Hide the actions on sessions the user doesn't own, or check the flag and alert. (See Open Questions.)
2. [ ] **Idle agents show as working.** `useHostTerminalAgents.ts` `statusFromEvent` maps everything except Stop/PermissionRequest to `"working"`, including `"Attached"` — which `packages/host-service/src/events/map-event-type.ts` documents as *not* working, and which desktop's `deriveTerminalAgentStatus` maps to idle. A booted-but-idle CLI paints a permanent amber attention dot.
3. [ ] **Attention dots freeze when a host goes offline.** The query flips `enabled:false` but react-query keeps the last data for the mounted query, so dots keep rendering statuses from the moment of disconnect — contradicting the hook's own "degrades to an empty map" comment.
4. [ ] **Composer destroys the draft on partial failure.** `NewChatWidget.tsx:159` clears text/attachments/base-branch in `mutateAsync().then()`, but the mutation resolves even when the workspace was created and the first agent message failed (`agentResult.ok === false`) — the user gets "Chat failed to start" with their prompt already gone and an orphaned empty workspace. Clear only when `agentResult.ok`.
5. [ ] **Worktree-missing workspaces are invisible and undeletable.** `HomeScreen.tsx:175` filters `worktreeExists === false` rows out of the only surface listing workspaces; previously they rendered with a "worktree missing" label and a long-press delete (`workspaceCleanup.destroy` is still wired in `WorkspaceRowMenu` but unreachable).
6. [ ] **Uncapped session lists** (see Open Questions): decide cap vs. uncapped and update this plan either way.
7. [ ] **Delete the dead terminal-row plumbing**: `buildSessionRows`' terminal arm, `SessionRow`'s terminal variant + `StatusDot`, the terminal search branch, the `label`/`AGENT_LABELS` plumbing in `useHostTerminalAgents`, the host-service `withTerminalTitles` join (no consumer reads `.title`), and ~170 unreachable lines of `AgentLogo` SVGs (only `"claude"` is ever passed). Keep only `workspaceId` + `status` for the attention dot.
8. [ ] **Delete `WorkspaceBackButton`** — both consumers (ChangesScreen, ChatSessionsScreen) were deleted; zero references remain.
9. [ ] **Deduplicate the Claude mark** — `ProviderLogo.tsx` re-declares a byte-identical private `ClaudeLogo` already in the shared `AgentLogo`; render `<AgentLogo agentId="claude"/>` or a single exported mark.
10. [ ] **Per-keystroke SwiftUI re-render in the composer.** Every keystroke flows through `controller.textInput.setInput` → provider `useState` → new context value → `NewChatWidgetInner` re-renders the whole Host tree, when render only needs a `hasDraft` boolean; submit/dictation could read the text from a ref. Perf only, no correctness impact.

Verified non-issues, so nobody re-litigates them: workspace long-press works with a plain `View` trigger (expo-router attaches `UIContextMenuInteraction` natively); the composer's hardcoded dark palette can't misrender (app is dark-locked at OS, uniwind, and SwiftUI levels, and the hexes are deliberate design values, not theme tokens); `CHAT_AGENT_ID="claude"` is accurate (chat_sessions has no agent/model column — GPT-backed sessions showing a Claude logo needs a schema change); `renderItem` closing over `listItems` has no measurable re-render cost under LegendList. The two composer voice bugs (send button during recording, replace-vs-append) are tracked separately as Milestones 1–2 of `plans/20260711-composer-voice-states.md`.

## Outcomes & Retrospective

To be filled in at completion.

## Context and Orientation

This is mobile-app-only work in `apps/mobile` (Expo + expo-router + React Native), except Milestone 3 which adds one small query to `packages/host-service` (the per-machine daemon that desktop/mobile reach over the relay via tRPC — a typed RPC layer; the mobile client for it lives in `apps/mobile/lib/host-service/client.ts`).

Current navigation, by route:

- `app/(authenticated)/(home)/index.tsx` renders `WorkspacesScreen` from `screens/(authenticated)/(home)/workspaces/`. It shows workspaces for one selected host (hook `useSelectedHost`) and one selected project (`workspacesFilterStore`), fetched live from the host via `useHostWorkspaces` (a react-query poll of the host's `workspace.list`, 30s interval). Rows render via `WorkspaceRow` (name, branch, relative time, diff stats for visible rows, PR badge) wrapped in `WorkspaceRowMenu`, which is an expo-router `Link` to `/(authenticated)/workspace/<id>/chat` plus a long-press context menu (rename/delete/copy/share). The screen also hosts a floating `NewChatWidget` (composer that creates a new workspace + first chat session on a chosen project/host) and formSheet routes `filter/` and `new-chat/`.
- `app/(authenticated)/workspace/[id]/index.tsx` redirects to `chat/`, whose `index` is `ChatSessionsScreen` (`screens/(authenticated)/workspace/[id]/chat/ChatSessionsScreen.tsx`). That screen merges two data sources into one list sorted by recency: chat sessions from the org-wide Electric collection `collections.chatSessions` filtered to `v2WorkspaceId === id` (navigable), and live terminal-agent rows from `useWorkspaceTerminalAgents` (read-only status: Working / Needs input / Idle, 5s poll, host must be online). Tapping a chat row pushes `chat/[sessionId]` (`ChatThreadScreen`).

Key data facts: chat sessions are cache-first TanStack DB rows already on the device for the whole organization (fields used: `id`, `v2WorkspaceId`, `title`, `updatedAt`, `createdAt`). Terminal-agent bindings live only in host memory/SQLite, exposed today solely as `terminalAgents.listByWorkspace`. Per the repo-wide TanStack DB rule in `AGENTS.md`: always render existing rows; use `isReady` only to gate empty states.

## Plan of Work

### Milestone 1: shared SessionRow + grouped home list (chat sessions only)

At completion, home shows each workspace as a header with up to 3 recent chat-session rows beneath it, and tapping a session opens the thread. Terminal rows are not on home yet (Milestone 3); the per-workspace screen is unchanged in behavior.

Extract the row UI that `ChatSessionsScreen.tsx` currently defines inline into a shared component at `screens/(authenticated)/components/SessionRow/` (highest shared parent of home and the workspace chat screen, per the co-location rule). Give it two variants in the approved desktop activity-strip styling (see Decision Log): a pressable chat variant (agent-logo chip + title + compact timestamp) and a read-only terminal variant (agent-logo chip + label + tty glyph + compact timestamp), both with the corner status dot as the sole status signal. `ChatSessionsScreen` adopts the same component, so its rows change appearance in this milestone too — that is intended, the two surfaces must stay identical. Move the small `toMs` helper and the `Row`/`ChatRow`/`TerminalRow` types into `screens/(authenticated)/utils/sessionRows/` as a `buildSessionRows({ chatSessions, terminalRows })` function that filters nothing but merges and sorts by timestamp descending; `ChatSessionsScreen` switches to the shared component and helper so both surfaces stay pixel-identical.

In `screens/(authenticated)/(home)/workspaces/WorkspacesScreen.tsx`, add a `useLiveQuery` on `collections.chatSessions` (the whole collection — it is already scoped to the active organization by `CollectionsProvider`). Build a flattened list-item union instead of the current plain workspace array:

    type HomeListItem =
      | { kind: "workspace"; workspace: HostWorkspaceItem }
      | { kind: "session"; workspaceId: string; row: SessionRowData }
      | { kind: "viewAll"; workspaceId: string; totalCount: number };

Group sessions by `v2WorkspaceId`, keep the 3 newest per workspace (by `updatedAt ?? createdAt`), and append a `viewAll` item when more exist. Sort workspaces by latest activity: the max of the workspace's own `updatedAt` and its newest session timestamp, descending (replacing the current `sort` field ordering only when the sort mode is the default recency; the explicit sort options from the filter sheet keep ordering the workspace groups). Feed the flattened array to the existing `LegendList`; `keyExtractor` becomes kind-prefixed (`ws:<id>`, `session:<id>`, `viewAll:<wsId>`). The `onViewableItemsChanged` handler that drives `useVisibleDiffStats` must now consider only `kind === "workspace"` items when collecting visible workspace ids. `renderItem` dispatches: workspace items render `WorkspaceRow`, reworked to the approved single-line header (see Decision Log: PR state icon in the icon slot, no branch line, compact time; still the Link to the workspace chat list, with "Open PR #N" added to the long-press context menu since the tappable PR chip goes away), session items render `SessionRow` with an `onPress` that does `router.push(\`/(authenticated)/workspace/${workspaceId}/chat/${row.id}\`)`, and viewAll items render a muted "View all N sessions" pressable pushing `/(authenticated)/workspace/<id>/chat`. Indent session and viewAll rows (the reference layout insets them under the header — follow existing spacing tokens, e.g. the `px-4` grid plus an extra left inset aligned with the header's text column).

A workspace with zero sessions renders just its header row, exactly as today.

### Milestone 2: navigation polish, search, and empty states

At completion the grouped list feels finished: search matches session titles as well as workspace name/branch/project; groups whose only match is a session still appear; the empty state copy still distinguishes "no workspaces in this project" from "no search matches". Verify the back stack: opening a session from home and pressing back must land on home (this already holds for the `useCreateChatWorkspace` push of the same route; re-verify manually on the simulator). Pull-to-refresh keeps refreshing the host workspace list; chat sessions are live via Electric and need no refresh hook. Confirm the floating `NewChatWidget` does not overlap the last group's rows (bump the list's `paddingBottom` if the session rows change the scroll extent).

### Milestone 3: terminal-agent rows on home via a host-wide list

**Superseded (2026-07-10): terminal agents are removed from mobile — see Decision Log. The host-wide `terminalAgents.list` query shipped and now drives only the workspace attention dot; the row-interleaving described below will not be built, and its plumbing is slated for deletion (review finding 7).**

At completion, live terminal agents appear under their workspace headers on home with the same status pills as the per-workspace screen, using one poll for the whole host.

In `packages/host-service`, add a `list` method to `TerminalAgentStore` (`packages/host-service/src/terminal-agents/store.ts`) returning all live bindings (the store already holds them; mirror `listByWorkspace` without the workspace filter), and expose it as a `list` query on `terminalAgentsRouter` (`packages/host-service/src/trpc/router/terminal-agents/terminal-agents.ts`) taking no input and returning `TerminalAgentBinding[]` (each binding already carries `workspaceId`, `agentId`, `terminalId`, `lastEventType`, `lastEventAt`).

In mobile, add `hooks/useHostTerminalAgents/` (app-level `hooks/`, since it is host-scoped not screen-scoped) modeled on `useWorkspaceTerminalAgents`: input is the selected host (`organizationId`, `machineId`, `isOnline`), 5s `refetchInterval`, disabled when offline, returns rows grouped by `workspaceId` reusing the same `statusFromEvent`/`agentLabel` mapping — export those two helpers from the existing hook's folder rather than duplicating them (promote them into the shared `utils/sessionRows/` module if that reads cleaner). `WorkspacesScreen` merges these into each group through `buildSessionRows`, so terminal and chat rows interleave by recency exactly as on the per-workspace screen. When the host is offline or the query errors, groups simply omit terminal rows (same degradation as today).

### Milestone 4 (optional, confirm appetite first): "+ new chat" on a workspace header

At completion, each workspace header gets a compact "+" affordance (mirroring the reference screenshot) that opens a minimal composer and starts a new session in that existing workspace. Implementation path: reuse the `PromptInput` composer pieces from `NewChatWidget`, but submit via the host's existing `agents.run` mutation (`client.agents.run.mutate({ workspaceId, agent: "superset", prompt, model, attachmentIds })` — see `runAgentInWorkspace` in `packages/host-service/src/trpc/router/agents/agents.ts`, which creates the cloud session and sends the first message), then push the returned `sessionId` route. This is deliberately a separate milestone: it is the only net-new capability (mobile cannot do this today) and the unified list is valuable without it.

### Final tidy

Rename `screens/(authenticated)/(home)/workspaces/` to `screens/(authenticated)/(home)/home/` with `HomeScreen.tsx` (the screen no longer lists only workspaces), updating the import in `app/(authenticated)/(home)/index.tsx`. Do this as the last commit so review diffs for the milestones stay readable. Keep `workspacesFilterStore` and component names that are still workspace-scoped (`WorkspaceRow` etc.) as they are.

## Concrete Steps

Work from the repo root on branch `mobile-unified-nav`.

    bun install                       # if needed
    cd apps/mobile && bun dev         # or run the existing dev build in the iOS simulator

After each milestone:

    bun run typecheck                 # from repo root; expect no errors
    bun run lint:fix && bun run lint  # must exit 0 before any push (CI fails on warnings)

Milestone 3 additionally:

    bun test packages/host-service    # existing store tests must pass; extend store.test.ts with a list() case

## Validation and Acceptance

Manual acceptance in the iOS simulator (see `reference_ios_simulator_driving` techniques if driving hands-free):

(Updated 2026-07-10 to match the decisions above.)

1. Home shows workspace rows grouped under date headers (Now/Today/Yesterday/This week/This month/Older) for the selected project, each with its chat sessions nested beneath (currently uncapped — see Open Questions).
2. Tapping a session row opens that conversation directly (one tap from home); back returns to home.
3. Workspace rows are not tappable; long-press opens the context menu (rename/delete/copy branch/open PR), and the ghost "+" starts a new chat in that workspace when the host is online.
4. Searching by a session title surfaces the owning workspace group.
5. ~~Terminal rows on home~~ — obsolete: terminal agents are removed from mobile. A running CLI agent surfaces only as the workspace attention dot (amber working / red needs-input), which must clear when the agent goes idle (review finding 2) and must not persist stale after the host disconnects (finding 3).
6. Existing flows unchanged: filter sheet, org switcher, NewChatWidget creation (lands directly in the new thread), pull-to-refresh, host-offline placeholder.

## Idempotence and Recovery

All milestones are additive UI refactors behind no flags; each lands as its own commit so any regression bisects cleanly. Milestone 1 is the only one touching the per-workspace screen (extraction refactor) — keep that extraction commit separate from the home-screen commit so the pixel-identical claim is verifiable in isolation. Milestone 3's host-service query is additive; old mobile builds ignore it and the per-workspace endpoint remains.

## Interfaces and Dependencies

No new libraries. New/changed surfaces:

- `screens/(authenticated)/components/SessionRow/` — shared presentational component (chat + terminal variants).
- `screens/(authenticated)/utils/sessionRows/` — `buildSessionRows`, timestamp helpers, row types.
- `hooks/useHostTerminalAgents/` — host-wide terminal-agent poll (Milestone 3).
- `packages/host-service` `terminalAgentsRouter.list` — no-input query returning `TerminalAgentBinding[]` (Milestone 3).
- `agents.run` host mutation — existing, consumed only in Milestone 4.
