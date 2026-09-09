import { db } from "@superset/db/client";
import type { TRPCRouterRecord } from "@trpc/server";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { env } from "../../env";
import {
	claimMetricCache,
	clearMetricCache,
	isMetricCacheAvailable,
	readMetricCache,
	writeMetricCache,
} from "../../lib/metric-cache";
import { adminProcedure } from "../../trpc";

// Business metrics for the admin company dashboard. Dollar figures come from
// Stripe's own Sigma MRR machinery (D-10); counts, cohorts, and org joins come
// from Neon subscriptions. Metrics whose source is not yet configured return
// { available: false } so tiles render an explicit state instead of breaking.

// Stripe's own MRR report SQL (the Sigma template behind the dashboard MRR
// chart), executed on demand via the Query Run API — no dashboard scheduled
// query involved. Requires an active Sigma subscription; a full secret key or
// a restricted key with reporting_write + sigma_api_write.
//
// Deviates from the template in one place. The template's date spine is
// exchange_rates_from_usd, which lands a day late and is then shifted back
// another day, so the series stopped two days short of today even though the
// subscription events behind it were current — the tile read as stuck. The
// spine now runs to whichever of the two sources is newer, carrying the last
// known rates forward across the days FX has not landed yet. It starts at the
// first subscription change rather than at the first FX rate: SEQUENCE caps at
// 10k elements and the FX table reaches back to 2010, which would have walked
// the query into a hard failure some years out for rows that are all zero MRR.
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
sparse_fx AS (
  SELECT
    date - INTERVAL '1' DAY AS date,
    cast(JSON_PARSE(buy_currency_exchange_rates) AS MAP(VARCHAR, DOUBLE)) AS rate_per_usd
  FROM exchange_rates_from_usd
),
fx AS (
  SELECT
    spine.date,
    LAST_VALUE(sparse_fx.rate_per_usd) IGNORE NULLS OVER (
      ORDER BY spine.date ASC
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS rate_per_usd
  FROM UNNEST(SEQUENCE(
    (SELECT MIN(date) FROM sparse_mrr_changes),
    (SELECT GREATEST(
      (SELECT MAX(date) FROM sparse_fx),
      (SELECT CAST(MAX(date) AS TIMESTAMP) FROM sparse_mrr_changes)
    )),
    INTERVAL '1' DAY
  )) AS spine(date)
  LEFT JOIN sparse_fx ON sparse_fx.date = spine.date
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
daily_mrr_series AS (
  SELECT
    date AS day,
    DECIMALIZE_AMOUNT_NO_DISPLAY('usd', total_mrr_in_usd_minor_units, 2) AS total_mrr_in_usd
  FROM daily_mrrs
  WHERE date >= CURRENT_DATE - INTERVAL '180' DAY
  ORDER BY date
),
data_freshness AS (
  SELECT TO_ISO8601(MAX(event_timestamp)) AS data_through
  FROM subscription_item_change_events_v2_beta
)
SELECT daily_mrr_series.*, data_freshness.data_through
FROM daily_mrr_series CROSS JOIN data_freshness`;

interface MrrPoint {
	date: string;
	mrrUsd: number;
}

type MrrResult =
	| {
			available: true;
			/** When we ran the query. */
			dataLoadTime: string | null;
			/** When Sigma's data actually ends — hours behind dataLoadTime. */
			dataThrough: string | null;
			points: MrrPoint[];
	  }
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

function parseMrrCsv(csv: string): {
	points: MrrPoint[];
	dataThrough: string | null;
} {
	const [header, ...rows] = csv.trim().split("\n");
	const columns = (header ?? "").split(",").map((c) => c.replaceAll('"', ""));
	const dayIndex = columns.indexOf("day");
	const mrrIndex = columns.indexOf("total_mrr_in_usd");
	const throughIndex = columns.indexOf("data_through");
	if (dayIndex === -1 || mrrIndex === -1) {
		return { points: [], dataThrough: null };
	}
	// One value for the whole run, repeated on every row by the CROSS JOIN.
	// event_timestamp is UTC and TO_ISO8601 leaves the offset off, so pin it
	// rather than let the reader guess a zone.
	const through = (rows[0]?.split(",")[throughIndex] ?? "").replaceAll('"', "");
	const points = rows
		.map((row) => {
			const cells = row.split(",").map((c) => c.replaceAll('"', ""));
			return {
				// Sigma emits "2026-08-04 00:00:00.000"; keep the date only
				date: (cells[dayIndex] ?? "").slice(0, 10),
				mrrUsd: Number(cells[mrrIndex] ?? Number.NaN),
			};
		})
		.filter((p) => p.date && Number.isFinite(p.mrrUsd))
		.sort((a, b) => a.date.localeCompare(b.date));
	return { points, dataThrough: through ? `${through}Z` : null };
}

// Sigma data refreshes ~daily and the query takes ~30-60s, so results are
// cached for 12h. Requests never block on a running query: the first caller
// kicks off a run and gets { available: false } immediately; later calls (the
// tile re-polls, or the refresh job) check the same pending run until it lands.
//
// Cache and pending-run handle both live in Redis. In-process they were per
// instance, so a poll rarely found the run its predecessor started and kicked
// off a fresh one instead — the tile sat on "computing" indefinitely while
// burning a Sigma run per dashboard load.
const MRR_CACHE_KEY = "mrr";
const MRR_PENDING_KEY = "mrr:pending";
const MRR_CACHE_TTL_SECONDS = 12 * 60 * 60;
/** A run that has not landed by now is never landing; let the next caller retry. */
const MRR_PENDING_TTL_SECONDS = 10 * 60;
/** Held between claiming the right to start a run and having its id. */
const MRR_CLAIMING = "claiming";
const MRR_COMPUTING_REASON = "computing";

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
	const { points, dataThrough } = parseMrrCsv(csv);
	if (!points.length) {
		return { available: false, reason: "unexpected Sigma CSV columns" };
	}
	return {
		available: true,
		dataLoadTime: new Date().toISOString(),
		dataThrough,
		points,
	};
}

/**
 * Advance the MRR query by one step: serve the cache, else collect the run in
 * flight, else start one. Never blocks on Stripe finishing — callers that want
 * a landed result call this until it stops saying "computing".
 */
async function advanceSigmaMrr({
	ignoreCache = false,
}: {
	ignoreCache?: boolean;
} = {}): Promise<MrrResult> {
	if (!env.STRIPE_SECRET_KEY) {
		return { available: false, reason: "STRIPE_SECRET_KEY not configured" };
	}
	// Without the shared cache there is nowhere to keep the pending run, so
	// every poll would start another Sigma query and none would ever be
	// collected. Say so rather than burning runs.
	if (!isMetricCacheAvailable()) {
		return { available: false, reason: "metric cache not configured" };
	}

	if (!ignoreCache) {
		const cached = await readMetricCache<MrrResult>(MRR_CACHE_KEY);
		if (cached?.available) return cached;
	}

	const pending = await readMetricCache<string>(MRR_PENDING_KEY);
	if (pending && pending !== MRR_CLAIMING) {
		const finished = await collectMrrRun(pending);
		if (!finished) {
			return { available: false, reason: MRR_COMPUTING_REASON };
		}
		await writeMetricCache(MRR_CACHE_KEY, finished, MRR_CACHE_TTL_SECONDS);
		await clearMetricCache(MRR_PENDING_KEY);
		return finished;
	}
	if (pending === MRR_CLAIMING) {
		return { available: false, reason: MRR_COMPUTING_REASON };
	}

	// Whoever claims the key owns starting the run; everyone else waits for it
	// rather than paying Stripe for a duplicate.
	const claimed = await claimMetricCache(
		MRR_PENDING_KEY,
		MRR_CLAIMING,
		MRR_PENDING_TTL_SECONDS,
	);
	if (!claimed) {
		return { available: false, reason: MRR_COMPUTING_REASON };
	}

	const kicked = await createMrrRun();
	if (!("runId" in kicked)) {
		await clearMetricCache(MRR_PENDING_KEY);
		return kicked;
	}
	await writeMetricCache(
		MRR_PENDING_KEY,
		kicked.runId,
		MRR_PENDING_TTL_SECONDS,
	);
	return { available: false, reason: MRR_COMPUTING_REASON };
}

/**
 * Drive the query to completion. Used by the refresh job, which has the time
 * budget to wait and exists so the tile only ever reads a landed result.
 */
export async function refreshSigmaMrr({
	timeBudgetMs = 120_000,
	pollIntervalMs = 5_000,
}: {
	timeBudgetMs?: number;
	pollIntervalMs?: number;
} = {}): Promise<MrrResult> {
	const startedAt = Date.now();
	// Ignore the cache on every step. The job runs more often than the entry
	// expires, so honouring it would hand back the previous result before the
	// pending run is ever collected — the tile would then only move when the
	// entry lapsed, with a Sigma run burnt every hour for nothing. The finished
	// run is returned straight from the pending branch, not via the cache.
	let last = await advanceSigmaMrr({ ignoreCache: true });
	while (
		!last.available &&
		last.reason === MRR_COMPUTING_REASON &&
		Date.now() - startedAt < timeBudgetMs
	) {
		await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
		last = await advanceSigmaMrr({ ignoreCache: true });
	}
	return last;
}

async function fetchLatestSigmaMrr(): Promise<MrrResult> {
	return advanceSigmaMrr();
}

interface MercuryAccount {
	id: string;
	name: string;
	availableBalance: number;
}

interface MercuryTransaction {
	amount: number;
	status: string;
	kind: string | null;
	counterpartyName: string | null;
	postedAt: string | null;
	createdAt: string;
}

interface CashFlowMonth {
	month: string;
	netUsd: number;
	outUsd: number;
	stripeInUsd: number;
	netBurnUsd: number;
	partial: boolean;
}

interface CashPoint {
	date: string;
	cashUsd: number;
}

interface VendorSpend {
	name: string;
	avgMonthlyUsd: number;
}

type CashFlowResult =
	| {
			available: true;
			asOf: string;
			totalCashUsd: number;
			months: CashFlowMonth[];
			cashSeries: CashPoint[];
			topVendors: VendorSpend[];
			avgMonthlyNetUsd: number | null;
			avgMonthlyGrossBurnUsd: number | null;
			avgMonthlyNetBurnUsd: number | null;
			runwayMonths: number | null;
	  }
	| { available: false; reason: string };

// Same reasoning as the MRR cache above: shared in Redis so one instance's
// Mercury round trip serves every other instance's dashboard load.
const CASH_FLOW_CACHE_KEY = "cash-flow";
const CASH_FLOW_CACHE_TTL_SECONDS = 60 * 60;
const TOP_VENDOR_COUNT = 8;

// Cash includes the Treasury balance (where the raise is parked). Treasury
// sweeps are internal and excluded everywhere; treasury dividends are not in
// account transactions, so the reconstructed cash series drifts by roughly
// the dividend income (~$13k/mo) — acceptable for a trajectory chart.
async function fetchMercuryCashFlow(): Promise<CashFlowResult> {
	if (!env.MERCURY_API_TOKEN) {
		return { available: false, reason: "MERCURY_API_TOKEN not configured" };
	}
	const cached = await readMetricCache<CashFlowResult>(CASH_FLOW_CACHE_KEY);
	if (cached?.available) return cached;

	const mercuryHeaders = {
		Authorization: `Bearer ${env.MERCURY_API_TOKEN}`,
	};
	const accountsResponse = await fetch(
		"https://api.mercury.com/api/v1/accounts",
		{ headers: mercuryHeaders },
	);
	if (!accountsResponse.ok) {
		return {
			available: false,
			reason: `Mercury API error (${accountsResponse.status})`,
		};
	}
	const { accounts } = (await accountsResponse.json()) as {
		accounts: MercuryAccount[];
	};

	const treasuryResponse = await fetch(
		"https://api.mercury.com/api/v1/treasury",
		{ headers: mercuryHeaders },
	);
	const treasury = treasuryResponse.ok
		? ((await treasuryResponse.json()) as { accounts?: MercuryAccount[] })
		: null;
	const treasuryCashUsd = (treasury?.accounts ?? []).reduce(
		(sum, account) => sum + (account.availableBalance ?? 0),
		0,
	);

	const now = new Date();
	const start = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1),
	);
	const startParam = start.toISOString().slice(0, 10);

	const transactions: { date: string; amount: number; counterparty: string }[] =
		[];
	for (const account of accounts) {
		const transactionsResponse = await fetch(
			`https://api.mercury.com/api/v1/account/${account.id}/transactions?limit=500&start=${startParam}`,
			{ headers: mercuryHeaders },
		);
		if (!transactionsResponse.ok) {
			return {
				available: false,
				reason: `Mercury transactions error (${transactionsResponse.status})`,
			};
		}
		const page = (await transactionsResponse.json()) as {
			transactions: MercuryTransaction[];
		};
		for (const transaction of page.transactions) {
			if (transaction.status === "failed" || transaction.status === "cancelled")
				continue;
			// Sweeps to/from Mercury Treasury are internal, not burn or income.
			if (transaction.kind === "treasuryTransfer") continue;
			transactions.push({
				date: (transaction.postedAt ?? transaction.createdAt).slice(0, 10),
				amount: transaction.amount,
				counterparty: transaction.counterpartyName ?? "Unknown",
			});
		}
	}
	transactions.sort((a, b) => a.date.localeCompare(b.date));

	const currentMonth = now.toISOString().slice(0, 7);
	const monthlyNet = new Map<string, number>();
	const monthlyOut = new Map<string, number>();
	// Stripe payouts are self-serve revenue landing in the bank; enterprise
	// wires can't be told apart from fundraise wires, so they are NOT netted
	// against burn (conservative).
	const monthlyStripeIn = new Map<string, number>();
	for (const transaction of transactions) {
		const month = transaction.date.slice(0, 7);
		monthlyNet.set(month, (monthlyNet.get(month) ?? 0) + transaction.amount);
		if (transaction.amount < 0) {
			monthlyOut.set(month, (monthlyOut.get(month) ?? 0) + -transaction.amount);
		} else if (transaction.counterparty.toLowerCase().includes("stripe")) {
			monthlyStripeIn.set(
				month,
				(monthlyStripeIn.get(month) ?? 0) + transaction.amount,
			);
		}
	}
	const months: CashFlowMonth[] = [...monthlyNet.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([month, net]) => {
			const out = Math.round(monthlyOut.get(month) ?? 0);
			const stripeIn = Math.round(monthlyStripeIn.get(month) ?? 0);
			return {
				month,
				netUsd: Math.round(net),
				outUsd: out,
				stripeInUsd: stripeIn,
				netBurnUsd: out - stripeIn,
				partial: month === currentMonth,
			};
		});

	const trailing = months.filter((m) => !m.partial).slice(-3);
	const avgMonthlyNetUsd = trailing.length
		? Math.round(
				trailing.reduce((sum, m) => sum + m.netUsd, 0) / trailing.length,
			)
		: null;
	const avgMonthlyGrossBurnUsd = trailing.length
		? Math.round(
				trailing.reduce((sum, m) => sum + m.outUsd, 0) / trailing.length,
			)
		: null;
	const avgMonthlyNetBurnUsd = trailing.length
		? Math.round(
				trailing.reduce((sum, m) => sum + m.netBurnUsd, 0) / trailing.length,
			)
		: null;

	// Burn by vendor: average monthly outflow per counterparty over the
	// trailing complete months — the "where is the money going" view.
	const trailingMonthSet = new Set(trailing.map((m) => m.month));
	// Group case-insensitively — banks emit "Gusto" and "GUSTO" for the same
	// counterparty — displaying the first-seen spelling.
	const vendorTotals = new Map<string, { name: string; total: number }>();
	for (const transaction of transactions) {
		if (transaction.amount >= 0) continue;
		if (!trailingMonthSet.has(transaction.date.slice(0, 7))) continue;
		const key = transaction.counterparty.toLowerCase();
		const entry = vendorTotals.get(key) ?? {
			name: transaction.counterparty,
			total: 0,
		};
		entry.total += -transaction.amount;
		vendorTotals.set(key, entry);
	}
	const topVendors: VendorSpend[] = [...vendorTotals.values()]
		.sort((a, b) => b.total - a.total)
		.slice(0, TOP_VENDOR_COUNT)
		.map((vendor) => ({
			name: vendor.name,
			avgMonthlyUsd: Math.round(vendor.total / Math.max(1, trailing.length)),
		}));

	// Reconstruct total-cash trajectory by walking back from today's balance.
	const totalCashUsd =
		accounts.reduce(
			(sum, account) => sum + (account.availableBalance ?? 0),
			0,
		) + treasuryCashUsd;
	const cashSeries: CashPoint[] = [];
	let runningCash = totalCashUsd;
	const reversed = [...transactions].reverse();
	const today = now.toISOString().slice(0, 10);
	let cursor = today;
	cashSeries.push({ date: today, cashUsd: Math.round(runningCash) });
	for (const transaction of reversed) {
		if (transaction.date < cursor) {
			cashSeries.push({
				date: transaction.date,
				cashUsd: Math.round(runningCash),
			});
			cursor = transaction.date;
		}
		runningCash -= transaction.amount;
	}
	cashSeries.reverse();
	// Thin to weekly-ish points to keep the chart light.
	const thinned = cashSeries.filter(
		(point, index) =>
			index === cashSeries.length - 1 ||
			index === 0 ||
			new Date(point.date).getUTCDay() === 1,
	);

	const result: CashFlowResult = {
		available: true,
		asOf: now.toISOString(),
		totalCashUsd: Math.round(totalCashUsd),
		months,
		cashSeries: thinned,
		topVendors,
		avgMonthlyNetUsd,
		avgMonthlyGrossBurnUsd,
		avgMonthlyNetBurnUsd,
		runwayMonths:
			avgMonthlyNetBurnUsd && avgMonthlyNetBurnUsd > 0
				? Math.round((totalCashUsd / avgMonthlyNetBurnUsd) * 10) / 10
				: null,
	};
	await writeMetricCache(
		CASH_FLOW_CACHE_KEY,
		result,
		CASH_FLOW_CACHE_TTL_SECONDS,
	);
	return result;
}

