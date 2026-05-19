---
roadmap: 1
project: Justin Cycle 28 — Chat UI, Automations & Reliability
generated: 2026-05-19T00:00:00Z
prd: .spec/prd/README.md
sprint_count: 10
pr_sequencing: true
base_branch: justinrich-chatbugs
sprint_branch_convention: "justinrich-chatbugs-{NN}-{slug}"
---

# Sprint Roadmap: Justin Cycle 28 — Chat UI, Automations & Reliability

## Overview

**Sprints:** 10
**Total Tasks:** 32
**Current Sprint:** None (all 🔵 Planned)
**One-to-one mapping:** Each sprint corresponds to exactly one Linear ticket and ships as exactly one PR. This was an explicit user constraint — team members will see one PR per individual issue rather than batched work, so each ticket gets its own review surface and its own merge moment.

> **PR sequencing enabled.** Lifecycle: 🔵 Planned → 🟠 In flight → 🟣 In review → ✅ Completed → 🔴 Blocked. PR cell required for Completed status. See [`~/Projects/brain/docs/PR-SEQUENCING.md`](~/Projects/brain/docs/PR-SEQUENCING.md) for the full convention.

**Base branch:** `justinrich-chatbugs` (this branch — carries PRD + roadmap)
**Sprint branches:** `justinrich-chatbugs-{NN}-{slug}` (cut off `main`, NOT off this base branch — PRD/roadmap stays here as the planning record, each sprint branches independently from `main` so it can merge in any order)

## Sprint Sequence

