import { db } from "@superset/db/client";
import type { TRPCRouterRecord } from "@trpc/server";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { env } from "../../env";
import { adminProcedure } from "../../trpc";

// Business metrics for the admin company dashboard. Dollar figures come from
// Stripe's own Sigma MRR machinery (D-10); counts, cohorts, and org joins come
// from Neon subscriptions. Metrics whose source is not yet configured return
// { available: false } so tiles render an explicit state instead of breaking.

// Stripe's own MRR report SQL (the Sigma template behind the dashboard MRR
// chart), executed on demand via the Query Run API — no dashboard scheduled
// query involved. Requires an active Sigma subscription; a full secret key or
// a restricted key with reporting_write + sigma_api_write.
const STRIPE_QUERY_RUN_VERSION = "2026-04-22.preview";

const MRR_SQL = `-- This template returns total monthly recurring revenue
WITH sparse_mrr_changes AS (
  SELECT
    DATE_TRUNC('day', DATE(local_event_timestamp)) AS date,
    currency,
    SUM(mrr_change) AS mrr_change_on_day
  FROM subscription_item_change_events_v2_beta
  GROUP BY 1, 2
),
sparse_mrrs AS (
  SELECT
    date,
    currency,
    mrr_change_on_day,
    SUM(mrr_change_on_day) OVER (PARTITION BY currency ORDER BY date ASC) AS mrr
  FROM sparse_mrr_changes
  ORDER BY currency, date DESC
),
fx AS (
  SELECT
    date - INTERVAL '1' DAY AS date,
    cast(JSON_PARSE(buy_currency_exchange_rates) AS MAP(VARCHAR, DOUBLE)) AS rate_per_usd
  FROM exchange_rates_from_usd
),
currencies AS (
  SELECT DISTINCT(currency) FROM subscription_item_change_events_v2_beta
),
date_currency AS (
  SELECT date, rate_per_usd, currency
  FROM fx CROSS JOIN currencies
  ORDER BY date, currency
),
date_currency_mrr AS (
  SELECT
    dpc.date,
    dpc.currency,
    dpc.rate_per_usd,
    mrr_change_on_day,
    mrr AS _mrr,
    LAST_VALUE(mrr) IGNORE NULLS OVER (
      PARTITION BY dpc.currency
      ORDER BY dpc.date ASC
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS mrr
  FROM date_currency dpc
  LEFT JOIN sparse_mrrs sm on dpc.date = sm.date AND dpc.currency = sm.currency
),
daily_mrrs_pre_fx AS (
  SELECT date, currency, rate_per_usd, SUM(mrr) AS mrr
  FROM date_currency_mrr
  GROUP BY 1, 2, 3
  ORDER BY date DESC
),
daily_mrrs AS (
  SELECT
    date,
    SUM(ROUND(mrr / rate_per_usd [currency] * rate_per_usd ['usd'])) AS total_mrr_in_usd_minor_units
  FROM daily_mrrs_pre_fx
  GROUP BY 1
),
months AS (
  SELECT date_col - (INTERVAL '1' DAY) AS month_end
  FROM UNNEST(
    SEQUENCE(
      CAST(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01') AS date) - INTERVAL '24' MONTH,
      CURRENT_DATE,
      INTERVAL '1' MONTH
    )
  ) t (date_col)
),
monthly_mrrs AS (
  SELECT
    month_end,
    DECIMALIZE_AMOUNT_NO_DISPLAY('usd', dm.total_mrr_in_usd_minor_units, 2) AS total_mrr_in_usd
  FROM months m
  LEFT JOIN daily_mrrs dm ON m.month_end = dm.date
  ORDER BY month_end DESC
)
SELECT * FROM monthly_mrrs`;

interface MrrPoint {
	monthEnd: string;
	mrrUsd: number;
}

type MrrResult =
	| { available: true; dataLoadTime: string | null; points: MrrPoint[] }
	| { available: false; reason: string };

interface QueryRun {
	id: string;
	status: string;
	result: { file?: { download_url?: { url?: string } } } | null;
	error?: { message?: string };
}

function stripeHeaders() {
	return {
		Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
		"Stripe-Version": STRIPE_QUERY_RUN_VERSION,
	};
}

function parseMrrCsv(csv: string): MrrPoint[] {
	const [header, ...rows] = csv.trim().split("\n");
	const columns = (header ?? "").split(",").map((c) => c.replaceAll('"', ""));
	const monthIndex = columns.indexOf("month_end");
	const mrrIndex = columns.indexOf("total_mrr_in_usd");
	if (monthIndex === -1 || mrrIndex === -1) return [];
	return rows
		.map((row) => {
			const cells = row.split(",").map((c) => c.replaceAll('"', ""));
			return {
				monthEnd: cells[monthIndex] ?? "",
				mrrUsd: Number(cells[mrrIndex] ?? Number.NaN),
			};
		})
		.filter((p) => p.monthEnd && Number.isFinite(p.mrrUsd))
		.sort((a, b) => a.monthEnd.localeCompare(b.monthEnd));
}

