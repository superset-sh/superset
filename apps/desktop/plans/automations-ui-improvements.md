# Automations UI Improvements

Anchors: **Cursor Automations** (dashboard, run history, result-as-diff) and **OpenAI Codex/ChatGPT** (create & edit automations *in chat*, NL schedule, unread runs).
Reference screenshots: `~/Desktop/competitor-screenshots/gallery.html` (filenames cited per component). The `cursor2-*` set (60 files) documents every Cursor surface: dashboard, editor, run history, run detail, creation flows, marketplace.

**Model (settled):** a run does not "end" — it **creates a workspace** with an agent session in it. `dispatched` = workspace created = the run succeeded. There is no completion-tracking pipeline; what happens after creation is the workspace's story, told live (agent status derived from host bindings, diff visible in the workspace). The UI's job is (a) making create-success/failure legible and (b) making the created workspaces easy to review.

---

## Phase 0 — Semantics, not pipeline (small)

No lifecycle writeback. Keep dispatch statuses as the run's terminal state.

- **Language:** render `dispatched` as **"created"** (with workspace name), not "ran" — the current word implies a completed job. `dispatch_failed` / `skipped_offline` render as "failed to create" with the reason.
- **Live agent state on run rows:** for a run's workspace, reuse the existing bindings-derived status (`useTerminalAgentStatuses` / `deriveTerminalAgentStatus`: working / permission / failed / idle-review) instead of persisting anything. A run row = "created → [live: agent working / needs review / failed]". Chat-session runs: reuse whatever the workspace list shows for chat agents today; if nothing exists, show "created" only (no new plumbing).
- **Schema (optional, tiny):** `trigger` (`schedule | manual`) on `automation_runs` so manual re-runs are distinguishable in history (GH Actions' trigger column). Via `db-migrations` skill; never hand-edit `packages/db/drizzle/`.
- Fix SDK mirror: `packages/sdk/src/resources/automations.ts:280` declares a nonexistent `updatedAt`.

## Phase 1 — Dashboard (list page) — SHIPPED 2026-08-09 (except NL box → Phase 2)

Ref: `cursor2-dashboard-populated-search.png`, `mobbin-cursor-automations-dashboard-empty.png`.

Shipped on `automations-ui-research`:
- **Stat cards** (Cursor-style minimal): Active / Created·7d / Failed·7d, counts + muted success/failure percentages, no red. The Failed card toggles a failing-automations filter (self-clears when nothing is failing). Swap it for a **"Run History →" card** once Phase 3 exists (Cursor's 4th card is a clickable sparkline).
- **Columns**: Name (+ muted project tag, Codex-style) · Schedule · **Status** (Active/Paused text; next-run time on hover) · Last run ("created Xd ago"). Workspace/Device/Agent columns removed (uniform, detail-only now).
- **Pause/Resume in the row menu**; **top bar**: search (live name filter), help icon → docs, primary New automation button; CLI hint compressed to one line; skeleton loading rows; minimal empty state (centered CTA + one suggested template per category).

Still open: percentage denominators are runs-in-7d (matches Cursor); revisit when trigger types diversify.

## Phase 2 — In-chat creation & editing (the OpenAI piece)

Ref: `chatgpt-tasks-create-in-chat.png`, `devin-created-schedule-playbook-cards.png`, `mobbin-chatgpt-task-edit-custom-schedule.png`.

Backend already exists: `automations_*` MCP tools are live on the v2 agent MCP endpoint — chat agents can create/update automations today. The work is UX:
1. **Confirmation card in chat:** when a session's tool call creates/updates an automation, render a rich card (name, human-readable schedule, next run, target repo, link to `/automations/$id`) instead of raw tool output — ChatGPT's parsed-task card / Devin's "Created a schedule" card. Lives in the chat tool-result renderer.
2. **NL box on the dashboard** opens a freeform chat (workspace-optional runtime, PR #5484) seeded to draft the automation via the MCP tools, confirm schedule + target, end with the card. Cursor's `/automate` pattern.
3. **"Ask the agent to change this"** on the detail page (ChatGPT's "ask ChatGPT to update the schedule" hint) — same freeform chat pinned to the automation id.
4. **"Turn into automation"** action on an existing chat session / workspace agent — seeds the draft prompt from the session's task.

Guardrail: agent edits already version prompts (`automation_prompt_versions.source = "agent"`), so agent-made changes stay auditable/restorable.

Cursor deep-dive confirmations (`cursor2-dashboard-nl-prompt-typed.png`, `cursor2-new-automation-skeleton.png`, `cursor2-template-modal-fix-slack-bugs.png`):
- NL box submits → **drafting skeleton page** → fully pre-filled editor; the editor keeps a **"Follow up…" composer to iterate on the automation with the drafting agent** — exactly our freeform-chat + MCP model.
- NL box placeholder cycles concrete examples ("Fix CI failures automatically") — do this instead of a generic prompt.
- Template modal shows the **full prompt preview** before "Start Building" — our template cards should too.

## Phase 2.5 — Onboarding (research done; ship with Phase 2's NL box)

Ref: `onboard-*.png` in the screenshot corpus (Cursor empty dashboard, Zapier idea cards, ChatGPT example objects, Mistral opt-in announcement).

Finding: nobody tours an empty automations page — the empty state IS the onboarding. Cursor launched Automations with zero tour: permanent sidebar entry + empty state + templates + changelog.

1. **First visit:** NL chat input as the empty-state hero with rotating concrete placeholders; below it, 3-4 Zapier-style full-sentence example-prompt cards that click-to-fill (personalize from repo signals — CI present → "summarize failed CI runs each morning"). One line of run-model education in the empty state: "Runs land in a workspace — review the diff, merge what's good." That's our only novel teaching burden. (Wording note: dispatch reuses a pinned workspace when set; only "New workspace" automations get a fresh one per run.)
2. **Returning, never created:** rotate example cards per visit; optionally a dismissible 3-item checklist (create via template one-click / review a run's workspace / turn on notifications). Stronger alternative: a pre-seeded read-only example automation with realistic run history (ChatGPT example-chats pattern).
3. **Existing users at feature/redesign launch:** "New" dot on the sidebar entry + a single Mistral-style opt-in card ("Not now / Try it" → lands with NL box focused, suggestion pre-filled). No multi-step tours — across all 38 captures, tours only appear for spatially complex surfaces, never list+create pages.

## Phase 3 — Run history as a review queue

Ref: `cursor2-run-history-daily-code-cleanup.png`, `cursor2-run-detail-transcript-summary.png`, `cursor2-run-detail-diff-mark-as-ready.png`, `codex-automations-list-up-next.png`.

Cursor's exact spec (adopt the shape, adapt the semantics):
- Tab header: 3 time-window cards (Last 1h / 24h / 7d) with green succeeded + red failed counts; **Stop All Runs** top-right; search + filter (by Status / Trigger / Tools) on the tab row.
- Columns: Trigger (icon + "Scheduled · Every Mon at 9AM GMT+7" / manual) · Triggered (absolute time) · Status (**pill chips**: Succeeded green / Failed red / Running orange) · Duration · ⋯ (View details / Edit / Cancel Run — Cancel red, running rows only). Ours: status = created/failed-to-create; "duration" n/a until lifecycle exists; add workspace + live agent state instead.
- Run detail, two shapes worth mirroring later: transcript + **Run Summary card** (trigger + ordered tool-call list) + follow-up composer; or narrative report beside a diff with a **draft-PR "Mark as ready" gate**. For us: the workspace is the run detail; the follow-up composer maps to opening the session.

A run's payoff is its workspace, so history = "the workspaces this automation created":
- **Run History tab on the detail page** (tabs: Overview | Run history), replacing the 10-row sidebar list as the primary surface. Full table via `automation.listRuns` (exists server-side, unused; add pagination): status chip, trigger (schedule vs manual), created-at relative, workspace name + live agent status, sessionKind icon, actions: Open workspace (existing deep link), Re-run.
- **Failed creates get real error surfaces:** full selectable error text in the row/expanded state — today it's a `max-w-xs` hover tooltip, violating our own AGENTS rule.
- **Diff-at-a-glance (stretch):** for runs whose workspace is on a reachable host, fetch live diff stats the same way the workspace Changes tab does and show `+12 −3` on the row. Live query only — nothing persisted; absent when host is offline.
- Keep last-5 in the detail sidebar as a teaser linking to the tab. No separate run-detail route needed — the workspace *is* the run detail; a failed create expands in place.
- **Unread/review affordance:** extend the existing failure-badge watermark store to "created, not yet opened" so the automations page doubles as a review queue (Codex inbox model). Clearing = opening the workspace.

## Phase 4 — Scheduling polish + failure policy

Ref: `valtown-cron-schedule-popover.png`, `mobbin-retool-workflow-schedule-trigger.png`, `triggerdev-schedule-create-form.jpg`.

Cursor's trigger UX to grow toward (`cursor2-editor-settings-pagerduty.png`): triggers as **sentence-style dropdown chips** ("Every week on [Monday ▾] at [09:00 ▾] PST"), a trigger picker with Scheduled presets + Custom (cron), and an indented repo-scope line. Multiple triggers OR together.

**SchedulePicker** (`automations/components/SchedulePicker/`):
- Validate custom RRULE via existing `automation.validateRrule` (never called today) with inline error; echo it human-readably; show next-3 occurrences via existing `nextOccurrences` (Val Town / Trigger.dev pattern).
- Timezone visible in the create dialog (today silently browser-defaulted); render schedule labels with timezone when it differs from the viewer's.
- Fix stale-state bug: picker derives preset once in `useState` initializer and never resyncs on external rrule changes.

**Failure policy (creation failures only — that's the run's only failure mode):**
- Circuit breaker: evaluate cron tracks `consecutiveFailures` on the automation, auto-pauses at N (Kestra `stopAfter` pattern), sets `pausedReason`; UI shows "paused after N failed creates" banner with one-click resume + the underlying error. Schema: `consecutiveFailures`, `pausedReason` on `automations`.
- Desktop notification on failed create (host offline being the common cause — the existing HostOfflineRunDialog flow stays the manual-run path); one "creating again" ping on first success after a streak.

## Phase 5 — Detail page (audit 2026-08-09)

Ref: `cursor2-editor-settings-pagerduty.png`, `cursor2-editor-weekly-full.png`, `mobbin-cursor-automation-run-history.png`, `codex-automation-edit-daily-brief.png`, `mobbin-chatgpt-task-edit-custom-schedule.png`.

Current shape (`routes/.../automations/$automationId/page.tsx`): two-column, no tabs — h-11 breadcrumb header (icon actions: version history / pause / delete / Run now), inline title + prompt editor (blur-save), fixed 360px right rail (Status / Details pickers / last-10 runs). Cursor's detail page has the same skeleton (title, sectioned body, side-by-side config) — the gaps are outcome legibility and edit affordances, not layout.

1. **Header, Cursor-style identity row**: under the title, an **Active toggle + owner name** (`cursor2-editor-settings-pagerduty.png`) replacing the icon-only pause button; a muted run-count chip ("12 runs · Active", Codex edit modal). Delete moves to a ⋯ overflow menu with a real confirm dialog (today: bare trash icon + `alert()`), gaining **Duplicate** (Cursor has it; trivial — copy row minus runs). Breadcrumb becomes a router `Link` (cmd-click works).
2. **Tabs: Overview | Run history** (= Phase 3's tab). Rail run list shrinks to last-5 teaser + "View all →". Fixes the silent `RECENT_RUNS_LIMIT=10` cap and "Last ran" being computed over that truncated, `createdAt`-sorted window.
3. **Failure legibility**: failed runs get persistent, `select-text` error text (today: hover-only `max-w-xs` tooltip — violates our own AGENTS error-text rule) + per-run **Retry** (parity with the list page's `useFailedAutomations` retry); a banner when the latest run failed to create.
4. **Next run row**: relative time ("in 3h") with absolute on hover + next-3 occurrences via existing `nextOccurrences`; when paused show "would run at …" instead of `—` so schedule edits are previewable before resuming.
5. **SchedulePicker correctness** (feeds Phase 4): picker calls `onRruleChange` per keystroke in Custom mode, persisting partial/invalid RRULEs — save only on valid parse/blur; validate via `automation.validateRrule`; echo the rule human-readably. Timezone row shows offset ("America/New_York · UTC−4"); picker list grouped/sorted, not raw `Intl.supportedValuesOf` order.
6. **Save affordance**: name/prompt save on blur with zero feedback — add a transient "Saved" indicator and flush pending edits on nav/unmount.
7. **Read-only mode disables, not hides**: non-owners currently lose every header action including version history and Run now, with the explanation buried in the rail. Show disabled controls + move "Owned by X" up next to the toggle.
8. **Prompt column measure**: no max-width today — long lines on wide windows. Center at ~`max-w-3xl` like the dashboard (and Cursor's editor).

Not adopting: model picker + Tools rows (Cursor) — the agent preset owns that; per-run Duration until a lifecycle exists (Phase 0 semantics); trigger chips beyond schedule (Phase 4's growth path).

---

## Order & dependencies

| Phase | Depends on | Size |
|---|---|---|
| 0 semantics | optional tiny migration (`trigger`) | S |
| 1 dashboard | none | M — one page + row components |
| 2 in-chat | none (MCP tools live) | M — chat card + freeform-chat entry points |
| 2.5 onboarding | none (interim dialog-prefill); NL box benefits from 2 | S — see automations-onboarding.md |
| 3 run history | 0 (language), #5449 status hooks | M — one tab |
| 4 schedule + failure policy | migration for circuit breaker | S+S |
| 5 detail page | 3 for the tab; rest independent | M — header/rail rework + picker fixes |

All phases are independent enough to parallelize; 1 and 3 share row components (build together).

## Open questions

1. Chat-session runs have no bindings-derived live status — acceptable to show "created" only, or worth a small chat-status derivation first?
2. Unread/review model: per-run watermark (Codex-style inbox) vs keeping today's failure-only badge — how loud should successful creates be?
3. Does `runNow` need `trigger: manual` from day one, or infer from `scheduledFor` proximity and skip the migration?
