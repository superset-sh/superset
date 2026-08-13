# Admin company dashboard: PostHog insights by reference + live Neon/Stripe business metrics

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from AGENTS.md and the ExecPlan template.

## Purpose / Big Picture

Today the company's canonical metrics live on a PostHog dashboard ("Company Metrics — Success Metrics DB", PostHog dashboard id 1884562 in project 264803). Half of its planned metrics (paid churn, activated→paid conversion, ARPU, multiplayer share, enterprise ARR) are blocked or stale because they depend on PostHog's data-warehouse mirrors of Neon and Stripe, and the Stripe mirror is stale. Separately, the admin app (`apps/admin`, an internal Next.js app) has a partially broken dashboard: its retention card queries a PostHog event (`auth_completed`) that current desktop builds no longer emit, and its Users page fetches every user row with no pagination, which freezes the browser at current user counts.

After this plan is implemented, an authorized teammate opens the admin app and sees one company dashboard that combines: (a) behavioral metrics computed by PostHog (activation funnel, activated-rate cohorts, etc.) fetched live by referencing saved PostHog insight ids, and (b) business metrics (MRR, NRR, churn, ARPU, enterprise ARR) computed directly against the live Neon Postgres database and Stripe. The PostHog dashboard keeps working unchanged — the same saved insights power both surfaces ("data in both places"). The broken admin surfaces (dead retention card, unpaginated users table) are removed outright. The `auth_completed`-based retention surfaces are deleted outright rather than migrated — the mirrored PostHog cohort-retention insight (`l68EUWqk`) supersedes them, and no new analytics event is introduced (see D-4).

## Assumptions

- The PostHog project is 264803 (org Superset), host `us.posthog.com`. Confirmed via the PostHog MCP during planning.
- `packages/trpc/src/router/analytics/analytics.ts` already authenticates to PostHog server-side (it runs HogQL queries today), so credentials/env plumbing for a new "fetch insight results" procedure already exists in that package. The implementer must verify which env var it uses and reuse it.
- The admin app's tRPC context exposes `adminProcedure` (see `packages/trpc/src/router/admin/admin.ts`) that gates on admin users; all new procedures in this plan use it.

## Open Questions

None — all resolved in the Decision Log (D-1 through D-12; decision walkthrough completed 2026-08-12).

## Progress

- [x] (2026-08-12) PostHog cleanup completed as prerequisite work: activation funnel `Es6Yu3Lr` corrected (entrance filter + person-mode modifier), previous-week twin `NCtxWd0y` aligned, activated-rate tile `zGsBNGi3` created, seven orphaned stale activation insights soft-deleted.
- [x] (2026-08-12) `user_signed_up` prototype REVERTED from the working tree per D-4 reversal; `packages/auth` untouched.
- [x] (2026-08-12) Milestone 1: insight-reference plumbing implemented in working tree — `insight-registry.ts`, `fetchInsightResults` in `posthog-client.ts`, `analytics.getInsightResults` procedure; lint + typecheck pass; credential verified live against project 264803 (returned the activation funnel by short_id alone). Snapshots dropped per D-2 reversal. Remaining: commit + PR.
- [x] (2026-08-12) Milestone 2: mirror page built — `business.ts` router (Sigma MRR with graceful unavailable state, Neon churn cohorts / logo retention / signup→paid, ARPU, enterprise-ARR placeholder), ten tile components (InsightTileFrame, PostHogFunnelTile, HogQLLineTile, TrendSeriesTile, RetentionGridTile, MrrTile, ChurnHeatmapTile, LogoRetentionTile, SignupToPaidTile, ArpuTile), page.tsx rewritten as the 1884562 mirror. Registry + AdminInsightKey exported from `@superset/trpc`.
- [x] (2026-08-12) Milestone 3: purge — deleted users page + UsersTable, RetentionCard, WAU/Signups/Revenue/Traffic charts, LeaderboardTable, DemoCountdown, TimeRangePicker, WeekPicker; analytics router reduced to captureEvent/featureFlagPayload/getInsightResults; posthog-client reduced to fetchInsightResults (KV cache layer removed with its last consumer); admin router reduced to setMyPassword (NavUser is its live consumer); sidebar Users link removed. Verified no stragglers reference deleted procedures; trpc + admin typecheck clean.

## Surprises & Discoveries

- Observation: PostHog funnel insights in this project silently break at the anonymous→identified merge boundary unless the query carries `modifiers.personsOnEventsMode = "person_id_override_properties_joined"`.
  Evidence: activation funnel step 3 read 77 without the modifier and 913 with it (2026-08-12); raw SQL joined by `person_id` confirmed 824/828 new users had the full event sequence.
