# Ctrl+Tab most-recently-used (MRU) pane switcher for the desktop app

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows the conventions in the repository root `AGENTS.md`, the desktop-specific `apps/desktop/AGENTS.md`, and the ExecPlan template in `.agents/commands/create-plan.md`.

## Purpose / Big Picture

Today, pressing `Ctrl+Tab` in the Superset desktop app moves to the *next tab to the right* inside the workspace you are currently looking at. If you are bouncing between two Claude Code sessions that happen to sit three tabs apart — or worse, in two different workspaces — `Ctrl+Tab` is useless: you have to click through the sidebar and the tab bar to get back to what you were just doing.

After this change, `Ctrl+Tab` behaves like the application switcher every user already knows from their operating system. Holding `Ctrl` and tapping `Tab` walks backwards through the panes you actually used most recently, *across every open tab, every split pane, and every workspace*. A small overlay appears while you hold `Ctrl`, showing the candidate list with the current selection highlighted. Releasing `Ctrl` jumps you there — navigating to the other workspace if needed — and moves that pane to the front of the list. A single quick `Ctrl+Tab` (tap and release) toggles between the two most recent panes, so flipping back and forth between two Claude sessions costs one keystroke.

How you can see it working after implementation: run `bun dev`, open two workspaces, put a chat pane and a terminal pane in each, click each of them once in some order, then hold `Ctrl` and tap `Tab`. An overlay lists those four panes newest-first, the highlight advances with each tap, and releasing `Ctrl` lands you on the highlighted pane — including switching workspaces when the highlighted pane belongs to a different one. Quit the app, reopen it, and the same recency order is still there.

### Terms defined

Because a reader of this plan may be new to this repository, every non-obvious term used below is defined here and re-used consistently.

A **workspace** is an isolated git worktree copy of a repository that Superset manages. In the desktop UI it is a row in the left sidebar. Its route is `/v2-workspace/$workspaceId`, implemented under `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/`.

A **tab** is a container inside a workspace, shown in the tab bar at the top of the workspace content area. A tab holds one or more panes arranged in a split layout.

A **pane** is a single leaf of content inside a tab: a terminal, a Claude Code chat session, a file viewer, a diff viewer, or an embedded browser. Two Claude Code sessions side by side inside one tab are two panes. The pane's kind is the string `pane.kind` (`"chat"`, `"terminal"`, `"browser"`, `"diff"`, `"file"`, …).

**MRU** stands for "most recently used". An MRU list is ordered by when each entry was last focused, newest first — as opposed to the *positional* order shown in the tab bar.

**Zustand** is the small client-side state library this repo uses for renderer state. A "store" is a Zustand store. The `persist` middleware from `zustand/middleware` writes a store's state to `localStorage` and rehydrates it on next launch; see `apps/desktop/src/renderer/stores/sidebar-state.ts` for an existing example in this codebase.

An **intent store** is a tiny Zustand store used in this repo to send a one-shot request from one part of the renderer to another part that may not be mounted yet. `apps/desktop/src/renderer/stores/right-sidebar-toggle-intent.ts` is the canonical minimal example: a counter (`tick`) that a consumer subscribes to, acting whenever the counter changes.

**TanStack DB collection** is the local-first data layer the desktop renderer uses for persisted per-workspace state. The collection relevant here is `v2WorkspaceLocalState`, obtained via `useCollections()` from `apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider`. Each row is keyed by `workspaceId` and carries a `paneLayout` field holding that workspace's saved tabs and panes.

## Assumptions

These assumptions unblock planning. Each must be confirmed and moved to the Decision Log, or removed, before this plan is considered complete.

We assume the user always has fewer than a few hundred open panes in total, so the MRU list can be held entirely in memory and written to `localStorage` on every focus change without a measurable cost. If profiling shows otherwise, the write can be debounced; this is noted as a fallback rather than built up front.

We assume `Ctrl+Tab` and `Ctrl+Shift+Tab` are safe to repurpose on all three platforms. They are already claimed by this app today as `NEXT_TAB_ALT` / `PREV_TAB_ALT` in `apps/desktop/src/renderer/hotkeys/registry.ts`, so no *new* key conflict is introduced by this work.

We assume that a pane which no longer exists in a workspace's persisted `paneLayout` is genuinely gone (closed), not merely un-hydrated. The pruning logic in Milestone 2 relies on this, and guards against the un-hydrated case by only pruning against workspace rows that have actually loaded.

## Open Questions

None currently blocking. Both previously-open scope questions were answered by the requester before drafting and are recorded in the Decision Log: the feature targets the v2 workspace implementation only, and MRU entries are pane-level rather than tab-level.

One question is deferred until Milestone 3 is running and can be judged by feel rather than argued in the abstract: whether the overlay should also be reachable without the keyboard (for example from a menu). Impacted section: Plan of Work, Milestone 3. Placeholder recorded in the Decision Log.

## Progress

- [x] (2026-07-28 12:00Z) Discovery: mapped the v1/v2 workspace split, the hotkey registry, the panes store API, and the persistence path for pane layouts.
- [x] (2026-07-28 12:00Z) Scope decisions confirmed with the requester (v2 only; pane-level entries; persist across restart; closed panes drop out).
- [x] (2026-07-28 12:20Z) Searched the issue tracker for prior requests; found #5425 and the v1 `tabHistoryStacks` prior art (recorded in Surprises & Discoveries). One scope question raised as a result (toggle vs. replacement).
- [x] (2026-07-28 12:40Z) Audited all 68 bound chords for a free alternative binding; confirmed `Ctrl+Tab` repurposing with no mode preference. Last scope question closed.
- [x] (2026-07-28 13:10Z) Milestone 1: MRU store with pure ordering logic and unit tests. 13 tests pass; `bun run lint` and `bun run typecheck` exit 0.
- [x] (2026-07-28 13:40Z) Milestone 2: `useRecordPaneMru` wired into the v2 workspace page and `usePrunePaneMru` into the dashboard layout. 23 tests pass across 3 files. Manual devtools verification still outstanding — the machine's disk was full and had to be cleared before `bun dev` could run.
- [x] (2026-07-28 15:05Z) Milestone 3: cycle state machine, overlay, commit-on-release; positional `PREV_TAB_ALT`/`NEXT_TAB_ALT` bodies removed and registry labels updated.
- [x] (2026-07-28 15:05Z) Milestone 4: `pane-focus-intent` store plus `useApplyPaneFocusIntent`, retried across the layout-hydration race. 35 tests pass across 5 files; lint and typecheck exit 0. Manual acceptance walkthrough still outstanding.
- [ ] Follow-up: `revealWorkspace` is not yet called on a cross-workspace commit, so a target inside a collapsed sidebar group stays collapsed. Extracting it from `useDashboardSidebarShortcuts` needs that hook's sidebar data; deferred rather than bolted on.
- [ ] Final validation: `bun run typecheck`, `bun run lint`, `bun test`, plus the manual acceptance walkthrough.

## Surprises & Discoveries

- Observation: `Ctrl+Tab` is not an unbound key. It is already registered.
  Evidence: `apps/desktop/src/renderer/hotkeys/registry.ts` lines 478-491 define `PREV_TAB_ALT` (`ctrl+shift+tab`) and `NEXT_TAB_ALT` (`ctrl+tab`) on all three platforms. This is good news: the work is a behavior change behind existing hotkey ids, not a new binding that could collide.