// Sigma data refreshes ~daily and the query takes ~30-60s, so results are
// cached in-process for 12h. Requests never block on a running query: the
// first caller kicks off a run and gets { available: false } immediately;
// later calls (the tile re-polls) check the same pending run until it lands.
const MRR_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MRR_COMPUTING_REASON = "computing";
let mrrCache: { fetchedAt: number; result: MrrResult } | null = null;
let mrrPendingRunId: string | null = null;

async function createMrrRun(): Promise<MrrResult | { runId: string }> {
	const createResponse = await fetch(
		"https://api.stripe.com/v2/data/reporting/query_runs",
		{
			method: "POST",
			headers: { ...stripeHeaders(), "Content-Type": "application/json" },
			body: JSON.stringify({ sql: MRR_SQL }),
		},
	);
	const created = (await createResponse.json()) as QueryRun;
	if (!createResponse.ok || !created.id) {
		return {
			available: false,
			reason:
				created.error?.message ??
				`Sigma query create failed (${createResponse.status})`,
		};
	}
	return { runId: created.id };
}

async function collectMrrRun(runId: string): Promise<MrrResult | null> {
	const response = await fetch(
		`https://api.stripe.com/v2/data/reporting/query_runs/${runId}`,
		{ headers: stripeHeaders() },
	);
	const run = (await response.json()) as QueryRun;
	if (run.status === "running") return null;

	const downloadUrl = run.result?.file?.download_url?.url;
	if (run.status !== "succeeded" || !downloadUrl) {
		return { available: false, reason: `Sigma query ${run.status}` };
	}
	const csv = await (await fetch(downloadUrl)).text();
	const points = parseMrrCsv(csv);
	if (!points.length) {
		return { available: false, reason: "unexpected Sigma CSV columns" };
	}
	return { available: true, dataLoadTime: new Date().toISOString(), points };
}

async function fetchLatestSigmaMrr(): Promise<MrrResult> {
	if (!env.STRIPE_SECRET_KEY) {
		return { available: false, reason: "STRIPE_SECRET_KEY not configured" };
	}
	if (
		mrrCache &&
		Date.now() - mrrCache.fetchedAt < MRR_CACHE_TTL_MS &&
		mrrCache.result.available
	) {
		return mrrCache.result;
	}

	if (mrrPendingRunId) {
		const finished = await collectMrrRun(mrrPendingRunId);
		if (!finished) {
			return { available: false, reason: MRR_COMPUTING_REASON };
		}
		mrrPendingRunId = null;
		mrrCache = { fetchedAt: Date.now(), result: finished };
		return finished;
	}

	const kicked = await createMrrRun();
	if (!("runId" in kicked)) return kicked;
	mrrPendingRunId = kicked.runId;
	return { available: false, reason: MRR_COMPUTING_REASON };
}

