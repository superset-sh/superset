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

const SIGMA_MRR_QUERY_TITLE = "admin-mrr";

interface MrrPoint {
	monthEnd: string;
	mrrUsd: number;
}

type MrrResult =
	| { available: true; dataLoadTime: string | null; points: MrrPoint[] }
	| { available: false; reason: string };

interface ScheduledQueryRun {
	id: string;
	status: string;
	title: string | null;
	created: number;
	data_load_time: number | null;
	file: { id: string; url: string | null } | null;
}

async function fetchLatestSigmaMrr(): Promise<MrrResult> {
	if (!env.STRIPE_SECRET_KEY) {
		return { available: false, reason: "STRIPE_SECRET_KEY not configured" };
	}

	const authHeader = { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` };
	const listResponse = await fetch(
		"https://api.stripe.com/v1/sigma/scheduled_query_runs?limit=50",
		{ headers: authHeader },
	);

	if (!listResponse.ok) {
		const body = (await listResponse.json().catch(() => null)) as {
			error?: { message?: string };
		} | null;
		return {
			available: false,
			reason:
				body?.error?.message ??
				`Stripe Sigma unavailable (${listResponse.status})`,
		};
	}

	const list = (await listResponse.json()) as { data?: ScheduledQueryRun[] };
	const run = (list.data ?? []).find(
		(r) => r.status === "completed" && r.title === SIGMA_MRR_QUERY_TITLE,
	);
	if (!run?.file?.url) {
		return {
			available: false,
			reason: `no completed Sigma run titled "${SIGMA_MRR_QUERY_TITLE}"`,
		};
	}

	const fileResponse = await fetch(run.file.url, { headers: authHeader });
	if (!fileResponse.ok) {
		return {
			available: false,
			reason: `Sigma result file fetch failed (${fileResponse.status})`,
		};
	}

	const csv = await fileResponse.text();
	const [header, ...rows] = csv.trim().split("\n");
	const columns = (header ?? "").split(",");
	const monthIndex = columns.indexOf("month_end");
	const mrrIndex = columns.indexOf("total_mrr_in_usd");
	if (monthIndex === -1 || mrrIndex === -1) {
		return { available: false, reason: "unexpected Sigma CSV columns" };
	}

	const points = rows
		.map((row) => {
			const cells = row.split(",");
			return {
				monthEnd: cells[monthIndex] ?? "",
				mrrUsd: Number(cells[mrrIndex] ?? Number.NaN),
			};
		})
		.filter((p) => p.monthEnd && Number.isFinite(p.mrrUsd))
		.sort((a, b) => a.monthEnd.localeCompare(b.monthEnd));

	return {
		available: true,
		dataLoadTime: run.data_load_time
			? new Date(run.data_load_time * 1000).toISOString()
			: null,
		points,
	};
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
					SELECT generate_series(
						date_trunc('month', now()) - make_interval(months => ${input.months}),
						date_trunc('month', now()) - make_interval(months => 2),
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
					FROM users u
					WHERE u.created_at >= date_trunc('week', now()) - make_interval(weeks => ${input.weeks})
						AND u.created_at < now() - interval '30 days'
				)
				SELECT
					to_char(date_trunc('week', c.created_at), 'YYYY-MM-DD') AS cohort_week,
					count(*)::int AS signups,
					count(*) FILTER (
						WHERE EXISTS (
							SELECT 1
							FROM members m
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
								FROM members m
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
