---
title: v2 Internal Chat Polish
version: 1.1.0
scope_posture: full
human_signal_count: 0
human_signal_last_elicited: null
---

# v2 Internal Chat Polish - PRD

Closes the v2-GA-blocking risks identified by the 2026-05-18 v2 red-hat review across the renderer, host-service, and Electron-coordinator layers — including 4 CRITICAL items, 2 confirmed stubs, and a feature regression vs v1. v1.1.0 folds in additional renderer polish identified during post-PRD analysis of two reported bugs (duplicate user messages, duplicate assistant messages) plus five smaller UI/UX items (drag-drop sanitization, pane focus signal, a11y streaming throttle, snapshot schema validation, message-list virtualization).

## Human Signals

> **Skipped at user request (2026-05-18).** This PRD ships without the four authoritative human-signal anchors normally required by `kb-prd-plan`. Downstream skills (`kb-sprint-plan`, `kb-run-sprint`) should treat scope, non-goals, and cut rules as derived from the v2 red-hat review (`.spec/reviews/red-hat-20260518T083344-v2-chat.md`) rather than from elicited user prose. Re-elicit before scope hardens if the initiative grows beyond this PRD's scope.

### HUMAN SIGNAL: The Broken Thing
*Not elicited — skipped at user request.*

> (no verbatim signal captured)

### HUMAN SIGNAL: North-Star User
*Not elicited — skipped at user request.*

> (no verbatim signal captured)

### HUMAN SIGNAL: Explicit Non-Goals
*Not elicited — skipped at user request. Non-goals derived from red-hat review and planner output; see `01-scope.md` → Out of Scope.*

> (no verbatim signal captured)

### HUMAN SIGNAL: Cut Rules
*Not elicited — skipped at user request. Cut order derived from severity (CRITICAL → HIGH → MEDIUM); see `01-scope.md` → Cut Order.*

> (no verbatim signal captured)

## PRD Metadata

| Field | Value |
|-------|-------|
| Version | 1.1.0 |
| Scope Posture | Full feature (default) |
| Created | 2026-05-18 |
| Last Updated | 2026-05-18 |
| Branch | `chat-polish-spec` |
| Source Review | [../reviews/red-hat-20260518T083344-v2-chat.md](../reviews/red-hat-20260518T083344-v2-chat.md) (committed alongside this PRD) |
| Post-PRD Fold-In Source | Conversation analysis of duplicate-user-msg + duplicate-assistant-msg bugs + 5 smaller UI/UX items (plan file: `~/.claude/plans/we-ve-created-a-chat-polish-spec-agile-cake.md`) |

## Document Index

| File | Section | Stability |
|------|---------|-----------|
| [00-overview.md](./00-overview.md) | Problem statement, solution summary, v1→v2 context | PRODUCT_CONTEXT |
| [01-scope.md](./01-scope.md) | In scope, Out of scope (incl. deferred PRDs), Cut order | FEATURE_SPEC |
| [02-roles.md](./02-roles.md) | User roles | PRODUCT_CONTEXT |
| [03-functional-groups.md](./03-functional-groups.md) | Functional group overview and UC summary | FEATURE_SPEC |
| [04-uc-v2ui.md](./04-uc-v2ui.md) | UC-V2UI-01 through UC-V2UI-07 (renderer polish) | FEATURE_SPEC |
| [05-uc-host.md](./05-uc-host.md) | UC-HOST-01 through UC-HOST-10 (host-service lifecycle + security) | mixed CONSTITUTION / FEATURE_SPEC |
| [06-uc-run.md](./06-uc-run.md) | UC-RUN-01 through UC-RUN-08 (Mastra runtime polish) | mixed CONSTITUTION / FEATURE_SPEC |
| [07-team-contributions.md](./07-team-contributions.md) | Planner contributions (react-vite, electron, mastra) | — |
| [08-technical-requirements.md](./08-technical-requirements.md) | System components, contracts, dependencies | CONSTITUTION |

## Quick Stats

| Metric | Value |
|--------|-------|
| Functional Groups | 3 |
| Use Cases | 30 |
| Source Findings Addressed | 4 CRITICAL + 11 HIGH + 8 MEDIUM (red-hat) + 6 post-PRD UI/UX findings = 29 distinct items |
| Deferred to Follow-up PRDs | 16 findings (observability + low-severity cleanup) |
| Cross-Layer UCs | 5 (abort/stop, pane-close drain, session ownership, ChatService extraction, no-electron-coupling test) |
| Specialist Planners | react-vite-planner, electron-planner, mastra-planner |

## Version History

| Version | Date | Changes | Trigger |
|---------|------|---------|---------|
| 1.0.0 | 2026-05-18 | Initial PRD synthesized from v2 red-hat review | New initiative; signals skipped at user request |
| 1.1.0 | 2026-05-18 | Folded post-PRD findings: refined UC-V2UI-01 (one-frame race, normalization safety, concurrency) and UC-V2UI-02 (stopReason + id-collision guards); added UC-V2UI-08 (drag-drop sanitize), UC-V2UI-09 (pane isFocused), UC-V2UI-10 (a11y aria-live throttle), UC-V2UI-11 (snapshot zod parse), UC-V2UI-12 (message-list virtualization); refined UC-RUN-07 (no-overwrite-user-edited-titles); updated cut order to position new UCs and protect the duplicate-message fixes from being cut | Bug-mechanism deep-dive on reported duplicate-message reports |

## Next Steps

- `/kb-sprint-plan` — Build implementation roadmap with sprint gates
- `/kb-prd-plan --update "..."` — Targeted edits as scope hardens
- `/kb-prd-plan --feedback "..."` — Integrate customer feedback (auto-versions)
- Separate PRD recommended: **v2 Chat Agent Observability & Evals** (covers the OBS group from mastra-planner — Langfuse traces, cost guard, prompt-injection detector, eval CI gate)