- Observation: `person.properties.created_at` on events reflects the value at ingestion time (person-on-events), so it is empty on pre-signup anonymous events; `person.created_at` (the persons-table column, joined at query time) is the reliable "first seen" field.
- Observation: `admin.listUsers` returns the entire users table with no limit (`packages/trpc/src/router/admin/admin.ts:11`), which is the reported "10k rows blew up the screen" bug.
- Observation: Workspace dev `.env` points `POSTHOG_PROJECT_ID` at a dev PostHog project (264828) where the referenced insights do not exist, so mirror tiles return "insight not found" in local dev; the same `POSTHOG_API_KEY` reads production project 264803 fine (verified live 2026-08-12). Local dev of the dashboard needs `POSTHOG_PROJECT_ID=264803` or tolerance for empty tiles.

## Decision Log

- Decision (D-1): Admin references saved PostHog insights by `short_id` instead of embedding raw HogQL or query JSON in the repo.
  Rationale: Satya wants the data visible in both PostHog and admin, and found raw HogQL painful to maintain. Trade-off accepted: definitions stay mutable in PostHog's UI.
  Date/Author: 2026-08-12 / Satya.
- Decision (D-2, REVERSED): No JSON snapshots. PostHog's activity log stores field-level before/after diffs for every insight edit and was sufficient to fully recover the vandalized dashboard on 2026-08-12; committed snapshots would only add paste-convenience at the cost of files to keep in sync. The two load-bearing query facts live in this plan's Context section and in the insight descriptions inside PostHog.
  Rationale: Satya: "PostHog already has logs, no?" — proven true by that day's recovery.
  Date/Author: 2026-08-12 / Satya.
- Decision (D-3): Business metrics (MRR, NRR, churn, ARPU, enterprise ARR) are computed in admin directly against live Neon and Stripe, not via PostHog's warehouse.
  Rationale: The PostHog warehouse Stripe source is stale and five dashboard tiles are blocked on it; admin already has DB access and these metrics are relational by nature.
  Date/Author: 2026-08-12 / Satya + agent.
- Decision (D-4, REVERSED): Do NOT ship `user_signed_up`. The prototype was reverted from the working tree; no new analytics event is introduced by this plan. The dead-`auth_completed` consumers (analytics router procedures + admin RetentionCard) are deleted in Milestone 3, superseded by the referenced `l68EUWqk` cohort-retention insight in the dashboard mirror.
  Rationale: The corrected funnel made the event unnecessary for activation, and Satya decided against adding it; retention already has a working PostHog-computed source in the canonical tile set.
  Date/Author: 2026-08-12 / Satya (earlier "good hygiene" approval explicitly withdrawn).
- Decision (D-5): Activation is defined as "created real workspaces (event `workspace_created` with property `type != main`) on ≥2 distinct days within 7 days of first workspace".
  Rationale: Retention-validated on the 2026-06/07 cohort: 66% W4–6 retention with the behavior vs 24% without, 76% recall of eventually-retained users; single repeated value action (not a blended activity metric).
  Date/Author: 2026-08-12 / Satya + agent.
- Decision (D-6): Scrap-and-fix rather than rebuild the whole admin app; the dashboard page is a thin shell (172 lines) and most components are reusable.
  Date/Author: 2026-08-12 / Satya ("we can scrap a lot of the stuff we had").
- Decision (D-7): The admin dashboard's chart set is exactly the tile set of PostHog dashboard 1884562 ("Company Metrics — Success Metrics DB") — a one-to-one mirror, not a curated subset. Event-based tiles are fetched by insight reference; warehouse-backed revenue tiles are re-implemented live against Neon/Stripe; the three placeholder tiles become real implementations in admin.
  Rationale: One canonical metric set, visible in both surfaces; no drift about "which charts matter".
  Date/Author: 2026-08-12 / Satya ("the charts we're honing in on should be the set in the dashboard").
- Decision (D-9): `getInsightResults` uses `refresh=blocking` with no app-side cache — PostHog's own result cache and refresh throttle are the caching layer; the admin client uses React Query `staleTime` (10 min) to avoid redundant calls.
  Rationale: Satya's sanity check during the decision walkthrough: PostHog already maintains the cache, so a server-side cache would duplicate it for zero correctness gain.
  Date/Author: 2026-08-12 / Satya.
