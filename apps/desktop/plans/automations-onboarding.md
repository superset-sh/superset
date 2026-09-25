# Automations Onboarding Flow

Companion to `automations-ui-improvements.md` (Phase 2.5). Grounded in the Mobbin onboarding corpus (`onboard-*.png`, 38 screens).

**Principles** (from the research):
- No tours. Across every capture, tours only exist for spatially complex surfaces — never list+create pages. The empty state IS the onboarding (Cursor shipped Automations with zero tour).
- Templates and NL creation are ONE surface (Zapier): example prompts click-to-fill the input, they aren't a separate gallery.
- Our single novel teaching burden: **runs land in a workspace** (a fresh one by default; dispatch reuses the automation's pinned workspace when one is set — see `dispatch.ts`). One sentence, placed where Cursor puts "Billed at plan rates."

---

## Flow 1 — First visit (zero automations)

Layout (replaces `AutomationsEmptyState` content; stat cards + tabs stay above per Cursor):

```text
            What should run on a schedule?
   ┌──────────────────────────────────────────────┐
   │  ✦  <rotating placeholder, see below>     ↑  │   ← NL input (Phase 2 chat;
   └──────────────────────────────────────────────┘      interim: prefills CreateAutomationDialog)
     Runs land in a workspace. Review the
     diff, merge what's good.                          ← the one education line

   SUGGESTED                                          ← 4 cards, picked by repo signals
   ┌ Fix CI failures ──────────┐ ┌ Triage new issues ────────┐
   │ "Each morning at 8, look  │ │ "Every weekday at 9am,    │
   │  at failed CI runs on     │ │  read new GitHub issues,  │
   │  main, diagnose the most  │ │  label them, and draft a  │
   │  common failure, open a   │ │  first reply for review." │
   │  fix PR."                 │ │                           │
   └───────────────────────────┘ └───────────────────────────┘
   ┌ Keep docs fresh ──────────┐ ┌ Weekly release notes ─────┐
   └───────────────────────────┘ └───────────────────────────┘

   [Create automation]   [Browse all templates]
```

- Card click = **fill the NL input** with the sentence (Zapier pattern), not instant-create — the user edits schedule/wording before committing. Interim (pre-Phase-2): card click opens `CreateAutomationDialog` with prompt + rrule prefilled from the template.
- "Browse all templates" opens the existing dialog gallery.

### Rotating NL placeholders (cycle every ~6s, Cursor pattern)
1. "Every weekday at 9am, triage new GitHub issues and draft replies for my review"
2. "Summarize failed CI runs on main every morning before standup"
3. "Every Friday at 4pm, draft release notes from this week's merged PRs"
4. "Nightly at 2am, find one small bug, fix it, and open a PR"

### Suggested-card copy + personalization signals
Pick 4 of 6 by cheap host-side repo signals (fall back in listed order):

| Card | Full sentence (fills input) | Show when |
|---|---|---|
| Fix CI failures | "Each morning at 8am, look at yesterday's failed CI runs on main, diagnose the most common failure, and open a fix PR." | `.github/workflows/` exists |
| Triage new issues | "Every weekday at 9am, read new GitHub issues, apply labels, and draft a first reply for my review." | GitHub remote |
| Keep docs fresh | "Every Wednesday at 9am, review this week's merged PRs and update any docs they made stale." | `docs/` or `*.mdx` present |
| Weekly release notes | "Every Friday at 4pm, draft release notes from this week's merged PRs." | always eligible |
| Dependency audit | "Every Monday at 7am, audit dependencies for security advisories and open an upgrade PR for anything critical." | lockfile present |
| Test the weak spots | "Nightly, find the recently-changed file with the weakest test coverage and add tests." | test files present |

## Flow 2 — Returning, never created one

- **Rotate** which 4 suggestion cards show per visit (Zapier rotates ideas; repetition reads as nagging).
- Add ONE affordance, choose at build time:
  - **(a) Ghost example row** (recommended): a locally-rendered "Example" row in the table area — "Example: Weekly dependency audit · Mondays at 7am" with an `example` badge and a "Use this" button that fills the input. Teaches the list UI with zero DB writes. ChatGPT's example-chats pattern without fake data.
  - (b) Dismissible 3-item checklist card (Apollo pattern): ① Create your first automation (one click via template) ② Open a run's workspace ③ Turn on failure notifications. More activation pressure, more chrome; needs dismissal persistence (localStorage singleton, register the key).
- Decision note: do NOT seed real automation/run rows — silent DB writes surprise users and sync everywhere.

## Flow 3 — Existing users (feature/redesign launch)

- **"New" dot** on the Automations sidebar entry until first visit (reuse the failure-badge watermark store pattern; clears on page open).
- One **opt-in announcement card** (Mistral pattern), shown once at next launch, never again after any interaction:
  - Title: "Put an agent on a schedule"
  - Bullets: "Schedule any prompt — daily triage, weekly changelogs, nightly fixes" · "Each run creates a workspace with the results ready to review" · "Create one by describing it, or start from a template"
  - Buttons: `Not now` / `Try it` → lands on /automations with the NL input focused and the top suggestion prefilled.
- Maximum escalation if adoption lags: a single-step spotlight anchored on the sidebar entry (AI Studio pattern). Never multi-step.

## Anti-goals
Multi-step tours; gamified checklists (points/leaderboards); video walkthroughs; personalization questions before showing value; seeding fake data into real collections.

## Instrumentation
Activation = first automation created within 7 days of first page visit. Track: page first-visit, card clicks (which card), NL submissions, template-gallery opens, announcement Try-it vs Not-now.

## Build order
1. Empty-state restructure + placeholders + suggestion cards with interim dialog-prefill behavior (no Phase 2 dependency).
2. Signals plumbing for card personalization (host-side repo checks; static fallback until then).
3. "New" dot + announcement card at redesign release.
4. Swap card/input behavior to the Phase 2 NL chat when it ships.
