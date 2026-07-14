# Superset Customers

Internal, team-only portal for tracking Superset customers: product activity,
paying status, health, AI-researched firmographics, and Slack-derived tasks,
organized company by company. Access is restricted to `@superset.sh`
accounts — the client redirects everyone else, and every tRPC procedure is
behind `adminProcedure` (the actual security boundary).

A visual companion to this doc lives in
[`docs/architecture.html`](./docs/architecture.html).

## Architecture overview

```
apps/customers  (Vite SPA, port 3005)
      │  tRPC over HTTP (React Query)
      ▼
apps/api  →  packages/trpc/src/router/customers/   ← all backend logic
      │
      ├─ PostHog   (HogQL /api/query)   product activity
      ├─ Postgres  (Drizzle)            users, orgs, subscriptions, PRs
      ├─ Vercel KV                      caches + feature state
      ├─ Exa       (/search)            person research
      ├─ Anthropic (claude-opus-4-8)    company research, Slack task extraction
      └─ Slack     (Web API)            channel history for task extraction
```

The SPA is presentation-only: Vite 7 + TanStack Router (file-based routes;
`routeTree.gen.ts` is generated), React Query + tRPC 11, Tailwind v4,
`@superset/ui`. Everything with a secret, a cache, or a data source lives in
the shared tRPC package so the API deployment serves it.

## Domain model

Superset auto-creates a personal org for every signup, so orgs are ~1:1 with
users (~50k orgs, ~91 with more than one member). The app therefore uses two
lenses:

- **Company = email domain.** Users are grouped by the domain of their email
  address. This is the primary lens — it captures multi-user companies that
  never formed a shared org. Freemail domains are filterable; `superset.sh`
  is excluded.
- **Account = DB organization.** The billing lens: subscriptions, plans, and
  seats attach to org ids. A domain aggregates all orgs its users belong to;
  a domain is "paying" if any of them is.

**Health tiers** (shared lib `packages/shared/src/customer-health.ts`):
active ≤7d · idle ≤14d · cooling ≤30d · dormant >30d since last activity;
paying + dormant = churn risk. **Stage** is inferred from user count
(solo / team / scale / enterprise) in `customer-stage.ts`.

## Pages

| Route | Row | Contents |
|---|---|---|
| `/companies` | email domain | rollup table: users, active 7d, events 30d, trend, health, stage; search, filters, pinned tab |
| `/companies/$domain` | — | stat cards, org chips, AI company card, weekly activity chart, per-user daily activity matrix, Slack tasks, users table with per-user research |
| `/accounts` | organization | plan, seats, paying status, member activity |
| `/accounts/$orgId` | — | subscription detail, members table |
| `/users/$userId` | user | activity chart + stats, AI-researched role/socials/location |

Legacy `/domains` routes redirect to `/companies`; a UUID in
`/companies/$domain` redirects to `/accounts/$orgId`.

## Activity data pipeline

All product activity comes from PostHog via HogQL (`/api/query`), joined to
the DB by `distinct_id = users.id` (set by `posthog.identify`).

1. **Global snapshot** (`activity-snapshot.ts`) — one query over 12 curated
   core events (`$pageview` excluded: anonymous ids are UUID-shaped too),
   grouped per `distinct_id`: last-active, 7d/30d/prev-30d counts, active
   days, per-surface counters. `LIMIT 65000`, newest-first so truncation
   drops only long-dormant users.
2. **Org / domain indexes** — the snapshot folded with `members` and `users`
   into per-org and per-domain aggregates, memoized in-process.
3. **Bounded per-company queries** — weekly timeseries and the activity
   matrix interpolate a validated, capped id list for one company only.
4. **Activity matrix** (`activity-matrix.ts`) — per-user × per-day counts
   split into terminal / chat / workspace categories plus
   `workspace_created` milestones; PR merges join in from Postgres
   (`github_pull_requests.mergedAt`, attributed at company level).

Invariant: **every HogQL query carries an explicit `LIMIT`** — PostHog clamps
unlimited queries to 100 rows silently.

## Caching

Three layers, cheapest first:

| Layer | TTL | Scope |
|---|---|---|
| React Query | ~1 min, `keepPreviousData` | per client |
| In-process memos (`memoizeAsync`) | 15 min | per server instance — the expensive index walks |
| Vercel KV | 1 h (PostHog results) / 30 d (research) | shared |

Typical page load is ~30–40 ms against warm memos. The sidebar refresh
button calls `refreshData`, which busts the server memos and invalidates the
client cache. Pages display a "data as of" timestamp.

## AI research

Manual by default; nothing spends money without an explicit trigger.

- **People → Exa** structured search (~2s): title, seniority,
  LinkedIn / Twitter / GitHub, location.
- **Companies → Claude** with server-side web search (30s–4min): stage,
  size, HQ, funding, investors, YC batch, parent company.
- Each backend falls back to the other if its key is missing
  (`enrichment.ts`).

Results are cached in KV 30 days (1 day for empty results). Per-domain
**auto-research** (`research-settings.ts`): one background batch over
everyone at the domain (`batch-research.ts`, concurrency 8, progress bar via
polled KV state), plus a catch-up for users who appear later. Nothing
re-runs unless manually triggered. KV is currently the only store for
research results; dedicated Postgres tables are the planned next step once
the field set stabilizes.

## Slack tasks

`slack-tasks.ts` reads our own workspace with a single user token (no OAuth
flow; unrelated to the customer-facing Slack integration in `apps/api`).

- **Matching**: channel topic tag `customer:<domain>` (explicit) or name
  conventions (`ext-acme`, `acme-superset`, …).
- **Sync**: incremental `conversations.history` from a per-channel timestamp
  cursor in KV; Claude folds new messages into a running task list
  (open/done, owner us/them, assignee, source-message permalink). No new
  messages → no model call.
- **UI**: task card on the company page; channels the token's user hasn't
  joined are surfaced but can't sync (Slack exposes history to members only).

Setup: create a Slack app from
[`docs/slack-app-manifest.json`](./docs/slack-app-manifest.json), install,
set the User OAuth Token as `SLACK_CUSTOMERS_TOKEN`. Without the token the
feature is hidden entirely. Current limits: top-level messages only, 200 new
messages per sync.

## Backend module map

```
packages/trpc/src/router/customers/
├── customers.ts           all procedures (adminProcedure)
├── activity-snapshot.ts   global HogQL snapshot, memoized indexes
├── activity-matrix.ts     per-user × per-day matrix query
├── enrichment.ts          Exa/Claude research + KV result cache
├── batch-research.ts      background research batches
├── research-settings.ts   per-domain auto/manual mode + progress (KV)
├── pinned-domains.ts      team-shared pinned list (KV)
├── slack-tasks.ts         channel matching, history sync, task extraction
└── domain-utils.ts        domain schema, freemail list
```

## Running locally

```bash
bun dev:customers   # app (3005) + api + web (for the sign-in flow)
```

`POSTHOG_PROJECT_ID` must point at production (`264803`) or activity data is
dev-project noise.

| Env var | Required | Purpose |
|---|---|---|
| `POSTHOG_API_KEY` / `POSTHOG_PROJECT_ID` | yes | activity data |
| `ANTHROPIC_API_KEY` | yes | company research, Slack task extraction |
| `EXA_API_KEY` | no | person research (falls back to Claude) |
| `SLACK_CUSTOMERS_TOKEN` | no | Slack task cards (hidden without it) |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | no | shared caches (in-memory fallback) |
| `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WEB_URL` | yes | tRPC endpoint + auth redirects |