- Decision (D-10): Dollar metrics come from Stripe's own MRR machinery via Sigma — the Stripe-authored MRR template (subscription_item_change_events, FX, proration) is saved as a daily scheduled Sigma query, and admin fetches the latest completed run via `GET /v1/sigma/scheduled_query_runs` and parses the CSV. Counts, churn cohorts, and org joins come from Neon `subscriptions`. ARPU = Sigma MRR ÷ Neon active seats.
  Rationale: Satya anchored on the Stripe dashboard MRR report; consuming its exact template guarantees admin matches it 1:1 instead of approximating with our own invoice math. Prerequisite to verify in Milestone 2: Sigma subscription active on the account and reporting permission on the server API key; fallback if Sigma is unavailable is invoice-based computation (explicitly worse — record a new decision if it comes to that).
  Date/Author: 2026-08-12 / Satya.
- Decision (D-11): Full stale-code purge of `apps/admin`, not just the non-mirror charts. Default is delete: every route, component, and tRPC procedure not consumed by the mirrored dashboard (Milestone 2) survives only if someone names a reason in the PR. Known deletions: WAUTrendChart, SignupsTrendChart, RevenueTrendChart, TrafficSourcesChart, LeaderboardTable, DemoCountdown, RetentionCard, and the `auth_completed`/`getActivationFunnel`/`getMarketingFunnel` procedures.
  Rationale: Satya: "delete all non-mirror, in fact delete all stale admin code — many pages are wholly unused / unuseful." Anything missed gets re-added canonically (PostHog dashboard first, then mirrored).
  Date/Author: 2026-08-12 / Satya.
- Decision (D-12): The Users page is deleted, not paginated — `apps/admin/src/app/(dashboard)/users/` and its sole-consumer procedures (`admin.listUsers`, `admin.deleteUser`) go in the D-11 purge. `admin.setMyPassword` survives only if the audit finds a live consumer.
  Rationale: Satya: "just delete it, I think it's unused." The unbounded-findMany bug becomes moot.
  Date/Author: 2026-08-12 / Satya.
- Decision (D-8): Admin-only access via the existing `adminProcedure` gate; no sharing path in this plan. Investors get PostHog share links or exports when needed.
  Rationale: Zero extra auth work and zero leak surface on an internal tool; nothing in the design blocks adding a read-only route later.
  Date/Author: 2026-08-12 / Satya.
- Decision (D-13): Charts are shadcn/ui chart primitives (`@superset/ui/chart`) over Recharts 2.15.4 — the stack every existing admin chart (including `FunnelChart`) already uses. PostHog's charting is open source but not packaged (Chart.js embedded with kea/LemonUI), so we borrow its visual language (muted series palette, tooltip layout, funnel step labels) rather than its code. The retention cohort triangle and churn survival heatmap render as CSS-grid colored tables, not Recharts — same as PostHog renders them.
  Rationale: Satya's first preference was PostHog's own charting library, but it is not packaged — their in-app charts are Chart.js under app-internal wrappers. shadcn/Recharts is the fallback he approved, and it turns out to be PostHog's own recommended pattern for rendering their insight data externally: their official example repo `PostHog/posthog-shadcn-charts-example` demonstrates exactly this (use it as the Milestone 2 implementation reference). Chart.js via react-chartjs-2 stays the reserve option if a tile ever needs PostHog-identical rendering.
  Date/Author: 2026-08-12 / Satya + agent (clarified: "their charting library, not their look").
- Decision (D-14): No global date-range picker in v1 — each tile renders at its insight's canonical saved range, exactly like the PostHog dashboard (TimeRangePicker/WeekPicker die in the D-11 purge). Range changes are definition changes and happen in PostHog (then snapshot-refreshed), not per-viewer.
  Rationale: Keeps "the definition lives in the insight" true; per-viewer overrides would reintroduce a second place numbers can diverge.
  Date/Author: 2026-08-12 / agent, following from D-1/D-7.

## Outcomes & Retrospective