- Observation: there are two live workspace implementations, not one.
  Evidence: `apps/desktop/src/renderer/hooks/useIsV2CloudEnabled.ts` gates between the v1 route (`_dashboard/workspace/$workspaceId/page.tsx`, backed by the global Zustand store in `apps/desktop/src/renderer/stores/tabs/`) and the v2 route (`_dashboard/v2-workspace/$workspaceId/`, backed by a per-workspace store from `@superset/panes`). Both currently implement `NEXT_TAB_ALT` as positional cycling, in `workspace/$workspaceId/page.tsx:259` and `v2-workspace/$workspaceId/hooks/useWorkspaceHotkeys/useWorkspaceHotkeys.ts:171` respectively.

- Observation: a v2 workspace's pane store does not outlive the route.
  Evidence: `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useV2WorkspacePaneLayout/useV2WorkspacePaneLayout.ts:27-35` creates the store inside a `useMemo` keyed on `workspaceId`, deliberately, so a workspace switch cannot leak panes across worktrees. Consequence for this plan: a *global* MRU cannot live inside those stores, and activating a pane in a not-currently-mounted workspace cannot be done by calling that workspace's store directly. Milestones 1 and 4 are shaped by this.

- Observation: this feature is already requested in the issue tracker, and the triage note there anticipates most of this plan.
  Evidence: [superset-sh/superset#5425](https://github.com/superset-sh/superset/issues/5425) ("Make a toggle for ctrl-tab functionality", opened 2026-07-03 by @AryaBuddha) asks for Ctrl+Tab to switch between most recent tabs. Its automated triage comment already identifies the same two files this plan changes and reaches the same conclusion — that `@superset/panes` has no MRU tracking today. Two differences from this plan are worth noting: the issue asks for a user-facing *toggle* between positional and MRU modes (see Open Questions), and it frames the feature at tab granularity, whereas this plan is pane-level and cross-workspace by the requester's direction. When the work lands, the PR should close #5425. The related tracker [#5598](https://github.com/superset-sh/superset/issues/5598) collects stale keyboard-shortcut issues and is worth a glance for overlapping asks, but contains nothing that conflicts.

- Observation: the v1 tabs store already implements a per-workspace MRU stack, which is usable prior art.
  Evidence: `apps/desktop/src/renderer/stores/tabs/store.ts` maintains `tabHistoryStacks: Record<string, string[]>` (workspace id to a most-recent-first list of tab ids), pushed on `setActiveTab` at `store.ts:214-233` and consumed on tab removal at `store.ts:77`. Read `apps/desktop/src/renderer/stores/tabs/utils.ts:795-1000` before writing Milestone 1 — the removal-and-repair logic there is the same shape the new store needs. It differs in three ways that matter: it is tab-level rather than pane-level, it is scoped per workspace rather than global, and it is used only to pick a fallback tab after a close, never for cycling. So it is a reference, not something to extend.

- Observation: there is no free, hold-friendly chord that would be a better home for this than `Ctrl+Tab`, which is part of why the binding is being repurposed rather than added.
  Evidence: extracting every `mac:` chord from `apps/desktop/src/renderer/hotkeys/registry.ts` yields 68 bound chords, covering `meta+1..9`, `meta+alt+1..9`, `ctrl+1..9`, `meta+alt+<arrows>`, most `meta+<letter>` and `meta+shift+<letter>` combinations, plus `ctrl+tab` and `ctrl+shift+tab`. The only genuinely free and hold-friendly pair found was `ctrl+backquote` / `ctrl+shift+backquote` (the registry's token for the backtick key is `backquote`, per `hotkeys/display.ts:35`). Alternatives were rejected for platform reasons: `alt+tab` is the OS switcher on Windows and Linux, `meta+tab` is the macOS app switcher, `meta+backquote` is macOS window cycling, and Windows reserves `ctrl+alt+tab`. `ctrl+<letter>` chords were rejected separately because they collide with terminal readline bindings — the cause of past bugs #3333 and #3338.

- Observation: `registry[kind].getTitle()` is NOT sufficient to label a pane in the overlay, which changes what Milestone 2 must record.
  Evidence: in `v2-workspace/$workspaceId/hooks/usePaneRegistry/usePaneRegistry.tsx`, the chat kind's `getTitle` returns the constant `"Chat"` (line 506) and the terminal kind's returns the constant `"Terminal"` (line 312). The real titles arrive by other routes: chat renders a `<ChatPaneTitle>` React component via `renderTitle` (lines 507-509), and terminal subscribes to `terminalRuntimeRegistry.onTitleChange(...)` / `.getTitle(...)` through a `titleSource` (lines 313-326). Consequence: naively snapshotting `getTitle` would label every chat pane "Chat" and every terminal "Terminal", making the overlay useless for exactly the case this feature exists to serve — telling two Claude sessions apart. Milestone 2 must resolve the label as `pane.titleOverride ?? terminalRuntimeRegistry.getTitle(...) for terminals ?? registry getTitle ?? kind`, and additionally record the containing tab's title (via `resolveTabTitle(tab, tabs, paneRegistry)`, as used at `useDefaultContextMenuActions.tsx:128`) so the overlay can show "tab › pane" and stay unambiguous when the pane title is generic.

- Observation: everything Milestone 2 needs is already in scope at the `useWorkspaceHotkeys` call site, so no prop-drilling is required.
  Evidence: `v2-workspace/$workspaceId/page.tsx` calls it at line 259 inside `V2WorkspaceContent`, where `store` (line 141), `paneRegistry` (line 189), and `workspace` — carrying `.name` and `.branch` — (line 128, from `useWorkspace()`) are all already local. The new `useRecordPaneMru` hook can be called immediately after it with the same values. Note `workspace.name` may be empty; the codebase's established fallback is `workspace.name || workspace.branch` (see `_dashboard/layout.tsx:139`), which the MRU entry should reuse.

- Observation: there is already a dashboard-level hook that owns cross-workspace keyboard navigation.
  Evidence: `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useDashboardSidebarShortcuts/useDashboardSidebarShortcuts.ts:137-157` implements `PREV_WORKSPACE`/`NEXT_WORKSPACE` and already calls `navigateToV2Workspace(id, navigate)`. It is mounted regardless of which workspace is active, which makes it the natural host for a global switcher.

## Review Findings (2026-07-28)

Four independent reviews were run over the finished change — repository
conventions, data-access patterns, React correctness plus refactor safety, and
test quality. Their findings are recorded here in full, because several
contradict claims made earlier in this plan and in code comments.

### Regressions introduced into existing code

The `PullRequestStateIcon` extraction was not behaviour-preserving, despite
being described as such when it was made. Passing `title` to a react-icons
component renders a real `<title>` element — a native browser tooltip — where
the original inline icon had none. That icon is already the trigger for a Radix
tooltip reading "PR #N — <state>" plus "Click to open on GitHub"
(`DashboardSidebarExpandedWorkspaceRow.tsx:135-188`), so the sidebar began
showing two tooltips at once, the native one reading a bare "Open" because the
sidebar call site passes no `number`. The added `aria-label` is likewise new
surface: the icon previously had no accessible name, the svg carries no
`role="img"` so support is inconsistent, and it sits inside a button that
already has its own label. Everything else about the extraction was verified
identical line by line — icon per state, colour classes, `size-3.5`,
`strokeWidth={1.75}`, no props gained or lost.

Calling `useDashboardSidebarData()` from `useLiveEntryNames` was a mistake. The
code comment claiming React Query would "serve these from cache rather than
polling a second time" is only half true: the *data* is shared by key, but each
observer schedules its own `refetchInterval: 10_000` timer, and the derivation
work (`buildDashboardSidebarProjects`, plus two `JSON.stringify` fingerprints)
re-runs per consumer. Worse, the hook is called unconditionally from
`_dashboard/layout.tsx`, so PR polling for every workspace now runs on routes
where the sidebar is not mounted at all, and `groups` changing re-renders the
entire dashboard subtree including the active workspace. The repository already
had the right precedent, which was missed: `useAccessibleV2Workspaces` needed PR
data outside the sidebar and imported the primitives
(`derivePullRequestQueryTargets`, `getDashboardSidebarPullRequestQueryKey`)
rather than the whole hook.

### Real defects in the new code

`useRecordPaneMru` never re-records when the contents of its `latest` ref
change. Three reviews found this independently. `record()` fires only on mount,
on a workspace-store emission, and on a pane `titleSource` emission — none of
which occur when a chat session title loads, an agent binding resolves, or a
workspace is renamed. A chat pane focused before `chatSessions` hydrates
therefore persists the static "Chat" fallback indefinitely. This is the same
class of defect as the terminal-title bug fixed earlier in this plan; only the
`titleSource` half was fixed. It also explains the observed behaviour where an
agent logo appeared only after some unrelated store change: the update was
being rescued incidentally by the title subscription, so an agent whose title
never changes kept a generic glyph.

Three keyboard edge cases: the commit handler tests `event.key === "Control"`
while the binding is user-remappable through Settings → Keyboard, so rebinding
to Alt or Meta strands the overlay with no commit; `Escape` calls
`preventDefault` but not `stopPropagation`, so cancelling a cycle also closes
any dialog underneath; and `blur` commits rather than cancels, which in Electron
fires when focus moves into a webview or DevTools, turning an incidental focus
loss into a real pane switch and possibly a cross-workspace navigation.

`useApplyPaneFocusIntent` discards a pending request if `isLayoutReady` is true
while `tabs` is still empty, silently losing a cross-workspace switch.

### Conventions

Comment density in the new files runs 4–10x that of their neighbours (65% in
`stores/pane-mru/types.ts` against 0% in `stores/ports/store.ts`; 38% in
`cycle.ts` against 7% in `useFailedAutomations.ts`), and the tone is narrative
where the surrounding code is terse. The load-bearing comments — the two
race-condition notes and the half-hydration guard — earn their place; the
per-field JSDoc and the restatements of adjacent code do not.

`stores/pane-mru/types.ts` imports a type from a route component, which no other
file under `stores/` does. `isSameDisplay(a, b)` takes two positional
parameters while every other function in the change uses an object signature.
Barrels export private helpers that nothing outside their folder imports, where
every sibling barrel exports exactly one symbol. `useLiveEntryNames` shadows
`workspaces`, and `useRecordPaneMru` aliases a store action to `record0`.

This plan also miscited the object-parameter rule as coming from the root
`AGENTS.md`; it is documented in `.agents/commands/create-plan.md`.

### Tests

The recursion regression test does not test the shipped code. It constructs its
own subscriber that clears before writing and asserts that subscriber does not
recurse, which proves Zustand's semantics rather than the fix in
`useApplyPaneFocusIntent`. Moving `clear()` back after the store write, deleting
the `isApplying` guard, or dropping the workspace-id filter all leave it green.

Several assertions are weaker than they appear: the `entryKey` test passes for
an implementation returning only `workspaceId`; the cross-workspace
`recordFocus` test asserts length alone and would pass if MRU order were
inverted; `isSameDisplay` compares seven fields but only two are covered, and
the uncovered `tabId` is what routes the switch. The two-entry cycle — the
tap-to-toggle case the feature exists for — is untested, as are
`selectedEntry` returning undefined and the store's `migrate`/`partialize`.

Confirmed sound and explicitly not findings: co-location placement throughout,
the private row component in `PaneMruSwitcher.tsx`, `pane.data as X` narrowing
(the established idiom in these hooks), test-fixture casts, absence of `any`,
`@ts-ignore` or empty catch blocks, listener cleanup, `useHotkey`'s stale-closure
protection, and the `isReady` gating on the prune write.

### Resolution

All findings above were addressed. Notable choices:

The `title`/`aria-label` were removed from `PullRequestStateIcon` entirely
rather than made conditional — callers own labelling, and the sidebar already
supplies both a Radix tooltip and a labelled button.

`useLiveEntryNames` moved out of `usePaneMruSwitcher` and into a child of
`PaneMruSwitcher` that only mounts while a cycle is running. That removes the
always-on polling and keeps overlay re-renders out of the dashboard layout,
without needing to reimplement the sidebar's PR query.

`PullRequestState` moved to `shared/pull-request-types.ts`, so the store no
longer imports from a route component and the sidebar's own type refers to the
same union.

The commit handler now accepts Control, Alt or Meta, since bindings are
remappable. Shift is deliberately excluded: `Ctrl+Shift+Tab` releases Shift
mid-cycle, and treating that as a commit would end the cycle a step early.
`blur` now cancels rather than commits, because in Electron it fires when focus
moves into a webview or DevTools.

The recursion regression test was rewritten against the real code path. The
apply logic was extracted to a pure `applyFocusIntent`, and the test drives it
through a fake store whose `setActiveTab` notifies subscribers synchronously.
Verified by mutation: moving `clear()` back after the writes fails the test,
which the previous version did not.

One correction to the earlier claim that re-entry must never occur — it does
occur once, when the synchronous notification re-enters a call whose request is
already cleared. That is expected and bounded; the property worth asserting is
that the request is *applied* exactly once, not that the function is never
re-entered.

## CDP Verification (2026-07-30)

The desktop app has no component-render tests — there is no `@testing-library`
or DOM environment anywhere in `apps/desktop`, and all 244 test files exercise
pure functions. Nothing in the automated suite can observe a rendering
regression, which is exactly how the `PullRequestStateIcon` double-tooltip
survived a green suite. The rendering changes were therefore verified against
the running app over the Chrome DevTools Protocol, driving real input into the
renderer matched to this worktree (`localhost:3005`, CDP 9333, API 3001) with a
confirmed signed-in session carrying an `activeOrganizationId`.

The PR-icon regression was verified by mutation rather than by inspection.
With the fix in place the probe reports zero `<title>` descendants and a null
`aria-label` on the icon inside `button[aria-label^="Open pull request #"]`.
Re-adding `title="Open"` and `aria-label="Open"` to `PullRequestStateIcon` and
letting HMR apply it flipped the same probe to `titleElements: ["Open"]`. The
mutation was then reverted. Without that step the check would have proven only
that the selector matched something.

The switcher itself was driven by held-modifier key events: `Ctrl` down, `Tab`
tapped, overlay captured, `Ctrl` released. The overlay drew eight rows with the
project avatar leading, `project / workspace` as secondary text, and the agent
logo trailing — Claude and OpenCode logos resolved from real bindings, not
fallback glyphs. Releasing `Ctrl` committed a cross-workspace switch from
`yurr` to `wiry-gravity`, confirmed by the sidebar highlight, the branch chip,
the terminal prompt, and the Changes panel all moving together. Note that
`window.location.hash` still read the previous workspace immediately after the
commit; the screenshot is the authoritative evidence, and the hash lag is a
property of how the v2 route updates, not a failed switch.

Positional cycling was re-checked because the `PREV_TAB_ALT` / `NEXT_TAB_ALT`
handler bodies were deleted from `useWorkspaceHotkeys`. `⌘⌥→` moved the active
tab from index 1 to index 2 and `⌘⌥←` moved it back, with the pane content
changing to match. Settings → Keyboard, reached by real clicks (a
`location.hash` assignment does not remount the route, as `apps/desktop/AGENTS.md`
warns), renders all three entries with their bindings: Next Recent Pane on
`⌃⇧⇥`, Previous Recent Pane on `⌃⇥`, and Next Recent Pane (no Shift) on `` ⌃` ``,
each with a working Reset control.

Two things were checked and found to be pre-existing rather than caused by this
change. The `shell-wrappers` suite fails on this machine because it shells out
to the real installed `claude` binary, which rejects `--print` without stdin;
it is main-process code untouched by this plan. A `setState`-during-render
warning names `DockBadgeController`, mounted from
`routes/_authenticated/layout.tsx` — a different file from the
`_dashboard/layout.tsx` this plan edits.

One correction to an earlier claim in this plan that `bun run lint` exits 0:
it exits 1 on this machine because `scripts/lint.sh` calls `rg`, and ripgrep is
not installed here as a real binary. Biome itself is clean (5491 files, no
fixes applied), and both ripgrep-backed guards were re-run manually with `grep`
against the changed and new files — the `origin/` string-operation guard finds
nothing, and the cloud-workspace guard does not apply because the diff touches
no `packages/cli` or `packages/sdk` file.

## Decision Log

- Decision: Target the v2 workspace implementation (`@superset/panes`) only. The v1 route keeps today's positional `Ctrl+Tab`.
  Rationale: dev builds and all accounts created after the v2 cutoff already default to v2 (`useIsV2CloudEnabled`), so v2 is where the feature is seen. Supporting both would mean two recording adapters, two activation paths, and two test suites for a code path that is being retired.
  Date/Author: 2026-07-28, requester decision during planning.

- Decision: MRU entries are pane-level, not tab-level.
  Rationale: the requesting use case is explicitly "two Claude Code instances in the same workspace". Those are frequently two panes inside one tab; a tab-level list would collapse them into one entry and could not switch between them.
  Date/Author: 2026-07-28, requester decision during planning.

- Decision: The MRU order is persisted to disk and survives an app restart.
  Rationale: the requester chose persistence so that `Ctrl+Tab` is immediately useful after relaunch rather than needing to be "warmed up" by visiting panes.
  Date/Author: 2026-07-28, requester decision during planning.

- Decision: Closed panes drop out of the list immediately; the list only ever contains currently-open panes.
  Rationale: requester decision. The app already has a separate `REOPEN_CLOSED_TAB` hotkey for reviving closed tabs, so the MRU list does not need to double as an undo history.
  Date/Author: 2026-07-28, requester decision during planning.

- Decision: The MRU list lives in a new standalone persisted Zustand store rather than inside the per-workspace panes store.
  Rationale: forced by the architecture — see Surprises & Discoveries. Per-workspace stores are created and destroyed per route, so they cannot hold cross-workspace state.
  Date/Author: 2026-07-28, plan author.

- Decision: Each MRU entry caches a display label and pane kind at record time.
  Rationale: the overlay must render entries belonging to workspaces that are not mounted. Their titles would otherwise require instantiating a pane registry for every workspace just to draw a list. Caching the label at focus time is cheap and refreshes naturally each time the pane is focused.
  Date/Author: 2026-07-28, plan author.

- Decision: Keep the `Ctrl+Tab` / `Ctrl+Shift+Tab` bindings and change what they do, rather than introducing a new chord for MRU. No separate mode preference is added.
  Rationale: considered three alternatives after auditing which chords are free (see Surprises & Discoveries for the audit). Ctrl+Tab is the binding users' hands already reach for and the one #5425 asks about; putting MRU on an unfamiliar chord such as `Ctrl+\`` would leave the obvious key doing the less useful thing. Nothing is lost, because positional cycling remains on the untouched `PREV_TAB` / `NEXT_TAB` bindings (`⌘⌥←` / `⌘⌥→`).
  Date/Author: 2026-07-28, requester decision during planning.

- Decision: Do not add a persisted boolean preference for positional-versus-MRU mode. Rebinding through Settings → Keyboard is the supported escape hatch.
  Rationale: the hotkey registry already renders every entry in `apps/desktop/src/renderer/routes/_authenticated/settings/keyboard/page.tsx` with rebinding and conflict detection (`hotkeys/hooks/useRecordHotkeys/useRecordHotkeys.ts:222`). A user who wants positional cycling back on `Ctrl+Tab` can reassign it there. A dedicated preference controlling the same outcome would be redundant surface with its own persistence, setter, settings control, and second test path. Note this means #5425 is satisfied in substance (both behaviors available, user chooses which key does which) but not to the letter (no in-app toggle switch); say so when closing the issue.
  Date/Author: 2026-07-28, requester decision during planning.

- Decision: The switcher lists panes only. A workspace with no open tabs never appears in it, and neither does a pane that has never been focused or a backgrounded terminal session that has no pane attached.
  Rationale: raised by the requester after using the feature, who asked whether the omission was intentional. It follows directly from the pane-level decision above — the list holds panes, and these cases have no pane to record or focus — but it had not been written down, and it is not self-evident from the code. Adding empty workspaces would mean a second kind of entry whose commit means "navigate to a workspace" rather than "focus a pane"; that capability already exists under `PREV_WORKSPACE` / `NEXT_WORKSPACE` and `⌘⌥1-9`, so mixing the two into one list was rejected as muddling what `Ctrl+Tab` means. Backgrounded terminals are reachable through the existing `BackgroundTerminalsButton` in the tab bar.
  Date/Author: 2026-07-28, requester decision after hands-on use.

- Decision: Overlay rows show the detected agent's logo, the pane label, and `repo / workspace` as secondary text.
  Rationale: also from hands-on use. The repo name was missing entirely, and rows for agent terminals were drawn with a generic terminal glyph even though the app already resolves real agent logos elsewhere. Both are resolved at record time and stored on the entry (`projectName`, `agentId`) rather than looked up on read, for the same reason the label is: the overlay renders panes from workspaces that are not mounted and cannot be queried. `PaneMruIcon` mirrors the treatment in `TerminalPaneIcon` (`usePresetIcon` keyed on the agent id from `useTerminalAgentBindings`), falling back to a per-kind glyph.
  Date/Author: 2026-07-28, requester decision after hands-on use.

- Decision placeholder (unresolved): whether the switcher should also be openable without holding a modifier (e.g. from a menu or the command palette).
  Rationale: to be judged once Milestone 3 is usable.
  Date/Author: to be filled.

## Outcomes & Retrospective

To be filled in at the end of each milestone and at completion. Compare the delivered behavior against the acceptance walkthrough in "Validation and Acceptance" and note anything the plan got wrong.

## Context and Orientation

This section describes the current state of the code as if the reader has never opened this repository.

Superset's desktop app is an Electron application living in `apps/desktop`. Electron runs two kinds of process: the **main process** (`apps/desktop/src/main/`, which may use Node.js APIs such as the filesystem) and the **renderer process** (`apps/desktop/src/renderer/`, which is a browser environment and must not import Node.js modules). All work in this plan is renderer-only. There is a lint rule for this: `bun run lint:check-node-imports`.

The renderer is a React application routed by TanStack Router. Routes are files under `apps/desktop/src/renderer/routes/`. The dashboard shell — sidebar plus content area — is `apps/desktop/src/renderer/routes/_authenticated/_dashboard/layout.tsx`. Inside that shell, the active workspace is rendered by `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/`.

### The hotkey system

Keyboard shortcuts are declared centrally in `apps/desktop/src/renderer/hotkeys/registry.ts`, in a single exported object `HOTKEYS_REGISTRY`. Each entry has an id (the object key, e.g. `NEXT_TAB_ALT`), a per-platform key binding, a human label shown in the settings UI, and a category. The two entries this plan changes are at lines 478-491:

    PREV_TAB_ALT: {
        key: {
            mac: "ctrl+shift+tab",
            windows: "ctrl+shift+tab",
            linux: "ctrl+shift+tab",
        },
        label: "Previous Tab (Alt)",
        category: "Terminal",
    },
    NEXT_TAB_ALT: {
        key: { mac: "ctrl+tab", windows: "ctrl+tab", linux: "ctrl+tab" },
        label: "Next Tab (Alt)",
        category: "Terminal",
    },

Components consume a binding with the `useHotkey` hook from `apps/desktop/src/renderer/hotkeys` (implementation: `apps/desktop/src/renderer/hotkeys/hooks/useHotkey/useHotkey.ts`). It takes a registry id and a callback, wraps `react-hotkeys-hook`, and returns display strings for rendering the shortcut in tooltips. Important limitation for this plan: `useHotkey` fires on *key down* for a full chord. It gives no notification when a modifier key is *released*. Detecting the `Ctrl` release therefore needs a plain `window.addEventListener("keyup", …)` listener, added in Milestone 3.

### The v2 pane model

The pane/tab data model lives in the workspace-agnostic package `packages/panes`. Its types (`packages/panes/src/types.ts`) are small enough to quote in full:

    export interface Pane<TData> {
        id: string;
        kind: string;
        titleOverride?: string;
        pinned?: boolean;
        data: TData;
    }

    export interface Tab<TData> {
        id: string;
        titleOverride?: string;
        createdAt: number;
        activePaneId: string | null;
        layout: LayoutNode;
        panes: Record<string, Pane<TData>>;
    }

    export interface WorkspaceState<TData> {
        version: 1;
        tabs: Tab<TData>[];
        activeTabId: string | null;
    }

`createWorkspaceStore<TData>()` (exported from `@superset/panes`, implemented in `packages/panes/src/core/store/store.ts`) returns a Zustand store whose state is a `WorkspaceState` plus actions. The actions this plan uses are `setActiveTab(tabId)`, `setActivePane({ tabId, paneId })`, and the read helper `getActivePane(tabId)`. The store is a vanilla Zustand store (`StoreApi<WorkspaceStore<PaneViewerData>>`), so it exposes `getState()` and `subscribe(listener)` directly.

`PaneViewerData` is the desktop app's concrete pane payload type, declared in `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types.ts`.

### How the v2 pane layout is persisted

`apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useV2WorkspacePaneLayout/useV2WorkspacePaneLayout.ts` is the bridge between the in-memory store and disk. It creates the store inside a `useMemo` keyed on `workspaceId`, reads the persisted layout out of the `v2WorkspaceLocalState` TanStack DB collection with a live query, pushes it into the store via `replaceState`, and subscribes to the store to write changes back into the collection's `paneLayout` field.

Two consequences matter for this plan. First, every workspace's tabs and panes are readable from the `v2WorkspaceLocalState` collection *without* mounting that workspace's route — which is what makes pruning and the cross-workspace overlay possible. Second, the store itself is torn down on workspace switch, so a pane in another workspace cannot be activated by calling into its store; that is what Milestone 4's intent store solves.

Note the repo-wide rule about this data layer, from the root `AGENTS.md`: TanStack DB live queries are cache-first, so `useLiveQuery` may return usable rows while `isReady` is still false. Render existing rows first and use `isReady` only to decide what to show when there is no data. Crucially, the same rule states that *write* side effects must wait for strict readiness. The pruning logic in Milestone 2 is a write side effect and must respect this, or it will delete MRU entries for workspaces whose rows simply have not loaded yet.

### Where the current behavior lives

Positional `Ctrl+Tab` for v2 is `useWorkspaceHotkeys` at `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useWorkspaceHotkeys/useWorkspaceHotkeys.ts:163-178`. Both `PREV_TAB_ALT` and `NEXT_TAB_ALT` there duplicate the bodies of `PREV_TAB` and `NEXT_TAB` above them.

Cross-workspace keyboard navigation lives one level up, in `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useDashboardSidebarShortcuts/useDashboardSidebarShortcuts.ts`. It holds the flattened list of all workspaces, a `revealWorkspace` helper that expands collapsed sidebar groups, and calls `navigateToV2Workspace(workspaceId, navigate)` from `apps/desktop/src/renderer/routes/_authenticated/_dashboard/utils/workspace-navigation.ts`.

### UI building blocks

Shared UI components are shadcn/ui components in `packages/ui/src/components/ui/`. Relevant to the overlay: `dialog.tsx`, `command.tsx`, and `kbd.tsx`. These are kebab-case single files by deliberate exception to the repo's folder-per-component rule, because the shadcn CLI expects that layout; do not restructure them. New app components follow the normal rule from the root `AGENTS.md`: one folder per component containing `ComponentName.tsx`, an `index.ts` barrel, and co-located tests.

## Plan of Work

The work splits into four milestones that each leave the app in a working state.

Milestone 1 introduces a new persisted store holding the MRU list, with all ordering logic written as pure functions so it can be unit tested without React. Nothing observable changes yet.

Milestone 2 starts feeding that store: whenever a pane is focused in a mounted v2 workspace, an entry is recorded or moved to the front; and whenever the set of open panes changes, entries for panes that no longer exist are pruned. At the end of this milestone the list is correct and persisted, but no key press reads it.

Milestone 3 rewires `NEXT_TAB_ALT` and `PREV_TAB_ALT` to walk the MRU list instead of the positional tab order, adds the hold-and-release cycling state machine, and adds the overlay. At this point switching works fully within the current workspace, and selecting an entry from another workspace navigates to that workspace but lands on whatever pane it was already showing.

Milestone 4 closes that last gap with a focus intent store, so committing to a pane in another workspace activates the exact tab and pane once the target route mounts.

The approach is deliberately additive: the new code path is added alongside the existing positional handlers, and the positional bodies of `PREV_TAB_ALT`/`NEXT_TAB_ALT` are only deleted in Milestone 3 once their replacement is in place. `PREV_TAB` and `NEXT_TAB` (the `⌘⌥←`/`⌘⌥→` bindings) keep their positional behavior throughout and are not touched, so users who prefer positional cycling still have it.

### Milestone 1: the MRU store

Create `apps/desktop/src/renderer/stores/pane-mru/` containing `types.ts`, `paneMru.ts` (the pure ordering functions), `paneMru.test.ts`, `store.ts` (the Zustand store), and `index.ts` (barrel).

Define the entry type in `types.ts`:

    export interface PaneMruEntry {
        workspaceId: string;
        tabId: string;
        paneId: string;
        /** Pane kind at record time, e.g. "chat" | "terminal" | "browser". */
        kind: string;
        /** Display label captured at record time, used by the overlay. */
        label: string;
        /** Workspace display name captured at record time. */
        workspaceName: string;
        /** Epoch milliseconds of the most recent focus. */
        lastFocusedAt: number;
    }

An entry's identity is the pair `(workspaceId, paneId)`. Pane ids are generated per workspace, so pairing with the workspace id avoids any chance of collision across worktrees. Write a helper `entryKey(entry)` returning `` `${entry.workspaceId}:${entry.paneId}` `` and use it everywhere an identity comparison is needed.

In `paneMru.ts` implement three pure functions, each taking and returning a plain `PaneMruEntry[]` so they can be tested in isolation:

`recordFocus({ entries, entry })` returns a new array with any existing entry of the same key removed and `entry` placed at index 0. If the incoming entry is already at index 0 and its fields are unchanged apart from `lastFocusedAt`, return the original array reference so React subscribers do not re-render needlessly.

`removeEntries({ entries, keys })` returns a new array with every entry whose key is in `keys` removed. Used when panes close.

`pruneToOpenPanes({ entries, openKeysByWorkspace })` takes a `Map<string, Set<string>>` of workspace id to the set of pane ids currently open in that workspace, and drops any entry whose workspace appears in the map but whose pane id is not in that workspace's set. Entries whose workspace is *absent* from the map are kept untouched — that is the guard against pruning workspaces whose persisted rows have not loaded yet.

In `store.ts` create the Zustand store using the same `devtools(persist(...))` shape as `apps/desktop/src/renderer/stores/sidebar-state.ts`, with the persist key `"pane-mru-storage"` and `version: 1`. Expose state `entries: PaneMruEntry[]` and actions `recordFocus`, `removeEntries`, `pruneToOpenPanes`, and `clear`, each delegating to the pure function of the same name. Add a `partialize` that persists only `entries`, so no transient cycling state is ever written to disk.

Cap the list at a constant `MAX_MRU_ENTRIES = 100`, applied inside `recordFocus` by truncating the tail. This bounds both the persisted payload and the overlay's work; 100 is far beyond any realistic number of simultaneously open panes, so in practice the cap never engages and its only role is as a runaway guard.

Acceptance for this milestone:

    bun test apps/desktop/src/renderer/stores/pane-mru/paneMru.test.ts
    # Expected: all tests pass

The tests must cover: a new pane going to the front; refocusing an existing pane moving it to the front without duplicating it; `pruneToOpenPanes` dropping a closed pane; `pruneToOpenPanes` leaving entries of an absent (not-yet-loaded) workspace alone; and the cap truncating at 100.

Verify before proceeding: `bun run typecheck` passes and the new store is importable, though nothing uses it yet.

### Milestone 2: recording focus and pruning closed panes

Add a hook `useRecordPaneMru` under `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useRecordPaneMru/`. It takes the workspace's store (`StoreApi<WorkspaceStore<PaneViewerData>>`), the workspace id, the workspace display name, and the pane registry, and returns nothing. Call it from the same place `useWorkspaceHotkeys` is called, so it is active for exactly the currently-mounted workspace.

Inside, subscribe to the store with `store.subscribe`. On each emission, read `activeTabId`, find that tab, read its `activePaneId`, and resolve the pane. If the resulting `(tabId, paneId)` differs from the previously seen pair, call `recordFocus` on the MRU store with a freshly built entry. Resolve `label` using the existing title logic rather than reinventing it: `resolveTabTitle` is exported from `@superset/panes`, and per-pane titles come from `pane.titleOverride ?? registry[pane.kind]?.getTitle?.(pane)` — the same expression used in `packages/panes/src/react/components/Workspace/utils/resolveTabTitle.ts:23`. Fall back to the pane kind, then to the pane id, so the label is never empty.

Also record on mount, so that opening a workspace immediately registers whatever pane it is showing.

Separately, add pruning at the dashboard level, where every workspace's persisted layout is visible. Add a hook `usePrunePaneMru` under `apps/desktop/src/renderer/routes/_authenticated/_dashboard/hooks/usePrunePaneMru/` and call it from `apps/desktop/src/renderer/routes/_authenticated/_dashboard/layout.tsx`. It runs a live query over the whole `v2WorkspaceLocalState` collection, and — **only when that query reports `isReady`** — builds the `openKeysByWorkspace` map by walking each row's `paneLayout.tabs[].panes` and calls `pruneToOpenPanes`. Waiting for `isReady` here is required by the cache-first rule quoted in Context and Orientation: pruning is a write side effect, and running it against a half-loaded collection would silently delete good entries.

This also handles the closed-pane requirement without a separate code path: closing a pane removes it from the workspace's `paneLayout`, the live query re-fires, and the prune drops it.

Acceptance for this milestone:

    bun test apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useRecordPaneMru
    bun run typecheck
    # Expected: tests pass, no type errors

Then, manually:

    bun dev
    # In the running app: open a workspace, click a chat pane, then a terminal pane.
    # Open the renderer devtools console and run:
    #   JSON.parse(localStorage.getItem("pane-mru-storage")).state.entries.map(e => e.label)
    # Expected: the terminal pane's label first, the chat pane's second.
    # Close the terminal pane; re-run the same expression.
    # Expected: the terminal entry is gone, the chat entry remains.

Verify before proceeding: the persisted array reorders on focus and shrinks on close. If it does not shrink, check whether the prune hook is bailing on `isReady` — that is the expected failure mode and it is safe, just inert.

### Milestone 3: cycling, the overlay, and commit on release

This milestone contains the only genuinely stateful logic in the plan, so it is described precisely.

Add a hook `usePaneMruSwitcher` under `apps/desktop/src/renderer/routes/_authenticated/_dashboard/hooks/usePaneMruSwitcher/`, called from `apps/desktop/src/renderer/routes/_authenticated/_dashboard/layout.tsx` so it is live regardless of which workspace is open.

It owns a small piece of React state describing an in-progress cycle: `null` when idle, otherwise `{ frozenEntries: PaneMruEntry[]; selectedIndex: number }`. The word *frozen* is load-bearing: the candidate list is snapshotted when the cycle begins and must not be re-derived from the store while the user is still holding `Ctrl`, or the list would reorder underneath the highlight the moment anything else touches the store.

`useHotkey("NEXT_TAB_ALT", …)` advances the cycle. If idle, snapshot the current MRU entries into `frozenEntries` and set `selectedIndex` to 1 (index 0 is the pane you are already on, so the first tap must land on the *previous* one — this is what makes a single tap toggle between the two most recent panes). If already cycling, increment `selectedIndex` modulo `frozenEntries.length`.

`useHotkey("PREV_TAB_ALT", …)` does the same but decrements, wrapping to the end. Starting a cycle with `Ctrl+Shift+Tab` from idle selects the last entry.

If `frozenEntries.length < 2` both handlers do nothing at all — no cycle starts and no overlay appears, since there is nowhere to switch to.

Commit happens on `Ctrl` release. Register a `keyup` listener on `window` while a cycle is active, and commit when `event.key === "Control"`. Also commit on `window` `blur` and on `Escape`; `blur` matters because releasing `Ctrl` while the OS has taken focus (a Spotlight or app-switcher overlay) would otherwise leave the cycle stuck open. Treat `Escape` as *cancel*: close the overlay and activate nothing.

Committing means: take `frozenEntries[selectedIndex]`, clear the cycle state, and activate that entry. Activation is implemented in Milestone 4; for this milestone, implement the in-workspace half — if the entry's `workspaceId` equals the currently-routed workspace id, call `setActiveTab(entry.tabId)` then `setActivePane({ tabId: entry.tabId, paneId: entry.paneId })` on the mounted store. If it belongs to another workspace, call `navigateToV2Workspace(entry.workspaceId, navigate)` and leave exact pane targeting to Milestone 4.

Because the mounted workspace's store is not reachable from the dashboard layout, expose it through the same intent mechanism Milestone 4 introduces; the simplest sequencing is to build the intent store first (it is ten lines) and use it for both the same-workspace and cross-workspace cases, which keeps one activation path rather than two. Do that rather than special-casing the current workspace.

Delete the now-dead positional bodies of `PREV_TAB_ALT` and `NEXT_TAB_ALT` in `useWorkspaceHotkeys` (`v2-workspace/$workspaceId/hooks/useWorkspaceHotkeys/useWorkspaceHotkeys.ts:163-178`). Leave `PREV_TAB` and `NEXT_TAB` above them untouched. Update the two registry labels in `apps/desktop/src/renderer/hotkeys/registry.ts` from `"Previous Tab (Alt)"` / `"Next Tab (Alt)"` to `"Previous Recent Pane"` / `"Next Recent Pane"`, and give each a `description` (for example, `"Cycle backwards through recently used panes"`), because those strings are what users see in the keyboard settings screen and "Alt" no longer describes what they do.

Build the overlay as `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/PaneMruSwitcher/` with `PaneMruSwitcher.tsx`, `index.ts`, and a co-located test. Render it from the dashboard layout, driven by the hook's cycle state. Use the shadcn `Dialog` from `@superset/ui` with the built-in close affordances disabled — the overlay is driven entirely by the modifier key, so it must not be dismissible by clicking outside or by the default close button, and it must not steal focus from the pane underneath. Each row shows the pane kind icon, the pane label, and the workspace name as secondary text; the row at `selectedIndex` is visually highlighted. Cap the rendered list at the first 10 entries plus a "+N more" affordance, so the overlay stays a fixed size.

Acceptance for this milestone:

    bun test apps/desktop/src/renderer/routes/_authenticated/_dashboard/hooks/usePaneMruSwitcher
    bun run typecheck
    bun run lint
    # Expected: tests pass, no type errors, no lint output

Then, manually, with one workspace containing at least three panes:

    bun dev
    # Click pane A, then pane B, then pane C.
    # Press and release Ctrl+Tab once.
    # Expected: focus lands on pane B (the previously used pane), not pane A and not the tab to the right.
    # Press and release Ctrl+Tab again.
    # Expected: focus returns to pane C. Repeated single taps toggle B and C.
    # Hold Ctrl and tap Tab twice, then release.
    # Expected: the overlay is visible while Ctrl is held, the highlight moves on each tap,
    #           and on release focus lands on pane A.
    # Hold Ctrl, tap Tab, press Escape, release Ctrl.
    # Expected: overlay closes and focus has not moved.

Verify before proceeding: single-tap toggling works, which is the single most-used path, and no key press leaves the overlay stuck on screen.

### Milestone 4: cross-workspace activation

Add an intent store at `apps/desktop/src/renderer/stores/pane-focus-intent.ts`, modeled on `apps/desktop/src/renderer/stores/right-sidebar-toggle-intent.ts`. It holds `{ tick: number; target: { workspaceId: string; tabId: string; paneId: string } | null }` plus `request(target)` (which sets the target and increments `tick`) and `clear()`. This store is deliberately *not* persisted: a pending focus request is meaningless after a restart.

The `tick` counter matters. Requesting the same target twice in a row must still fire, and a listener that only watched `target` would see no change and do nothing. Subscribers therefore compare `tick`, exactly as the right-sidebar intent consumer does at `useWorkspaceHotkeys.ts:51-57`.

Change the commit path from Milestone 3 to always call `request(target)`, then — only when the target workspace differs from the current route — also call `navigateToV2Workspace(entry.workspaceId, navigate)` and `revealWorkspace(entry.workspaceId)` so a collapsed sidebar group containing the target is expanded. `revealWorkspace` currently lives inside `useDashboardSidebarShortcuts`; extract it into a shared hook under `.../DashboardSidebar/hooks/useRevealWorkspace/` and have both callers use it, rather than duplicating the logic.

Consume the intent inside the v2 workspace route: add a hook `useApplyPaneFocusIntent` under `v2-workspace/$workspaceId/hooks/useApplyPaneFocusIntent/`, called alongside `useWorkspaceHotkeys`. It subscribes to the intent store and, when `tick` changes and `target.workspaceId` matches this route's workspace id, calls `setActiveTab` and `setActivePane` on the store, then `clear()`.

The ordering subtlety to get right: when the target is in another workspace, the intent is requested *before* that workspace's route has mounted, so nothing consumes it immediately. This is why the target is stored rather than only signalled by a counter — the newly-mounted route reads the pending target on mount and applies it. Implement the consumer to check for a pending target on mount as well as on subsequent `tick` changes.

Guard against a stale intent surviving forever: `useApplyPaneFocusIntent` should `clear()` any pending target whose `workspaceId` matches this route but whose `tabId`/`paneId` no longer exist, so a pane closed between request and mount does not leave the intent permanently pending.

Acceptance for this milestone:

    bun test apps/desktop/src/renderer/stores/pane-focus-intent.test.ts
    bun run typecheck
    bun run lint
    # Expected: tests pass, no type errors, no lint output

Then, manually, with two workspaces open:

    bun dev
    # In workspace 1, focus a chat pane. Switch to workspace 2 via the sidebar, focus a terminal pane.
    # Hold Ctrl, tap Tab until the workspace-1 chat pane is highlighted, release.
    # Expected: the app navigates to workspace 1 AND lands on that exact chat pane —
    #           not merely on whatever tab workspace 1 was last showing.
    # If workspace 1 sits inside a collapsed sidebar group, that group expands.

## Concrete Steps

All commands run from the repository root unless stated otherwise. The package manager is Bun; do not use npm, yarn, or pnpm.

    bun install
    # Expected: dependencies resolve; no changes needed if the tree is already installed.

Run the focused tests for whichever milestone is in progress:

    bun test apps/desktop/src/renderer/stores/pane-mru
    # Expected transcript shape:
    #  <n> pass
    #  0 fail

Run the full validation set before pushing:

    bun run lint:fix
    bun run lint
    # Expected: no output from `lint`. Note that CI treats Biome *warnings* as
    # errors, so any output at all is a failure — see root AGENTS.md rule 7.

    bun run typecheck
    # Expected: no errors.

    bun test
    # Expected: all suites pass.

Start the app for manual verification:

    bun dev
    # The Electron desktop window opens. Sign in if prompted.

## Validation and Acceptance

The feature is accepted when a person can perform the following walkthrough in a `bun dev` build and observe each stated result.

Open two workspaces from the sidebar. In the first, open a Claude Code chat pane and split it so a terminal pane sits beside it in the same tab. In the second workspace, open a chat pane. Click, in order: workspace 1's chat pane, workspace 1's terminal pane, workspace 2's chat pane.

Press and release `Ctrl+Tab` once. Focus returns to workspace 1's terminal pane — the previously used pane — and the app navigates back to workspace 1 to do it. Press and release `Ctrl+Tab` again: focus returns to workspace 2's chat pane. Repeating single taps flips between exactly these two panes, which is the core requested behavior.

Hold `Ctrl` down and tap `Tab` three times without releasing. An overlay is visible for the whole time `Ctrl` is held, listing the panes newest-first with each pane's label and its workspace name, and the highlight advances on each tap. Release `Ctrl`: focus lands on the highlighted pane, and that pane is now at the front of the list, so an immediate `Ctrl+Tab` takes you back where you came from.

Hold `Ctrl`, tap `Tab` once, press `Escape`, then release `Ctrl`. The overlay closes and focus has not moved.

Hold `Ctrl` and tap `Shift+Tab`. The selection moves in the opposite direction, wrapping to the end of the list from the start.

Close workspace 1's terminal pane, then hold `Ctrl` and tap `Tab`. The closed pane does not appear anywhere in the overlay.

Quit the app entirely and reopen it. Hold `Ctrl` and tap `Tab`. The overlay shows the same recency order as before the restart, minus any pane that no longer exists.

Finally, confirm the settings screen: open Settings → Keyboard and find the two entries. They read "Previous Recent Pane" and "Next Recent Pane" with their `Ctrl+Shift+Tab` and `Ctrl+Tab` bindings, and the separate `PREV_TAB` / `NEXT_TAB` entries still show `⌘⌥←` / `⌘⌥→` and still perform positional tab cycling.

Then verify the escape hatch, since it is what stands in for the toggle #5425 asked for. Rebind "Next Recent Pane" to some other chord and rebind `NEXT_TAB` to `Ctrl+Tab`. The conflict detector warns when the new binding collides with an existing one, and afterwards `Ctrl+Tab` performs positional cycling again. This confirms a user who prefers the old behavior on that key can restore it without a code change.

Automated validation, all expected to pass with no output:

    bun run lint
    bun run typecheck
    bun test

## Idempotence and Recovery

Every step in this plan is safe to repeat. The commands are read-only or idempotent builds; no step touches a database, and no migration is involved.

The one piece of durable state this feature creates is the `localStorage` key `pane-mru-storage` in the renderer. If it becomes corrupt during development — for instance after changing the entry shape without bumping the persist `version` — recovery is to clear that single key from the renderer devtools console:

    localStorage.removeItem("pane-mru-storage")

and reload the window. The app treats a missing MRU list as an empty list and rebuilds it as panes are focused, so nothing else is affected. For the same reason, if the entry shape changes after this ships, bump the persist `version` and supply a `migrate` that returns an empty `entries` array; discarding recency history is an acceptable one-time cost and is far safer than migrating a shape whose only value is convenience.

Rolling the feature back is a matter of restoring the positional bodies of `PREV_TAB_ALT` and `NEXT_TAB_ALT` in `useWorkspaceHotkeys` and not rendering the overlay; the MRU store can stay in place harmlessly, since nothing else reads it.

## Artifacts and Notes

The existing positional handler being replaced, for reference when diffing (`apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useWorkspaceHotkeys/useWorkspaceHotkeys.ts:171-178`):

    useHotkey("NEXT_TAB_ALT", () => {
        const state = store.getState();
        if (!state.activeTabId || state.tabs.length === 0) return;
        const index = state.tabs.findIndex((t) => t.id === state.activeTabId);
        const nextIndex =
            index >= state.tabs.length - 1 || index === -1 ? 0 : index + 1;
        state.setActiveTab(state.tabs[nextIndex].id);
    });

The intent-consumer pattern this plan reuses, from the same file (lines 51-57) — note the `tick` comparison, which is what makes a repeated identical request fire again:

    useEffect(
        () =>
            useRightSidebarToggleIntent.subscribe((state, prev) => {
                if (state.tick !== prev.tick) setRightSidebarOpen((open) => !open);
            }),
        [setRightSidebarOpen],
    );

## Interfaces and Dependencies

No new third-party dependencies. Everything needed is already in the tree: `zustand` and its `persist`/`devtools` middleware, `react-hotkeys-hook` behind the existing `useHotkey` wrapper, `@superset/panes` for the pane model, `@superset/ui` for the shadcn `Dialog` and `Kbd` components, and `@tanstack/react-db` for the live query used in pruning.

This is renderer-only work, so no tRPC procedure and no Electron IPC channel is added. (For context, the desktop app's rule from `apps/desktop/AGENTS.md` is that inter-process communication always goes through tRPC in `src/lib/trpc` — that rule simply does not apply here, since nothing crosses the process boundary.)

The following must exist at the end of the work.

In `apps/desktop/src/renderer/stores/pane-mru/`:

    export interface PaneMruEntry {
        workspaceId: string;
        tabId: string;
        paneId: string;
        kind: string;
        label: string;
        workspaceName: string;
        lastFocusedAt: number;
    }

    export function recordFocus(args: {
        entries: PaneMruEntry[];
        entry: PaneMruEntry;
    }): PaneMruEntry[];

    export function removeEntries(args: {
        entries: PaneMruEntry[];
        keys: Set<string>;
    }): PaneMruEntry[];

    export function pruneToOpenPanes(args: {
        entries: PaneMruEntry[];
        openKeysByWorkspace: Map<string, Set<string>>;
    }): PaneMruEntry[];

    export const usePaneMruStore: UseBoundStore<StoreApi<PaneMruState>>;

Note the object-parameter style: the root `AGENTS.md` requires functions taking two or more parameters to use a single object argument.

In `apps/desktop/src/renderer/stores/pane-focus-intent.ts`:

    export interface PaneFocusTarget {
        workspaceId: string;
        tabId: string;
        paneId: string;
    }

    export const usePaneFocusIntent: UseBoundStore<StoreApi<{
        tick: number;
        target: PaneFocusTarget | null;
        request: (target: PaneFocusTarget) => void;
        clear: () => void;
    }>>;

Hooks, each in its own folder with an `index.ts` barrel and a co-located test where it has logic worth testing:

    // v2-workspace/$workspaceId/hooks/useRecordPaneMru/
    export function useRecordPaneMru(args: {
        store: StoreApi<WorkspaceStore<PaneViewerData>>;
        workspaceId: string;
        workspaceName: string;
        paneRegistry: PaneRegistry<PaneViewerData>;
    }): void;

    // v2-workspace/$workspaceId/hooks/useApplyPaneFocusIntent/
    export function useApplyPaneFocusIntent(args: {
        store: StoreApi<WorkspaceStore<PaneViewerData>>;
        workspaceId: string;
    }): void;

    // _dashboard/hooks/usePrunePaneMru/
    export function usePrunePaneMru(): void;

    // _dashboard/hooks/usePaneMruSwitcher/
    export function usePaneMruSwitcher(): {
        cycle: { frozenEntries: PaneMruEntry[]; selectedIndex: number } | null;
    };

And the overlay component at `_dashboard/components/PaneMruSwitcher/PaneMruSwitcher.tsx`, taking the `cycle` value above as its prop and rendering nothing when it is `null`.

Type safety rules from the root `AGENTS.md` apply throughout: no `any`, no `as any`, no `@ts-ignore`, and no empty catch blocks. Where a persisted `paneLayout` must be read from the collection as `WorkspaceState<unknown>`, narrow it with the existing `sanitizePaneLayout` helper from `apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema.ts` rather than casting.

---

**Revision note (2026-07-28, initial draft):** First version of this plan. Scope was narrowed to the v2 workspace implementation only, and entries were defined at pane rather than tab granularity, both at the requester's direction during planning — recorded in the Decision Log. The four-milestone split follows from the architectural constraint discovered during research: v2 pane stores are created and destroyed per route, so a cross-workspace switcher needs both a store that outlives them (Milestone 1) and an intent mechanism to reach a workspace that is not yet mounted (Milestone 4).

**Revision note (2026-07-28, issue-tracker pass):** Searched the tracker for prior requests after drafting. Found #5425, which asks for this feature as a *toggle*, and found that the v1 tabs store already keeps a per-workspace `tabHistoryStacks` MRU list that is worth reading before writing Milestone 1. Both recorded in Surprises & Discoveries. Nothing else in the plan changed, since the triage note on #5425 independently reached the same technical conclusions this plan did.

**Revision note (2026-07-28, binding decision):** Audited every bound chord in the registry to see whether MRU should get a new key instead of taking `Ctrl+Tab`. Only `ctrl+backquote` / `ctrl+shift+backquote` were both free and hold-friendly; every other candidate collides with an OS shortcut or with terminal readline bindings. The requester chose to keep `Ctrl+Tab` and change its behavior, and chose not to add a mode preference on top of the registry's existing rebinding support. All scope questions bearing on the code are now closed, and the Plan of Work is unchanged from the first draft — the audit confirmed the original approach rather than redirecting it. The one remaining open item (a non-keyboard way to open the switcher) does not block implementation.