export const businessRouter = {
	getMrr: adminProcedure.query(() => fetchLatestSigmaMrr()),

	// Cohort survival: % of subscriptions started in a month still active k
	// months later. Neon is authoritative for subscription state (D-10).
	getChurnCohorts: adminProcedure
		.input(z.object({ months: z.number().min(3).max(24).default(7) }))
		.query(async ({ input }) => {
			const result = await db.execute<{
				cohort_month: string;
				month_offset: number;
				cohort_size: number;
				surviving_pct: number;
			}>(sql`
				WITH subs AS (
					SELECT created_at, ended_at, date_trunc('month', created_at) AS cohort
					FROM subscriptions
					WHERE status != 'incomplete' AND plan != 'enterprise'
						AND created_at >= date_trunc('month', now()) - make_interval(months => ${input.months})
				)
				SELECT
					to_char(cohort, 'YYYY-MM') AS cohort_month,
					k.k AS month_offset,
					count(*)::int AS cohort_size,
					round(
						100.0 * count(*) FILTER (
							WHERE ended_at IS NULL OR ended_at >= created_at + make_interval(months => k.k)
						) / count(*),
						1
					)::float AS surviving_pct
				FROM subs
				CROSS JOIN generate_series(0, ${input.months}) AS k(k)
				WHERE created_at + make_interval(months => k.k) <= now()
				GROUP BY cohort_month, k.k
				ORDER BY cohort_month, k.k
			`);
			return result.rows;
		}),

	// Logo retention: % of orgs subscribed at the end of month m still
	// subscribed at the end of m+1. Count-based — dollar NRR needs a second
	// Sigma query and is intentionally out of scope here.
	getLogoRetention: adminProcedure
		.input(z.object({ months: z.number().min(3).max(24).default(8) }))
		.query(async ({ input }) => {
			const result = await db.execute<{
				month: string;
				base_orgs: number;
				retained_orgs: number;
				retention_pct: number | null;
			}>(sql`
				WITH months AS (
					-- one month past the last base month, so base month m can find
					-- its m+1 rows in the join
					SELECT generate_series(
						date_trunc('month', now()) - make_interval(months => ${input.months}),
						date_trunc('month', now()) - make_interval(months => 1),
						interval '1 month'
					) AS m
				),
				active AS (
					SELECT months.m AS m, s.reference_id
					FROM months
					JOIN subscriptions s
						ON s.created_at < months.m + interval '1 month'
						AND (s.ended_at IS NULL OR s.ended_at >= months.m + interval '1 month')
						AND s.status != 'incomplete'
						AND s.plan != 'enterprise'
					GROUP BY months.m, s.reference_id
				)
				SELECT
					to_char(b.m, 'YYYY-MM') AS month,
					count(*)::int AS base_orgs,
					count(n.reference_id)::int AS retained_orgs,
					round(100.0 * count(n.reference_id) / nullif(count(*), 0), 1)::float AS retention_pct
				FROM active b
				LEFT JOIN active n
					ON n.reference_id = b.reference_id AND n.m = b.m + interval '1 month'
				WHERE b.m <= date_trunc('month', now()) - make_interval(months => 2)
				GROUP BY b.m
				ORDER BY b.m
			`);
			return result.rows;
		}),

	// Signup -> paid within 30d, weekly signup cohorts. Per-user facts in Neon;
	// cohorts younger than 30d are excluded (window incomplete).
	getSignupToPaid: adminProcedure
		.input(z.object({ weeks: z.number().min(4).max(26).default(12) }))
		.query(async ({ input }) => {
			const result = await db.execute<{
				cohort_week: string;
				signups: number;
				converted: number;
				conversion_pct: number | null;
			}>(sql`
				WITH cohort AS (
					SELECT u.id, u.created_at
					FROM auth.users u
					WHERE u.created_at >= date_trunc('week', now()) - make_interval(weeks => ${input.weeks})
						-- whole weeks only: every member must have a complete 30d window
						AND date_trunc('week', u.created_at) + interval '7 days' <= now() - interval '30 days'
				)
				SELECT
					to_char(date_trunc('week', c.created_at), 'YYYY-MM-DD') AS cohort_week,
					count(*)::int AS signups,
					count(*) FILTER (
						WHERE EXISTS (
							SELECT 1
							FROM auth.members m
							JOIN subscriptions s ON s.reference_id = m.organization_id
							WHERE m.user_id = c.id
								AND s.status IN ('active', 'past_due')
								AND s.created_at BETWEEN c.created_at AND c.created_at + interval '30 days'
						)
					)::int AS converted,
					round(
						100.0 * count(*) FILTER (
							WHERE EXISTS (
								SELECT 1
								FROM auth.members m
								JOIN subscriptions s ON s.reference_id = m.organization_id
								WHERE m.user_id = c.id
									AND s.status IN ('active', 'past_due')
									AND s.created_at BETWEEN c.created_at AND c.created_at + interval '30 days'
							)
						) / nullif(count(*), 0),
						1
					)::float AS conversion_pct
				FROM cohort c
				GROUP BY 1
				ORDER BY 1
			`);
			return result.rows;
		}),

	// ARPU = latest Sigma MRR / active paid seats in Neon. Unavailable until
	// the Sigma query exists.
	getArpu: adminProcedure.query(async () => {
		const mrr = await fetchLatestSigmaMrr();
		if (!mrr.available) {
			return { available: false as const, reason: mrr.reason };
		}
		const latest = mrr.points.at(-1);
		if (!latest) {
			return { available: false as const, reason: "Sigma MRR has no rows" };
		}

		const result = await db.execute<{ seats: number }>(sql`
			SELECT coalesce(sum(coalesce(seats, 1)), 0)::int AS seats
			FROM subscriptions
			WHERE status = 'active' AND plan != 'enterprise'
		`);
		const seats = result.rows[0]?.seats ?? 0;
		return {
			available: true as const,
			monthEnd: latest.monthEnd,
			mrrUsd: latest.mrrUsd,
			activeSeats: seats,
			arpuUsd: seats > 0 ? latest.mrrUsd / seats : null,
		};
	}),

	// Explicit not-yet-tracked state so the dashboard mirror stays one-to-one
	// with the PostHog placeholder tile (D-7).
	getEnterpriseArr: adminProcedure.query(() => ({
		available: false as const,
		reason: "enterprise contracts are not tracked in Neon yet",
	})),
} satisfies TRPCRouterRecord;