Shipped in PR #6410 (all three milestones, same day as planning). The admin dashboard is now the 1884562 mirror: eight insight-referenced product tiles, live Neon business metrics, Sigma-backed MRR with an explicit unavailable state pending one-time Sigma setup (enable + save Stripe's MRR template as scheduled query "admin-mrr"). Net −738 lines: the purge removed more than the mirror added. Notable divergences from the original draft, all user-directed and logged: no `user_signed_up` event (D-4 reversed), no JSON snapshots (D-2 reversed — activity log is the restore path), users page deleted rather than paginated (D-12), registry lives in `packages/trpc` not `apps/admin` (import direction). Lessons: person-on-events semantics bit three separate times (funnel engine, event-time person properties, `toDateTime` parsing) — the load-bearing facts are recorded in Context and in the PostHog insight descriptions; and "reference by id" turned out to need exactly one id per tile at runtime, validating the thin-proxy design. Remaining follow-ups: enable Sigma (Satya, Stripe dashboard), dollar-NRR as a second Sigma query if wanted, and the project-wide sweep of other cross-boundary funnels in PostHog.

## Context and Orientation

Affected apps and packages: `apps/admin` (internal Next.js admin app) and `packages/trpc` (shared tRPC routers; "tRPC" is the typed RPC layer both web and admin call). No changes to `packages/auth` (see D-4 reversal).

Key existing files:

- `packages/trpc/src/router/analytics/analytics.ts` — existing PostHog-querying procedures; three references to the dead `auth_completed` event at lines 124, 235, 329 (deleted in Milestone 3).
- `packages/trpc/src/router/admin/admin.ts` — `listUsers` (unpaginated, the bug), `deleteUser`, `setMyPassword`.
- `apps/admin/src/app/(dashboard)/page.tsx` — dashboard shell; components under `apps/admin/src/app/(dashboard)/components/` (MetricCard, FunnelChart, RetentionCard, WAUTrendChart, RevenueTrendChart, SignupsTrendChart, LeaderboardTable, TrafficSourcesChart, TimeRangePicker, WeekPicker, DemoCountdown).
- `apps/admin/src/app/(dashboard)/users/components/UsersTable/UsersTable.tsx` — renders `admin.listUsers` into a table with no pagination.

PostHog facts the implementer must not lose (the "two load-bearing query facts" from D-2):

1. Any funnel whose steps cross the anonymous→identified boundary MUST carry `modifiers: { personsOnEventsMode: "person_id_override_properties_joined" }` in its `FunnelsQuery`. Without it, PostHog aggregates on the raw ingestion-time person id and the funnel collapses at the sign-in step.
2. "New user" gating uses the HogQL property filter `person.created_at >= now() - INTERVAL 14 DAY` (21 days for the previous-week funnel) on the entrance step. `person.created_at` is the persons-table first-seen timestamp joined at query time; it retroactively excludes veterans whose fresh-device identities later merge into an old person. Do not substitute `person.properties.created_at`, which is ingestion-time and empty on anonymous events.

The canonical chart set is the tile set of PostHog dashboard 1884562 (D-7). Source mapping, per tile (PostHog project 264803; short_ids live and correct as of 2026-08-12):

Insight-referenced in admin (event-based; fetched via `getInsightResults`):

