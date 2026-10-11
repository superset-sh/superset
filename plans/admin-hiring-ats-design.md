# Hiring pipeline in admin (`admin.superset.sh/hiring`)

Move the Notion Hiring CRM (`collection://36ab9d5b-…`) into our own DB and add a page in
`apps/admin`. Notion stays read-only as an archive after the import.

## Goals

- One place to see the pipeline, move people through it, and log every touch.
- The daily follow-up list is the default view, not something you build with a filter.
- Agents (the Daily Hiring Check-in automation, WaaS sync) read and write through tRPC, not Notion.

Not in v1: a candidate-facing apply form, email sending, calendar booking, offer letters, multiple
companies or orgs.

## Data model (`packages/db/src/schema/hiring.ts`)

No `organizationId`. This is internal data, gated by `adminProcedure` like the rest of admin.

**`hiring_roles`**: `id`, `title` ("Founding Engineer", "Chief of Staff"), `status` (open/paused/closed),
`waas_job_id`, timestamps.

**`hiring_candidates`**: one row per person.

| Column | Notion source |
|---|---|
| `name`, `email` (unique, lower-cased), `phone` | Name, Email, Phone |
| `current_title`, `current_company` | Title, Company |
| `github_url`, `linkedin_url`, `x_url`, `site_url`, `waas_url` | same URLs |
| `superset_user_id` → `users.id`, set null | User ID (marks Power-User candidates) |
| `source` enum: power_user, referral, waas, inbound, outbound | Source |
| `referred_by` text | new |
| `notion_page_id` (unique, for idempotent import) | page url |

**`hiring_applications`**: a candidate *in a role*. The stage lives here, so one person can be in two
roles.

| Column | Notes |
|---|---|
| `candidate_id`, `role_id` | unique together |
| `stage` enum: sourced, reached_out, screen, technical, system_design, work_trial, onsite, offer, closed | Notion's Stage minus the end states |
| `outcome` enum: active, hired, rejected, withdrew, not_looking | Notion's Outcome. `closed` stage ⇔ outcome ≠ active |
| `owner_user_id` → `users.id` | Owner |
| `next_step` text, `next_follow_up_at` date | Next Step, Next Follow-up |
| `last_contacted_at`, `stage_changed_at`, `closed_at` | Last Contacted, Closed At |
| `score` enum: strong_hire, lean_hire, lean_no_hire, strong_no_hire | overall. Per-interview scores go in events |

Notion keeps Hired/Rejected/Withdrew in both Stage and Outcome. Here the stage the person reached
is kept, and the end state is only in `outcome`, so "how far did rejected people get" can be answered.

**`hiring_events`**: append-only timeline, the replacement for page bodies and comments.
`application_id`, `candidate_id`, `kind` (note, stage_change, outreach, reply, interview, score),
`body` (markdown), `metadata` jsonb (from/to stage, interviewer, score, gmail thread id),
`author_user_id` (null = agent), `author_label` ("Hiring Check-in"), `occurred_at`.
Every stage or outcome mutation writes one event in the same transaction.

Resumes: reuse `files` / `attachments` (R2), no new table.

## Page

`/hiring` in the admin sidebar (`LuUsers`). Three tabs plus a detail drawer.

**1. Today** (default)
- Overdue and due follow-ups, sorted by date. Row: name · role · stage · next step · days overdue.
  Buttons: *Log touch* (sets last contacted, asks for the next follow-up date), *Snooze 3d*, *Open*.
- "Gone quiet": active, no touch for more than 7 days, and no follow-up set.
- A sourcing pace strip: this week's sourced / first-touch / screens against the ≥10/≥10/≥3 targets
  in the Operating Notes.

**2. Board**
- Columns = active stages. Cards show name, role chip, source dot, owner avatar, days in stage
  (amber after 7 days, red after 14).
- Drag between columns to change the stage (dnd-kit, already used in desktop). On drop, a small
  popover asks for an optional note and a next follow-up.
- Filters: role, owner, source. Closed people are hidden behind a "Show closed" toggle.

**3. Table**
- Every application, sortable columns, quick search on name/email/company/GitHub handle.
- Bulk actions: set owner, close with outcome.
- *Add candidate* dialog: paste a GitHub/LinkedIn/WaaS URL or an email. It warns when the email or
  GitHub URL is already in the DB.