| # | Sprint | Gate | Tasks | Dependencies | Status | Linear | Branch | PR |
|---|--------|------|-------|--------------|--------|--------|--------|----|
| 1 | [Sprint 01: Chat transport + state architecture doc](#sprint-01-chat-transport-arch) | Canonical v2-chat architecture doc exists, reconciles the three plan drafts, and defines ChatEvent + watch contracts | 3 | — | 🔵 Planned | [SUPER-751](https://linear.app/superset-sh/issue/SUPER-751) | `justinrich-chatbugs-01-chat-transport-arch` | — |
| 2 | [Sprint 02: Streaming chat start flow](#sprint-02-chat-start-flow-stream) | A new chat session's first assistant message renders once with no flicker or duplicate | 5 | Sprint 01 | 🔵 Planned | [SUPER-753](https://linear.app/superset-sh/issue/SUPER-753) | `justinrich-chatbugs-02-chat-start-flow-stream` | — |
| 3 | [Sprint 03: Canonical builtin slash commands](#sprint-03-builtin-slash-commands) | `/login` either drives real provider-auth or is gone, and every builtin's description matches its action | 3 | — | 🔵 Planned | [SUPER-754](https://linear.app/superset-sh/issue/SUPER-754) | `justinrich-chatbugs-03-builtin-slash-commands` | — |
| 4 | [Sprint 04: Composer settings menu](#sprint-04-composer-settings-menu) | The v2 chat composer footer shows one settings trigger that contains model + permission + thinking | 2 | — | 🔵 Planned | [SUPER-755](https://linear.app/superset-sh/issue/SUPER-755) | `justinrich-chatbugs-04-composer-settings-menu` | — |
| 5 | [Sprint 05: Loud automation failures](#sprint-05-auto-loud-failures) | A failed automation pops a notification and surfaces its full error string in Previous Runs | 4 | — | 🔵 Planned | [SUPER-771](https://linear.app/superset-sh/issue/SUPER-771) | `justinrich-chatbugs-05-auto-loud-failures` | — |
| 6 | [Sprint 06: "New workspace" automation target](#sprint-06-auto-new-workspace) | An automation with target "New workspace" actually spins up a clean workspace at dispatch | 4 | — | 🔵 Planned | [SUPER-783](https://linear.app/superset-sh/issue/SUPER-783) | `justinrich-chatbugs-06-auto-new-workspace` | — |
| 7 | [Sprint 07: Host service auth refresh](#sprint-07-host-auth-refresh) | The host service stays connected past the 1-hour OAuth expiry and surfaces a clear status when refresh fails | 4 | — | 🔵 Planned | [SUPER-752](https://linear.app/superset-sh/issue/SUPER-752) | `justinrich-chatbugs-07-host-auth-refresh` | — |
| 8 | [Sprint 08: Cross-device CLI login](#sprint-08-cli-cross-device-login) | `superset auth login` over SSH presents only the paste flow without trying to open a browser | 3 | — | 🔵 Planned | [SUPER-750](https://linear.app/superset-sh/issue/SUPER-750) | `justinrich-chatbugs-08-cli-cross-device-login` | — |
| 9 | [Sprint 09: Browser-pane Cmd+W](#sprint-09-browser-pane-cmd-w) | Pressing Cmd+W in a focused browser pane closes only that pane, not the whole window | 2 | — | 🔵 Planned | [SUPER-794](https://linear.app/superset-sh/issue/SUPER-794) | `justinrich-chatbugs-09-browser-pane-cmd-w` | — |
| 10 | [Sprint 10: Diff viewer line numbers](#sprint-10-diff-viewer-line-numbers) | Diff-viewer line numbers render sequentially within every hunk on both gutters | 2 | — | 🔵 Planned | [SUPER-804](https://linear.app/superset-sh/issue/SUPER-804) | `justinrich-chatbugs-10-diff-viewer-line-numbers` | — |

**Coverage:** 10 sprints / 10 UCs / 10 Linear tickets — 100%

---

## Per-Sprint Details

### Sprint 01: Chat transport + state architecture doc

**Sequence:** 1
**Timeline:** Phase 1
**Status:** 🔵 Planned
**Branch:** `justinrich-chatbugs-01-chat-transport-arch`
**PR:** —
**Linear:** [SUPER-751](https://linear.app/superset-sh/issue/SUPER-751)

#### Human Testing Gate

**Gate:** A reviewer can open `plans/chat-v2-architecture.md` (the new canonical doc) and find the full `ChatEvent` protocol, `applyEvent` / `replayEvents` semantics, and `workspace.watch` + `session.watch` subscription contracts, with the three legacy plan drafts marked superseded.

**Test Steps:**

1. Open `plans/chat-v2-architecture.md` in GitHub markdown preview (or your editor of choice) — confirm the doc opens, has a clear title, and is dated.
2. Skim the **ChatEvent Protocol** section — confirm the event shape is fully defined with field names and a note that the shape is identical across local host-service and cloud worker runtimes.
3. Skim the **Replay & State** section — confirm `applyEvent` and `replayEvents(sessionId, fromSeq, toSeq)` are both specified.
4. Skim the **Subscriptions** section — confirm `workspace.watch` and `session.watch` contracts are present.
5. Open `plans/v2-chat-greenfield-architecture.md`, `plans/host-service-chat-architecture.md`, and `plans/chat-mastra-rebuild-execplan.md` — each must either be deleted, archived under `plans/superseded/`, or carry a banner at the top pointing to `chat-v2-architecture.md` as the canonical replacement.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| CHAT-ARCH-001 | Read the three existing plan drafts and produce a divergence matrix (what each says vs. the others) | engineering-manager | 90 min |
| CHAT-ARCH-002 | Author the canonical `plans/chat-v2-architecture.md` reconciling transport + state across local and cloud runtimes | engineering-manager | 240 min |
| CHAT-ARCH-003 | Mark / archive / delete the three superseded plan drafts and update `plans/` index if one exists | engineering-manager | 30 min |

#### Dependencies

- Blocks: Sprint 02 (streaming start flow consumes this protocol)
- Dependent on: None

#### PRD Coverage

- [UC-CHAT-01](./04-uc-chat.md#uc-chat-01--reconcile-the-v2-chat-transport--state-architecture-into-a-single-canonical-design)

---

### Sprint 02: Streaming chat start flow

**Sequence:** 2
**Timeline:** Phase 1
**Status:** 🔵 Planned
**Branch:** `justinrich-chatbugs-02-chat-start-flow-stream`
**PR:** —
**Linear:** [SUPER-753](https://linear.app/superset-sh/issue/SUPER-753)

#### Human Testing Gate

**Gate:** A user can start a new chat session and send their first message — the assistant's reply renders exactly once with no flicker and no duplicated copy in the pane.

**Test Steps:**

1. Launch the Superset desktop app and open a v2 workspace.
2. Click **+ New Chat** in the chat pane.
3. Type any prompt (e.g., "hello — what can you do?") and press Enter.
4. Watch the assistant area as the response streams — confirm no flicker, no message bouncing in and out, and no duplicated assistant bubble at any point during the stream.
5. Scroll back through the session history — confirm exactly one assistant message exists for that first turn.
6. Repeat steps 2-5 once more in the same workspace to confirm the second new-session start also renders cleanly.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| CHAT-STREAM-001 | Implement the `session.watch` tRPC subscription using the observable pattern in `packages/chat/src/server` | engineering-manager | 180 min |
| CHAT-STREAM-002 | Build the client-side reducer in `use-chat-display.ts` that folds `ChatEvent`s into rendered state | engineering-manager | 180 min |
| CHAT-STREAM-003 | Delete `withoutActiveTurnAssistantHistory()` and the optimistic-user-message reconciliation `useEffect` from `use-chat-display.ts` | engineering-manager | 45 min |
| CHAT-STREAM-004 | Establish the chat session id before the first user-message send so there's no "session still starting" gap | engineering-manager | 60 min |
| CHAT-STREAM-005 | Add a regression test verifying a new session's first assistant message renders exactly once | engineering-manager | 60 min |

#### Dependencies

- Blocks: None (downstream chat features can target the new stream once landed)
- Dependent on: Sprint 01 (uses the `ChatEvent` protocol + `session.watch` shape defined there)

#### PRD Coverage

- [UC-CHAT-04](./04-uc-chat.md#uc-chat-04--stream-new-chat-sessions-without-flicker-or-duplicated-assistant-messages)

---

### Sprint 03: Canonical builtin slash commands

**Sequence:** 3
**Timeline:** Phase 1
**Status:** 🔵 Planned
**Branch:** `justinrich-chatbugs-03-builtin-slash-commands`
**PR:** —
**Linear:** [SUPER-754](https://linear.app/superset-sh/issue/SUPER-754)

#### Human Testing Gate

**Gate:** A user typing `/` in the chat composer sees the approved canonical builtin list — `/login` either opens a real provider-auth flow or no longer exists, and every remaining command's description matches its actual behavior.

**Test Steps:**

1. Launch the Superset desktop app and open any chat pane.
2. Type `/` in the composer and confirm the `SlashCommandMenu` shows the approved canonical builtin list (no orphaned or removed commands).
3. Hover each builtin and read the description — for every command, the description must match what running it actually does.
4. Run `/login` — confirm it either drives a real provider-auth flow OR no longer appears in the menu (acceptable resolution either way per PRD).
5. Run `/new`, `/stop`, `/model`, and `/mcp` — confirm each does exactly what its description says, with no "Unsupported slash command action" fallback toast.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| SLASH-001 | Decide the canonical builtin set (action commands vs prompt-template commands) and record the decision in `packages/chat/docs/` or the architecture doc | engineering-manager | 60 min |
| SLASH-002 | Fix `/login` — implement a real provider-auth flow or remove the alias from `BUILTIN_COMMANDS` and `useSlashCommandExecutor` | engineering-manager | 150 min |
| SLASH-003 | Audit each remaining builtin's action wiring and description copy in `builtins.ts` + `useSlashCommandExecutor.ts` | engineering-manager | 90 min |

#### Dependencies

- Blocks: None
- Dependent on: None

#### PRD Coverage

- [UC-CHAT-02](./04-uc-chat.md#uc-chat-02--decide-and-implement-the-canonical-builtin-slash-command-set)

---

### Sprint 04: Composer settings menu

**Sequence:** 4
**Timeline:** Phase 1
**Status:** 🔵 Planned
**Branch:** `justinrich-chatbugs-04-composer-settings-menu`
**PR:** —
**Linear:** [SUPER-755](https://linear.app/superset-sh/issue/SUPER-755)

#### Human Testing Gate

**Gate:** A user looking at the v2 chat composer sees one consolidated settings trigger that opens a menu containing model picker, permission mode, and thinking level as grouped sections.

**Test Steps:**

1. Launch the Superset desktop app and open a v2 workspace's chat pane.
2. Confirm the composer footer shows **exactly one** settings trigger button (not three sibling pills).
3. Confirm the trigger displays the active model name (and the active permission mode when meaningful) at a glance without opening the menu.
4. Click the trigger — confirm the popover contains all three controls (model picker, permission mode, thinking level) as visually grouped sections.
5. Change the model from inside the menu — confirm the change persists and the trigger label updates to the new model.
6. Change the permission mode and the thinking level from inside the menu — confirm both apply and persist.
7. Close and reopen the chat pane — confirm all three settings are remembered and the consolidated trigger still renders them correctly.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| COMP-MENU-001 | Build the `ChatComposerSettingsMenu` trigger + popover composing existing `ModelPicker`, `PermissionModePicker`, `ThinkingToggle` as menu sections | frontend-designer | 180 min |
| COMP-MENU-002 | Replace the three sibling pills in `ChatComposerControls.tsx` with the new consolidated trigger and verify nested-popover focus / dismiss behavior | frontend-designer | 90 min |

#### Dependencies

- Blocks: None
- Dependent on: None

#### PRD Coverage

- [UC-CHAT-03](./04-uc-chat.md#uc-chat-03--collapse-the-chat-composers-model-settings-controls-into-one-menu)

---

### Sprint 05: Loud automation failures

**Sequence:** 5
**Timeline:** Phase 1
**Status:** 🔵 Planned
**Branch:** `justinrich-chatbugs-05-auto-loud-failures`
**PR:** —
**Linear:** [SUPER-771](https://linear.app/superset-sh/issue/SUPER-771)

#### Human Testing Gate

**Gate:** An automation operator triggers a failing automation and sees both a popup / notification and the full underlying error string in the Previous Runs list — no silent failure path remains.

**Test Steps:**

1. Launch the Superset desktop app and open Automations.
2. Configure an automation that will fail — easiest path: pick a host that's currently offline (host-service stopped) and dispatch the automation.
3. After dispatch, confirm a popup or system notification appears announcing the automation failed (it must be visible without opening Automations).
4. Open the automation's **Previous Runs** list — confirm the failed run row shows the full underlying error string (e.g., the real `RelayDispatchError` text), not a clipped tooltip.
5. Right-click or use a copy affordance on the error row — confirm the full error string can be copied to clipboard for sharing.
6. Repeat with a different failure class (e.g., point at a project the host can't reach) — confirm the new failure class also surfaces loudly with its own distinct error text.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| AUTO-LOUD-001 | Stop clipping `describeError(err, "dispatch")` in the runs row — surface the full error string from `dispatch.ts` through to the run record | engineering-manager | 90 min |
| AUTO-LOUD-002 | Replace the clipped-tooltip affordance in `PreviousRunsList.tsx` with a non-clipped error reason display that supports long messages + copy-to-clipboard | frontend-designer | 120 min |
| AUTO-LOUD-003 | Wire a popup / system notification path that fires when an automation transitions to `failed` status, with the failure reason in the notification body | engineering-manager | 90 min |
| AUTO-LOUD-004 | Add an integration test in `packages/trpc/src/router/automation` that injects a `RelayDispatchError` and asserts the full message ends up on the run row | engineering-manager | 60 min |

#### Dependencies

- Blocks: None
- Dependent on: None

#### PRD Coverage

- [UC-AUTO-01](./05-uc-auto.md#uc-auto-01--surface-automation-run-failures-with-full-legible-error-messages)

---

### Sprint 06: "New workspace" automation target

**Sequence:** 6
**Timeline:** Phase 1
**Status:** 🔵 Planned
**Branch:** `justinrich-chatbugs-06-auto-new-workspace`
**PR:** —
**Linear:** [SUPER-783](https://linear.app/superset-sh/issue/SUPER-783)

#### Human Testing Gate

**Gate:** An automation operator saves an automation with target "New workspace" and dispatches it — a clean workspace is spun up on the host, the agent starts inside it, and a failure path shows a legible reason on the run row when something goes wrong.

**Test Steps:**

1. Launch the Superset desktop app and open Automations → **Create Automation**.
2. Open the workspace picker — confirm **"New workspace"** appears at the top of the list and is selectable, even when no existing workspaces match the current filter.
3. Pick "New workspace", pick a project, and save the automation.
4. Manually dispatch the automation (or wait for its scheduled trigger).
5. Open the host's workspaces panel — confirm a new workspace with an `automation-<timestamp>` style name appears and the agent has started inside it.
6. Force a failure path (e.g., point at an unreachable project or stop the host mid-dispatch) and dispatch again — confirm the Previous Runs row shows a legible reason (relay timeout / project missing / etc.), not a silent no-op.
7. Try to save an automation with target "New workspace" but no project selected — confirm the dialog refuses to save with a clear validation message.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| AUTO-NEW-001 | Reproduce the failure against a real run, capture the actual error class (relay timeout vs missing `v2ProjectId`), and pin the root cause | engineering-manager | 120 min |
| AUTO-NEW-002 | Fix the root cause — either harden the `workspaces.create` relay path or tighten the `createAutomationSchema .refine` to require `v2ProjectId` when `v2WorkspaceId` is null | engineering-manager | 180 min |
| AUTO-NEW-003 | Keep the `__new__` `CommandItem` in `WorkspacePicker` reachable on the primary (no-search) path so it isn't filtered out by `CommandInput` | frontend-designer | 60 min |
| AUTO-NEW-004 | Add an integration test in `packages/trpc/src/router/automation/dispatch` covering the null-`v2WorkspaceId` path end-to-end against a stubbed host relay | engineering-manager | 90 min |

#### Dependencies

- Blocks: None
- Dependent on: None (independent of Sprint 05, though both touch the runs surface — coordinate merge order to avoid conflicts in `PreviousRunsList.tsx`)

#### PRD Coverage

- [UC-AUTO-02](./05-uc-auto.md#uc-auto-02--run-automations-against-a-freshly-created-workspace-when-the-target-is-new-workspace)

---

### Sprint 07: Host service auth refresh

**Sequence:** 7
**Timeline:** Phase 1
**Status:** 🔵 Planned
**Branch:** `justinrich-chatbugs-07-host-auth-refresh`
**PR:** —
**Linear:** [SUPER-752](https://linear.app/superset-sh/issue/SUPER-752)

#### Human Testing Gate

**Gate:** A user can leave the Superset desktop app open past the 1-hour OAuth expiry and continue using chat / automations / browser panes without the host service silently 401-ing — and `superset start` refuses to launch when no valid session exists.

**Test Steps:**

1. Launch the Superset desktop app and sign in normally — confirm the host service is running and the relay tunnel is connected (green status indicator or equivalent).
2. Leave the app running, untouched, for at least 65 minutes (past the OAuth access-token TTL).
3. Return to the app and send a chat message OR run an automation — confirm it succeeds end-to-end (no 401, no silent failure, no stale-session error).
4. Manually revoke or expire the refresh token (via cloud admin tooling or by editing the local creds file), then send another chat message — confirm a clear, copyable status message appears: "Superset session expired — run `superset auth login`".
5. From a fresh terminal, sign out (`superset auth logout` or equivalent) and then run `superset start` — confirm the CLI refuses to spawn the host service and prints "Run: superset auth login".

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| HOST-AUTH-001 | Replace the frozen `AUTH_TOKEN` env-var snapshot in `packages/cli/src/lib/host/spawn.ts` with a refreshable credential path (refresh token or CLI config pointer) | engineering-manager | 150 min |
| HOST-AUTH-002 | Make `JwtApiAuthProvider.getSessionToken` actually rotate by calling the same `refreshAccessToken` logic `resolve-auth.ts` already uses (with 5-min leeway) | engineering-manager | 180 min |
| HOST-AUTH-003 | Emit a "Superset session expired" status event (not a crash) when refresh fails — surface in the desktop UI and CLI | engineering-manager | 120 min |
| HOST-AUTH-004 | Gate `superset start` on a valid auth resolution before spawning the host process; refuse to launch with the standard "Run: superset auth login" hint | engineering-manager | 60 min |

#### Dependencies

- Blocks: None
- Dependent on: None (independent of Sprint 08, though both edit `packages/cli/src/lib/auth.ts` and `resolve-auth.ts` — coordinate merge order)

#### PRD Coverage

- [UC-CLI-01](./06-uc-cli.md#uc-cli-01--refresh-and-surface-host-service-auth-across-oauth-token-expiry)

---

### Sprint 08: Cross-device CLI login

**Sequence:** 8
**Timeline:** Phase 1
**Status:** 🔵 Planned
**Branch:** `justinrich-chatbugs-08-cli-cross-device-login`
**PR:** —
**Linear:** [SUPER-750](https://linear.app/superset-sh/issue/SUPER-750)

#### Human Testing Gate

**Gate:** A user running `superset auth login` over SSH (or in any cross-device context) sees only the paste flow — no doomed browser tab opens, no loopback port is bound, and the paste flow is presented as the primary path.

**Test Steps:**

1. SSH into a remote box (e.g., an EC2 instance, a Codespace, or any non-local shell) where you have a Superset CLI install.
2. Run `superset auth login` — confirm no browser opens on either machine and the CLI immediately presents the paste-flow URL with copy clearly explaining the user should open the link and paste the code.
3. Open the printed URL on your local machine in any browser, complete the auth, and paste the `code#state` back into the SSH terminal — confirm auth completes successfully.
4. From the same SSH session, run `lsof -i :PORT` (or equivalent) during step 2 — confirm no loopback port was bound (the CLI did not call `bindLoopbackServer()`).
5. Run `superset auth login --no-browser` from a fully-local terminal — confirm the paste flow is used even though the context would normally trigger loopback.
6. Run `superset auth login` from a fully-local terminal with a normal browser available — confirm the loopback flow still works (no regression for the common case).

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| CLI-LOGIN-001 | Extend `shouldOpenBrowser()` to detect Superset remote-workspace env markers and missing `DISPLAY` on Linux as cross-device contexts | engineering-manager | 90 min |
| CLI-LOGIN-002 | Skip `bindLoopbackServer()` when context is known cross-device and present the paste flow as the primary path with clear Ink / `@clack/prompts` copy | engineering-manager | 120 min |
| CLI-LOGIN-003 | Add an explicit `--no-browser` flag override to `superset auth login` | engineering-manager | 45 min |

#### Dependencies

- Blocks: None
- Dependent on: None (shares files with Sprint 07 — coordinate merge order)

#### PRD Coverage

- [UC-CLI-02](./06-uc-cli.md#uc-cli-02--use-the-paste-flow-exclusively-in-cross-device-superset-auth-login-contexts)

---

### Sprint 09: Browser-pane Cmd+W

**Sequence:** 9
**Timeline:** Phase 1
**Status:** 🔵 Planned
**Branch:** `justinrich-chatbugs-09-browser-pane-cmd-w`
**PR:** —
**Linear:** [SUPER-794](https://linear.app/superset-sh/issue/SUPER-794)

#### Human Testing Gate

**Gate:** A user focused inside a browser pane presses Cmd+W and the browser pane closes — the BrowserWindow stays open and other panes are untouched. Cmd+Shift+Q still closes the window, Cmd+Shift+W still closes the tab.

**Test Steps:**

1. Launch the Superset desktop app and open a v2 workspace with at least two panes — one terminal/chat pane and one browser pane.
2. Click inside the browser pane (give the `<webview>` focus by clicking some empty area of the rendered page).
3. Press **Cmd+W** — confirm only the browser pane closes; the rest of the window, the other panes, and the workspace itself remain intact.
4. Open another browser pane, click into it, and press **Cmd+Shift+Q** — confirm the entire BrowserWindow closes as expected (no regression on the window-close affordance).
5. Reopen the workspace, focus a browser pane, and press **Cmd+Shift+W** — confirm the entire tab closes (no regression on `CLOSE_TAB`).
6. Switch to a v1 workspace, focus a browser pane there, press **Cmd+W** — confirm the v1 close path (`requestPaneClose`) also routes correctly.
7. Drag a browser pane around to trigger a persistent-webview re-parent, then press **Cmd+W** — confirm the listener is re-attached after re-parent and the close still routes to the pane.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| UX-CMDW-001 | Attach a `before-input-event` listener inside `BrowserManager.register(paneId, webContentsId)` that detects Cmd/Ctrl+W, calls `event.preventDefault()`, and emits a per-pane close event — re-attaches on every register call to survive persistent-webview re-parent | engineering-manager | 120 min |
| UX-CMDW-002 | Subscribe to the per-pane close event in `usePersistentWebview` and route to `requestPaneClose` (v1) or `closePane` (v2); preserve the File-menu "Close Window" item (drop only its implicit accelerator) | engineering-manager | 90 min |

#### Dependencies

- Blocks: None
- Dependent on: None

#### PRD Coverage

- [UC-UX-01](./07-uc-ux.md#uc-ux-01--close-the-focused-browser-pane-with-cmdw-instead-of-closing-the-whole-window)

---

### Sprint 10: Diff viewer line numbers

**Sequence:** 10
**Timeline:** Phase 1
**Status:** 🔵 Planned
**Branch:** `justinrich-chatbugs-10-diff-viewer-line-numbers`
**PR:** —
**Linear:** [SUPER-804](https://linear.app/superset-sh/issue/SUPER-804)

#### Human Testing Gate

**Gate:** A reviewer opens a diff in the desktop app and sees line numbers rendered sequentially within every hunk on both the old (removed-side) and new (added-side) gutters, with no resets or duplicates across hunk boundaries.

**Test Steps:**

1. Launch the Superset desktop app and open any agent run or workspace that produced a multi-hunk diff (or open a known multi-hunk diff fixture).
2. Scroll through the diff and confirm the old-side gutter shows correct, sequential original-file line numbers within each hunk.
3. Confirm the new-side gutter shows correct, sequential new-file line numbers within each hunk.
4. Look at hunk boundaries — confirm numbering continues from the file's actual line number on each side, with no reset to 1 and no unexpected jump.
5. Find a pure-addition hunk (old side blank) and confirm only new-side numbers render correctly with the old-side gutter showing the standard "blank" affordance.
6. Find a pure-deletion hunk (new side blank) and confirm only old-side numbers render correctly with the new-side gutter blank.
7. Compare side-by-side rows in a replacement hunk — confirm no line-number duplication between adjacent rows on the same side.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| UX-DIFF-001 | Trace the diff-viewer numbering logic in `apps/desktop` and fix the sequential-numbering bug for both old-side and new-side gutters across all hunk types (additions / deletions / replacements) | engineering-manager | 120 min |
| UX-DIFF-002 | Add a snapshot test covering a representative multi-hunk diff fixture, locking the line-number output for both gutters | engineering-manager | 60 min |

#### Dependencies

- Blocks: None
- Dependent on: None

#### PRD Coverage

- [UC-UX-02](./07-uc-ux.md#uc-ux-02--display-diff-viewer-line-numbers-in-correct-sequential-order)

---

## Authoring Notes

- This roadmap was generated with the explicit `--per-ticket-prs` constraint: each of the 10 Linear tickets in the PRD becomes its own sprint and its own PR. Standard kb-sprint-plan clustering by `human_test_hook` was bypassed because the user wants reviewers to see one PR per individual issue, giving full thought to each ticket independently.
- Sprint 01 (UC-CHAT-01) is a documentation deliverable. The gate is necessarily doc-deliverable rather than running-product-observable. Test steps direct the reviewer to open the doc and verify structure — a documented exception to the standard kb-sprint-plan rule that gates must be running-product-observable. This is intentional per the per-ticket-PR constraint.
- Sprint 02 depends on Sprint 01 because the streaming work consumes the `ChatEvent` / `session.watch` protocol defined in the architecture doc. Sprints 03-10 are mutually independent and can ship in any order.
- Sprints 05 / 06 both touch `PreviousRunsList.tsx` and Sprints 07 / 08 both touch `packages/cli/src/lib/auth.ts` — these are noted as merge-order coordination points rather than hard dependencies.
- Each sprint branch cuts from `main` (not from `justinrich-chatbugs`). This base branch carries the PRD + roadmap as a planning record and is not intended to merge — its PR (if any) would be docs-only against `main`.

## Next Steps

1. Expand the next sprint's tasks: `/kb-sprint-tasks-plan .spec/prd/ROADMAP.md` (will JIT-expand Sprint 01 into a `sprint-01-chat-transport-arch/` folder with `SPRINT.md` + per-task files)
2. Run a sprint: `/kb-run-sprint sprint-01-chat-transport-arch` (after expansion)
3. Re-plan after PRD edits: `/kb-sprint-plan .spec/prd/README.md --delta-replan` (updates this ROADMAP.md in place)