- `Es6Yu3Lr` (id 9164042) — "New-user activation — this week (last 7d)", the corrected 6-step funnel.
- `zGsBNGi3` (id 10985318) — "Activated — W1 repeat workspace creators (weekly cohorts)", the D-5 activation-rate tile.
- `l68EUWqk` — "Cohort Retention" (weekly retention on `workspace_created`).
- `Kw6Kwwip` — "Workspaces per user by percentile — last 7 days".
- `crHk64hw` — "p50/p90 workspaces created per user per week".
- `dF6CnJ8m` — "New site visitors — daily (first-time)".
- `2LtmVxFY` — "Pageview → Download CTR — Mac visitors (weekly trend)".
- `IlEQoT55` — "Active Organizations with 2+/5+ Users" (HogQL joining events to the warehouse's Neon mirror; referenced rather than rebuilt because the Neon mirror is current, unlike the Stripe one).

Re-implemented live in admin against Neon/Stripe (replacing stale-warehouse tiles and placeholders):

- `zjqYXl1N` "Recurring revenue — monthly recognized" and `uJv3GdAE` "NRR — monthly" → live Stripe-backed procedures (the PostHog versions read the stale Stripe mirror).
- `DhKKxIJx` "Paid churn — cohort survival heatmap" → live Neon `subscriptions` query.
- The three placeholders `veHqMB5A` (activated→paid), `wQpHYjlf` (ARPU), `TO8d4iH9` (enterprise ARR) → real implementations, which is the whole reason they were blocked in PostHog.

Not in scope for admin (stays PostHog-only): `NCtxWd0y` (id 9164443), the previous-week funnel twin on dashboard 1618640 — not part of the 1884562 set. `M0b9ZAuq` is a soft-deleted desktop-only funnel; listed only so nobody resurrects it by accident.

## Plan of Work

### Milestone 1: Insight-reference plumbing

Add one tRPC procedure to `packages/trpc/src/router/analytics/analytics.ts`: `getInsightResults`, an `adminProcedure` taking `{ shortId: string }` (validate against an allowlist imported from the registry file, below — never proxy arbitrary ids). It calls PostHog's REST API `GET https://us.posthog.com/api/projects/264803/insights/?short_id=<shortId>&refresh=blocking` with the same server-side credential the file already uses for HogQL and returns the first result's `result` field plus `name` and `last_refresh`. No app-side cache (D-9): PostHog maintains the result cache and throttles recomputation itself (`refresh=blocking` serves its cache when fresh; `next_allowed_client_refresh` gates recompute to ~15 min), so the procedure is a thin proxy. The admin client sets React Query `staleTime` of 10 minutes on these hooks so route changes don't re-fire the eight insight calls; a cold load where PostHog recomputes a funnel takes a few seconds, same as the PostHog UI.

The registry lives at `packages/trpc/src/router/analytics/insight-registry.ts` (not `apps/admin` — the procedure validates against it and packages cannot import from apps): an exported const mapping semantic keys (`activationFunnel`, `activatedRate`, `cohortRetention`, `workspacePercentiles`, `workspacesPerCreator`, `newSiteVisitors`, `downloadCtrMac`, `activeOrgs`) to the eight short_ids from Context. The procedure takes the semantic key, so the allowlist holds by construction. No snapshots (D-2 reversed): recovery from bad insight edits is PostHog's activity log.

### Milestone 2: Admin company dashboard page

Rework `apps/admin/src/app/(dashboard)/page.tsx` to mirror PostHog dashboard 1884562 tile-for-tile (D-7), in the same order, split visually into "Product" and "Business" sections. Product renders the eight registry insights via `getInsightResults`, using shadcn/ui chart primitives over Recharts throughout (D-13): the activation funnel through the existing `FunnelChart` component (it currently renders `getActivationFunnel` output; adapt its props to the PostHog funnel-result shape: an array of steps each with `name`, `count`, `average_conversion_time`), the retention insight and churn heatmap as CSS-grid colored tables (no chart lib), and the remaining trend/SQL tiles through line/area charts following `WAUTrendChart`. Every tile renders at its insight's saved date range — no global range picker (D-14). Business renders live metrics as new `adminProcedure`s in a new `packages/trpc/src/router/analytics/business.ts`. MRR comes from Stripe Sigma (D-10): save Stripe's own MRR report template (the "total monthly recurring revenue" Sigma template — subscription_item_change_events_v2_beta with FX conversion; copy it verbatim from the Stripe dashboard MRR report) as a daily scheduled Sigma query named `admin-mrr`, and implement `business.getMrr` to list `sigma/scheduled_query_runs`, take the newest with `status: "completed"` and title `admin-mrr`, download its `file` from `https://files.stripe.com/v1/files/{id}/contents` with the secret key, and parse the CSV (month_end, total_mrr_in_usd). First task in this milestone: verify Sigma is active on the Stripe account and the server key has reporting permission; if not, stop and log a new decision before falling back to invoice math. NRR and paid-churn cohort survival come from Neon `subscriptions` via the Drizzle schema in `packages/db/src/schema/` (port the shape of the PostHog churn-heatmap SQL). Then the first-real-versions of the three placeholder metrics: activated→paid conversion (join `user_signed_up`/activation cohort to `subscriptions`), ARPU (MRR ÷ active seats), and enterprise ARR (blocked on an `enterprise_contracts` table — if it still does not exist, render the tile with an explicit "not yet tracked" state rather than dropping it, so the mirror stays one-to-one). Every business procedure takes an explicit date range and has a `LIMIT`; none may return unbounded rows.

### Milestone 3: Scrap and fix broken admin surfaces

Delete the `auth_completed`-based surfaces outright: the three consuming procedures in `packages/trpc/src/router/analytics/analytics.ts` (references at lines 124, 235, 329) and `apps/admin/src/app/(dashboard)/components/RetentionCard/RetentionCard.tsx`. They query an event current builds no longer emit, so their numbers decay week over week; retention in the mirror is served by the referenced `l68EUWqk` cohort-retention insight instead (D-4 reversal). Delete the Users page entirely (D-12): remove `apps/admin/src/app/(dashboard)/users/` and the now-unconsumed `admin.listUsers` and `admin.deleteUser` procedures in `packages/trpc/src/router/admin/admin.ts`; keep `admin.setMyPassword` only if the audit finds a live consumer. Then run the D-11 purge: enumerate every route under `apps/admin/src/app`, every component under `apps/admin/src/app/(dashboard)/components/`, and every procedure in `packages/trpc/src/router/admin` and `packages/trpc/src/router/analytics` — anything not consumed by the Milestone 2 mirror is deleted by default (known list in D-11 and D-12), and the deletion PR names each removed file so survivors are deliberate, not accidental.

## Concrete Steps

    # Milestone 1 sanity check (any shell with a PostHog personal API key)
    curl -s "https://us.posthog.com/api/projects/264803/insights/?short_id=Es6Yu3Lr" \
      -H "Authorization: Bearer $POSTHOG_API_KEY" | head -c 400
    # Expected: JSON containing "name": "[Completed] New-user activation — this week (last 7d)"

## Validation and Acceptance

Milestones 1–2: run `bun dev`, open the admin app, load the dashboard. The Product section shows the activation funnel with step counts within a few percent of the PostHog dashboard tile (same insight, cached ≤15 min), and the Business section shows MRR/NRR matching the PostHog SQL tiles for overlapping months. `bun run typecheck`, `bun run lint`, `bun test` all pass.

Milestone 3: the Users page, RetentionCard, non-mirror charts, and their procedures are gone (deletion PR lists every removed file); the admin app builds and the dashboard mirror is the only surface left, with retention shown by the referenced `l68EUWqk` tile.

## Idempotence and Recovery

All milestones are additive-then-subtractive: new procedures land alongside old ones, admin pages switch consumers, then dead procedures are deleted in a separate commit. If a referenced PostHog insight is edited or broken in the PostHog UI, recover the prior definition from PostHog's activity log (Activity in the PostHog UI, or the MCP `advanced-activity-logs-list` tool with `scopes: ["Insight"]` and the insight's numeric id — entries carry full before/after query diffs) and apply it via `insight-update` / REST `PATCH /api/projects/264803/insights/:id`.

