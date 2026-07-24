# Workspace Attention: notifications, navigation & cleanup

**Status:** Design approved (brainstorm 2026-07-20, revised 2026-07-21) — ready for implementation planning
**Scope:** apps/desktop (v2 path), packages/host-service (minor)
**Mockups:** https://claude.ai/code/artifact/d0002b08-0fc1-4c22-a542-d3595417b9e8 (note: the "Needs-you band" and fixed-lane sidebar shown in direction B were superseded by the view system in §2)

## Problem

As repositories, groups, and workspaces multiply, Superset gives no guidance on **which agent to attend to next**. Attention data exists (derived pane status, PR state, checks) but feeds only a passive dock badge. Groups ("Active/Review/Complete") are maintained by hand and device-local; merged workspaces accumulate until manually deleted; workspace shortcuts are positional, not attention-aware.

Competitive research (Conductor, Devin, Codex, Cursor, Vibe Kanban, Crystal, Amp, Omnara, plus PagerDuty/Superhuman/EEMUA alarm management) shows the coding-agent field has settled on status taxonomies and archive-on-merge, while **urgency ranking, interruption budgeting, snooze/aging, and load-aware foregrounding remain unclaimed** — those are the differentiating pieces of this design.

## Direction

Four composed pieces:

1. A **view system** for the workspaces panel — group-by and order-by dropdowns over workspace properties (Linear's view-options model), replacing the manual Group concept entirely.
2. An **attention engine** — one derived, explainable urgency state per workspace, powering row indicators, the jump HUD, and notifications.
3. A **queue-pop navigation flow** — ⌘J jump HUD, keyboard-first throughout.
4. **Auto-archive on merge** plus stale-workspace cleanup.

A dedicated ranked inbox view ("Mission Control", direction A in the mockups) remains the deliberate future evolution; this design builds its ranking engine without committing to the extra surface yet.

## Non-goals

- No new top-level Attention view in this phase (direction A).
- No changes to v1 (`WorkspaceSidebar`) — v2 path only.
- No mobile/web surface; macOS desktop only.
- No team-level attention (another user's workspaces).

---

## 1. Attention model

Every workspace gets one derived **attention state**: `(tier, since, reason)`.

| Tier | Meaning | Derived from |
|---|---|---|
| `blocked` | Agent needs input | Terminal binding `PermissionRequest`; ACP session `pendingPermissions` (new source) |
| `failed` | Agent errored | `Failed` lifecycle event |
| `external` | Workspace (not agent) needs action | PR record: `checksStatus` failing, `reviewDecision` = changes requested, merged-but-dirty (§5). (Review-comment events are not tracked on PR records today; add later if the runtime grows that field.) |
| `ready` | Turn finished, unreviewed | `Stop` with `lastEventAt > terminalSeenAt` (today's `review` status) |
| `quiet` | Running, or seen-idle | `working` / `idle` |

Rules:

- **One state per workspace.** Multiple signals dedupe to the max tier; the rest render as secondary chips on the row, never separate queue entries.
- **Queue ranking = tier, then age** (oldest first within tier). Used by the ⌘J HUD and notifications; the list itself is ordered by the user's chosen order-by (§2) — the attention state stays visible there through row indicators regardless of sort.
- **Staleness is an escalator, not a tier.** A `ready` item past the staleness threshold (default 3 days, configurable) climbs in prominence; at 2× threshold it surfaces a resume / snooze / archive prompt.
- **Every state carries its human-readable reason** ("asked: push the amended commit?", "2 checks failing on !5644") — shown on row hover, in the ⌘J HUD, and in notifications. Explainability is what makes ranking trustworthy.
- **Exit conditions (ack vs. resolve).** Action-required tiers clear only by action: `blocked` when the prompt is answered; `failed` on re-prompt/restart/explicit clear. Review tiers clear by attention: opening the workspace acks `external` and `ready` (the condition chip stays on the row until CI/review actually resolves). Snooze and archive always remove from the queue.
- **Snooze** removes a workspace from the queue until a trigger (duration or "when checks finish"); snoozed rows show a clock chip.
- **Color = heat; green = done.** Attention states use red (`blocked`/`failed`) → orange (`external`) → gold (`ready`); aging shifts hue hotter, never calmer. Green is reserved for genuinely resolved states (merged, checks passing) and never indicates "waiting for you" — an old unreviewed workspace must not wear a color that says "fine". Row indicators keep today's form (pulsing dot for blocked/failed, static dot otherwise) with these color semantics.

## 2. View system (group-by / order-by)

The workspaces panel gains two dropdowns; the manual Group/section concept is **removed**.

**Workspace properties:** Title, Repository, Linear status (from the linked task; "No task" bucket for unlinked workspaces), Agent status (attention tier), Last interacted.

- **Group-by:** None · Repository · Linear status · Agent status. (Title and timestamps make poor groups; they stay order-by only.)
- **Order-by:** Recent (last activity) · Title · Created — each ascending/descending. Applies within groups, and to the flat list when group-by is None.
- **"Recent" = any activity**: user interaction OR agent/workspace events (turn finished, permission requested, status change, PR event) bump the workspace. An agent finishing work surfaces its workspace even while you're elsewhere; a blocked agent's own permission event bumps it at the moment it blocks.
- **Adaptive cards:** a card shows every property **not implied by the current grouping** — grouped by Repository, cards omit the repo icon/name (as today); grouped by None or a status, cards gain the repo icon + name; grouped by Agent status, the status dot is redundant on the card but repo and age chips matter. One rendering rule, not per-view special cases.
- **Group headers** show worst-case rollup (max-tier dot + attention count) and collapse/expand; collapsed groups persist their state.
- **Defaults:** group-by Repository, order-by Recent-desc — preserves today's shape while making order meaningful. View config is a synced user preference (one global config, not per-repo).
- **Migration:** existing manual sections are dropped; group colors/pins die with them. One-time migration notes section names in a toast/release note; workspaces are untouched. (Sections are device-local localStorage today and don't sync, so the loss is smaller than it looks.)
- **Pin-to-top** survives as a per-workspace flag that floats a workspace above its group's ordering.

Old fixed "auto-lanes" from the original design are subsumed: group-by Agent status *is* the lane view; group-by Linear status recreates Active/Review/Complete derived from real state.

## 3. Navigation & keyboard model

Principle: **every attention feature ships with its keyboard path; the mouse is the alternate input.** All new commands register in the hotkey registry (rebindable) and the ⌘⇧K command palette.

- **⌘J — the jump HUD** (the universal verb). A transient panel listing **attention items first (queue-ranked), then recently-active workspaces** — jump between live workspaces primarily via keyboard, mouse-friendly too. `↵` opens the top item, repeat-tap cycles, `⌘⇧J` cycles back (position 0 = "return to where I was"). In-HUD: `↑↓` move, `1..9` pick, `S` snooze, `A` answer/approve blocked items inline, `E` archive, `Esc` dismiss.
- **⌘⇧L — sidebar focus mode:** `↑↓`/`j k` walk rows, `← →` collapse/expand groups, `↵` open; single-letter verbs on the focused row: `s` snooze, `e` archive, `p` pin, `m` mute. Hints render inline on the focused row.
- **Positional shortcuts unchanged:** `⌘1..9`, `⌘⌥↑/↓` keep muscle-memory semantics over the visible list order; ⌘J is the attention-aware counterpart.
- **Notification actions always have in-app keyboard twins** (macOS banner buttons are mouse-bound by the OS; the HUD carries the same verbs).
- **View controls are keyboard-reachable:** palette commands for "Group by …" / "Order by …" so switching views never requires the dropdowns.
- Direction A's future inbox inherits the same queue and letter verbs (`j/k`, `↵`, `e`, `s`, `a`, `u` undo) — zero relearning if/when it ships.

## 4. Notifications & channel discipline

Loudness maps to tier; every channel has a suppression story.

| Tier | Banner | Sound | Dock / menu-bar count |
|---|---|---|---|
| `blocked` / `failed` | Yes, with Approve / Open / Snooze actions | "Blocked" sound | Counted |
| `external` | Yes, plain | None (default) | Counted |
| `ready` | Quiet tier (default on) | "Done" chime (distinct) | Counted |
| `quiet` | Never | Never | Never |

- **Two sound identities:** split today's single ringtone into "needs you" vs "finished" (two pickers over the existing ringtone library).
- **Zero-latency digest collapse:** first completion notifies immediately; further completions within a sliding ~20s window **replace the delivered banner in place** ("3 agents finished — …"), sound only on the first. Blocked events never collapse.
- **Actionable banners:** Approve / Open / Snooze on blocked notifications (macOS notification actions); click-to-jump preserved.
- **Controls (synced via user preferences):** per-workspace mute, global snooze-all (30m / 1h / today — banners+sounds pause, badge keeps counting), per-tier banner/sound toggles. Existing suppression (target pane visible + window focused) preserved.
- **Escalation:** off by default; single opt-in "re-notify once if blocked > N minutes." No nag ladders.
- **Menu-bar item (optional):** needs-you count + dropdown queue, for hidden-Dock setups. Dock badge count keeps its current meaning.

## 5. Auto-archive & cleanup

- **Trigger:** existing PR runtime detects `state === "merged"` → tear down worktree, keep workspace record + session history, move to **Archive**. No confirmation.
- **Safety gate:** reuse destroy preflight — unpushed commits (`git rev-list HEAD --not --remotes`) + uncommitted changes. Dirty ⇒ no auto-archive; instead a "merged, but has local changes" queue item (`external` tier). Auto only when provably safe.
- **Undo/restore:** post-archive toast with Undo; Archive view offers Restore (recreates worktree from branch). Transcripts/PR links browsable read-only without restoring.
- **Closed-without-merge:** suggested cleanup, never automatic.
- **Stale path:** at 2× staleness threshold, resume / snooze / archive prompt; bulk palette command "Archive all workspaces idle > 2 weeks…" with a review list.
- **Archive surface:** per-repo entry ("Archive · 9 merged this week") + global view; grouped Today / Yesterday / This week / Older; searchable. Time-bucket grouping belongs here (history), not in the live list.
- **Remote workspaces** use the same flow via host-service teardown.

---

## Architecture notes

Grounded in the current v2 implementation:

- **Attention selector layer** over existing sources — terminal agent bindings (`useTerminalAgentStatuses`), PR records (`pull_requests` rows from `PullRequestRuntimeManager`), seen-state (`stores/v2-notifications`). New: ACP/chat sessions contribute `blocked` via `pendingPermissions` (today only terminal agents drive sidebar status). Extends the existing `PaneStatus` priority (`shared/tabs-types.ts`).
- **`lastActivityAt` per workspace** for Recent ordering: max of terminal binding `lastEventAt`, user-open events, and PR `lastFetchedAt`-driven state changes; host-clock ms, consistent with `terminalSeenAt` handling.
- **View system** replaces section logic in `buildDashboardSidebarProjects.ts` with a pure `groupBy × orderBy` pipeline; `v2SidebarSections` collection and its DnD/mutation surface are removed. View config, pins, snoozes, per-workspace mute, staleness threshold, tier toggles all live in a **synced store** (`useV2UserPreferences`), fixing the device-local gaps.
- **Adaptive cards:** card renderer takes the active group-by and elides implied properties.
- **⌘J HUD** = new hotkey in `hotkeys/registry.ts` + a queue selector (attention-ranked, then recent-active) shared with notifications; palette entries alongside.
- **Digest/replacement notifications** extend `V2NotificationController`/`lifecycleEvents.ts` and `notifications.showNative` (stable notification identifier for in-place replacement); notification actions via Electron/macOS notification API.
- **Auto-archive** = new host-service-driven rule: on PR-merged transition, run destroy preflight; if clean, invoke the existing `workspaceCleanup.destroy` teardown path minus record deletion, flag workspace `archived`. Archive view reads archived workspaces + existing PR metadata.
- **Linear status** comes via the linked task (`taskId`); unlinked workspaces bucket as "No task".
- **Data gaps to fill:** none blocking; `mergeable`/`behindCount` on PR records would improve `external` fidelity later.

## Edge cases

- Agent interrupted via Esc/Ctrl+C fires no hook — existing `clearWorkspaceStatuses` escape hatch remains; a `blocked` item whose terminal dies falls back to `failed` after binding liveness expires.
- Multiple sessions per workspace: workspace tier = max over its sessions; per-session detail in hover card.
- Reorder churn: with order-by Recent, agent events reorder the list while the user reads it — animate moves, and never reorder within ~1s of pointer hover over the panel (interaction guard).
- Clock skew: `since`/`lastActivityAt` use host-clock ms (consistent with `terminalSeenAt` monotonic handling).
- Merged-PR detection latency: ≤5 min worst case (existing sweep) — acceptable for archiving.
- Snooze trigger "when checks finish" depends on checks refresh cadence; fall back to time-based resurface if PR polling errors.

## Phased rollout

1. **Attention engine + ⌘J HUD** (queue selector, reasons, exit conditions, heat-ramp indicator colors).
2. **View system** — group-by/order-by dropdowns, adaptive cards, rollup headers, sections removal + migration, synced view config.
3. **Notification upgrade** — split sounds, digest replacement, actionable banners, per-workspace mute, snooze-all, menu-bar item.
4. **Auto-archive + Archive view + stale prompts + bulk command.**
5. *(Later, optional)* Direction A inbox view on top of the same engine.

Each phase ships independently and is gated by a setting on first release (per project preference for settings over changed defaults).

## Testing

- Unit: attention-state derivation (tier dedupe, age ordering, exit conditions, snooze) as pure selectors; `groupBy × orderBy` pipeline + adaptive-card property elision (existing `buildDashboardSidebarProjects` test-suite pattern); digest window merge/replace logic; `lastActivityAt` aggregation.
- Integration: lifecycle-event → notification pipeline (Stop/PermissionRequest fan-in, suppression, replacement identifiers); auto-archive preflight outcomes (clean, unpushed, dirty).
- E2E/CDP: ⌘J jump lands on highest-tier workspace; blocked row persists after open while ready row clears; Recent ordering bumps on agent Stop; undo restores worktree. Baseline-then-fix evidence per AGENTS.md CDP rules.

## Open questions (deferred, non-blocking)

- Exact staleness defaults (3d escalate / 2× prompt) — tune after dogfooding.
- Whether `external` should include "PR approved, ready to merge" as an action item.
- Menu-bar item default-on vs default-off.
- Whether pin-to-top earns its keep once Recent ordering exists, or gets cut for simplicity.