**Candidate drawer** (`?candidate=<id>`, so it can be linked from Slack or the digest)
- Header: name, links as icons, current title @ company, source, Superset user badge with org
  and plan when `superset_user_id` is set.
- One section per application: stage stepper, outcome, owner, score, next step, follow-up.
- Timeline: events newest first, with a composer for notes (⌘↵) and an "Interview" template
  (interviewer, round, score, notes).

**Funnel strip** at the top of Board and Table: counts per stage and stage-to-stage conversion,
broken down by source over the selected range. It is built from `stage_change` events, so it
stays correct after people move on.

Folder layout follows AGENTS.md: `app/(dashboard)/hiring/{page.tsx, components/, hooks/}`, with
`HiringBoard`, `HiringTable`, `TodayList`, `CandidateDrawer`, `AddCandidateDialog`, `FunnelStrip`.

## API (`packages/trpc/src/router/hiring/`, `trpc.hiring.*`, all `adminProcedure`)

- `today`, `board({ roleId?, ownerId?, source? })`, `list({ q?, … , cursor })`, `get({ candidateId })`, `funnel({ weeks })`
- `createCandidate` (dedupes on email or GitHub), `updateCandidate`
- `addApplication`, `moveStage`, `setOutcome`, `updateApplication`, `logTouch`, `addEvent`
- `importNotion` (one-off, idempotent on `notion_page_id`)

New procedures only, so the trpc-compat skill has nothing to check for released clients.

## Agents

- **Daily Hiring Check-in**: switch its reads to `hiring.today` and `hiring.list`. It may write
  `addEvent` (kind `reply`, `outreach`) and `logTouch`. Stage and outcome stay human-only, as now.
  The page shows agent events with a bot badge.
- **WaaS sync** (phase 2): an automation pulls `applicant_list` and upserts candidates with
  source=waas into the `sourced` stage. Dedupe on `waas_url`.
- Agents reach these through API-key auth on the same procedures. Check that `adminProcedure`
  accepts an `@superset.sh` user's API key before phase 2.

## Migration

1. Schema + `db-migrations` skill (fresh Neon branch, production safety checklist).
2. Import script: Notion query → candidates/applications. The page body becomes one `note`
   event, dated at the page's created time. Owner is matched by Notion user email to `users`.
3. Dry run, then compare row counts and per-stage counts with Notion. Then run it for real.
4. Freeze Notion: rename it "Hiring CRM (archived, see admin/hiring)" and lock the database.
   Point the Operating Notes page and the automation at admin.

## Phases

- [x] P1: schema (`0146_hiring_ats`), `trpc.hiring.*`, Pipeline table, add dialog, Notion
      importer (`packages/trpc/scripts/import-hiring-notion.ts`)
- [x] P1.5: two-pane candidate page `/hiring/[candidateId]` (header: Move to ‹next stage›,
      Close ▾, Touched, ↑/↓ through the list it was opened from); Today is an inbox
      (list + the same candidate view, j/k, snooze on hover). The drawer is gone.
- [x] Terminal/agent access: `bun hiring today|list|get|note|touch|add|follow-up` (`packages/trpc/scripts/hiring.ts`)
      over the deployed API with an @superset.sh `SUPERSET_API_KEY`. Not in the public CLI or MCP.
      Move/close stay in the page.
- [ ] P2: Board with drag, funnel strip, sourcing pace strip, "gone quiet" list
- [ ] P3: automation switch-over, WaaS sync, resume uploads, Notion page bodies as notes

## Decisions taken in P1

- Access stays `adminProcedure` (any `@superset.sh` account). Revisit before adding non-founders.
- Notion page bodies are not imported; the drawer links to the Notion page instead.
- Notion rows whose Stage held an end state (Rejected/Withdrew/Not Looking) import as
  `reached_out`, since the stage they reached was never recorded.

## Design references (Mobbin)

- Board: Twenty `mobbin.com/screens/f9e9491f-3c74-462f-8344-a9a35c3a6f63`, Juicebox `511cf541-b9e1-4330-9226-573d7248e370`
- Record page: Twenty `c1b8ca68-1790-4df2-a715-1dea20b4b063`, Lightfield `201a0769-f061-40af-a5fb-c9670fddeca0`
- Candidate page: Workable `d9554143-329e-48d9-95f7-a8b562c06a01`, Juicebox `40fabd13-b59d-42ca-9af6-d3a7cf6b11b1`
- Triage list: Linear inbox `8337813e-f0dd-4415-8a29-87c114b0442b`