## Interfaces and Dependencies

New tRPC procedures (all `adminProcedure`, object-signature inputs per AGENTS.md): `analytics.getInsightResults({ shortId })` returning `{ name: string; lastRefresh: string; result: unknown }`; `business.getRevenueTrend({ from, to })`, `business.getNrr({ from, to })`, `business.getChurnCohorts({ months })`, `business.getActivatedToPaid({ from, to })`, `business.getArpu({ from, to })`; Dependencies: none new — reuse `packages/ui` and the existing admin chart components.

---

Revision note (2026-08-12): D-7 resolved — Satya decided the admin chart set is exactly the tile set of PostHog dashboard 1884562. Expanded the insight registry from three curated insights to the full eight event-based tiles, mapped every 1884562 tile to its admin source (reference vs live rebuild), rescoped Milestone 3 to a one-to-one mirror including "not yet tracked" states for placeholders, and dropped the previous-week funnel comparison card (its insight lives on dashboard 1618640, outside the canonical set).

Revision note 3 (2026-08-12): D-2 REVERSED at Satya's direction — no committed JSON snapshots; PostHog's activity log (which fully recovered the dashboard that same morning) is the restore mechanism. Milestone 1 implemented: registry lives in `packages/trpc` (not `apps/admin`, which cannot be imported by packages) and the procedure takes a semantic key so the allowlist holds by construction; credential verified against production; dev-project caveat recorded in Surprises & Discoveries.

Revision note 2 (2026-08-12): D-4 REVERSED at Satya's direction — `user_signed_up` is dropped entirely. The uncommitted `packages/auth` prototype was reverted from the working tree, the shipping milestone was removed (remaining milestones renumbered 1–3), and the `auth_completed` consumers are now deleted in Milestone 3 (superseded by the referenced `l68EUWqk` cohort-retention insight) instead of migrated to a new event.

Revision note 4 (2026-08-12): D-10 mechanism upgraded after Satya bought Sigma — Stripe's Query Run API (`POST /v2/data/reporting/query_runs`, Stripe-Version 2026-04-22.preview) executes the MRR template on demand, replacing the dashboard-managed scheduled query entirely (none exists; the "admin-mrr" title contract is dead). getMrr embeds the template SQL, caches in-process for 12h, and dedupes concurrent callers onto one in-flight run. Verified live against production: July 2026 MRR $14,510, matching the dashboard chart. The Reporting API v1 catalog (159 report types) contains no MRR type — the dashboard report itself has no direct API.