export const businessRouter = {
	getMrr: adminProcedure.query(() => fetchLatestSigmaMrr()),

	// The tile's refresh button. The hourly job already keeps the entry warm,
	// so the only reason to press this is to get past the cached figure —
	// hence dropping the entry rather than just re-reading it. Dropping it is
	// also what makes the tile's poll follow the new run: getMrr serves the
	// cache before it ever looks at a pending run, so an entry left in place
	// would leave this run uncollected until the next hourly job.
	//
	// Kicking the run is all this does. Sigma takes 30-60s and the tRPC route
	// caps at 60s, so driving it to completion here would be a coin flip
	// against the function timeout; the tile polls it down instead.
	refreshMrr: adminProcedure.mutation(async () => {
		const result = await advanceSigmaMrr({ ignoreCache: true });
		// Only drop the cached figure once there is a run to replace it with,
		// so a Stripe blip leaves the last good number on screen rather than
		// trading it for an error.
		if (!result.available && result.reason === MRR_COMPUTING_REASON) {
			await clearMetricCache(MRR_CACHE_KEY);
		}
		return result;
	}),

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

	// Cash, monthly net flow, and runway from Mercury. Cash includes the
	// Treasury balance (where the raise is parked). Treasury sweeps are
	// internal and excluded; net flow still includes fundraise/revenue wires,
	// so runway uses gross ops burn: cash / avg outflows over the last 3
	// complete months.
	getCashFlow: adminProcedure.query(() => fetchMercuryCashFlow()),

	// Enterprise ARR = annualized Stripe subscription amounts per
	// plan=enterprise org, listed per account (name/logo from Neon, money
	// from Stripe). Deals without a priced Stripe subscription surface as
	// unbilled rows instead of being hidden.
	getEnterpriseArr: adminProcedure.query(async () => {
		if (!env.STRIPE_SECRET_KEY) {
			return {
				available: false as const,
				reason: "STRIPE_SECRET_KEY not configured",
			};
		}
		const result = await db.execute<{
			stripe_subscription_id: string | null;
			name: string;
			logo: string | null;
		}>(sql`
			SELECT s.stripe_subscription_id, o.name, o.logo
			FROM subscriptions s
			JOIN auth.organizations o ON o.id = s.reference_id
			WHERE s.plan = 'enterprise' AND s.status = 'active'
		`);

		const accounts: {
			name: string;
			logo: string | null;
			arrUsd: number;
			billed: boolean;
		}[] = [];
		for (const row of result.rows) {
			let subAnnualCents = 0;
			if (row.stripe_subscription_id) {
				const response = await fetch(
					`https://api.stripe.com/v1/subscriptions/${row.stripe_subscription_id}`,
					{ headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } },
				);
				if (response.ok) {
					const sub = (await response.json()) as {
						status: string;
						items?: {
							data?: {
								quantity?: number;
								price?: {
									unit_amount?: number | null;
									recurring?: { interval?: string } | null;
								} | null;
							}[];
						};
					};
					if (sub.status === "active") {
						for (const item of sub.items?.data ?? []) {
							const amount = item.price?.unit_amount ?? 0;
							const quantity = item.quantity ?? 1;
							const interval = item.price?.recurring?.interval;
							const perYear =
								interval === "month" ? 12 : interval === "year" ? 1 : 0;
							subAnnualCents += amount * quantity * perYear;
						}
					}
				}
			}
			accounts.push({
				name: row.name,
				logo: row.logo,
				arrUsd: subAnnualCents / 100,
				billed: subAnnualCents > 0,
			});
		}
		accounts.sort((a, b) => b.arrUsd - a.arrUsd);

		return {
			available: true as const,
			arrUsd: accounts.reduce((sum, account) => sum + account.arrUsd, 0),
			accounts,
			unbilledLogos: accounts.filter((account) => !account.billed).length,
		};
	}),
} satisfies TRPCRouterRecord;
