import { runHogQL } from "../posthog-hogql";
import { weekStarts } from "./weeks";

// Paywall → paid, from the events the desktop app and the Stripe webhooks
// both land on the same PostHog person (the desktop identifies with the Better
// Auth user id, and Better Auth stamps that id into Stripe metadata, so no id
// mapping is needed — see packages/auth/src/lib/billing-analytics.ts).
//
// Stage semantics: everyone whose FIRST paywall view falls in the window is a
// cohort member, and a stage counts the members who later fired that stage's
// event. Later stages do not require the earlier ones, deliberately: a client
// step that has not shipped everywhere yet would otherwise zero out every
// stage behind it and read as "nobody paid" when people did. The cost is that
// a stage can exceed the one before it; the tile shows counts, not a
// monotonic waterfall.
//
// Recent cohorts are still maturing — someone who saw the paywall yesterday has
// had a day to convert, not twelve weeks — so the window's tail drags the rate
// down by construction.

// Stage key -> the event that marks it, in funnel order. The key is the tile's
// label lookup; the event name travels with it so a tile can name the exact
// event behind a stage without repeating this mapping.
const PAYWALL_STAGES = [
	{ key: "paywall_viewed", event: "paywall_opened" },
	{ key: "upgrade_clicked", event: "paywall_upgrade_clicked" },
	{ key: "checkout_started", event: "checkout_started" },
	{ key: "paid", event: "subscription_started" },
] as const;

export type PaywallStageKey = (typeof PAYWALL_STAGES)[number]["key"];

export interface PaywallStage {
	key: PaywallStageKey;
	/** The PostHog event this stage counts. */
	event: string;
	/** People who reached this stage, PostHog persons (not distinct ids). */
	people: number;
	/**
	 * Median seconds from the previous stage, over the people who reached both;
	 * null for the first stage and wherever either side has no events.
	 */
	medianSeconds: number | null;
	averageSeconds: number | null;
}

export interface PaywallFunnel {
	stages: PaywallStage[];
	since: string;
}

// One row per person: when they first saw the paywall, and when they first
// reached each later stage. `min(if(...))` skips nulls, so a stage a person
// never reached stays null rather than collapsing to the epoch.
function cohortSql(since: string): string {
	const events = PAYWALL_STAGES.map((stage) => `'${stage.event}'`).join(", ");
	return `
	SELECT
		person_id,
		min(if(event = 'paywall_opened', timestamp, NULL)) AS viewed_at,
		min(if(event = 'paywall_upgrade_clicked', timestamp, NULL)) AS upgrade_at,
		min(if(event = 'checkout_started', timestamp, NULL)) AS checkout_at,
		min(if(event = 'subscription_started', timestamp, NULL)) AS paid_at
	FROM events
	WHERE timestamp >= toDateTime('${since} 00:00:00')
		AND event IN (${events})
	GROUP BY person_id`;
}

type StageRow = [
	number,
	number,
	number,
	number,
	number | null,
	number | null,
	number | null,
	number | null,
	number | null,
	number | null,
];

export async function fetchPaywallFunnel(
	weekCount: number,
): Promise<PaywallFunnel> {
	const weeks = weekStarts(weekCount);
	const since = weeks[0] ?? new Date().toISOString().slice(0, 10);
	const cohort = cohortSql(since);

	const stageQuery = `
WITH cohort AS (${cohort}
)
SELECT
	count() AS paywall_viewed,
	countIf(upgrade_at >= viewed_at) AS upgrade_clicked,
	countIf(checkout_at >= viewed_at) AS checkout_started,
	countIf(paid_at >= viewed_at) AS paid,
	medianIf(dateDiff('second', viewed_at, upgrade_at), upgrade_at >= viewed_at) AS median_to_upgrade,
	avgIf(dateDiff('second', viewed_at, upgrade_at), upgrade_at >= viewed_at) AS avg_to_upgrade,
	medianIf(dateDiff('second', upgrade_at, checkout_at), checkout_at >= upgrade_at) AS median_to_checkout,
	avgIf(dateDiff('second', upgrade_at, checkout_at), checkout_at >= upgrade_at) AS avg_to_checkout,
	medianIf(dateDiff('second', checkout_at, paid_at), paid_at >= checkout_at) AS median_to_paid,
	avgIf(dateDiff('second', checkout_at, paid_at), paid_at >= checkout_at) AS avg_to_paid
FROM cohort
WHERE viewed_at IS NOT NULL`;

	const stageRows = await runHogQL<StageRow>(stageQuery);

	const row = stageRows[0];
	const counts = [row?.[0] ?? 0, row?.[1] ?? 0, row?.[2] ?? 0, row?.[3] ?? 0];
	const times: Array<[number | null, number | null]> = [
		[null, null],
		[row?.[4] ?? null, row?.[5] ?? null],
		[row?.[6] ?? null, row?.[7] ?? null],
		[row?.[8] ?? null, row?.[9] ?? null],
	];

	const stages = PAYWALL_STAGES.map((stage, index): PaywallStage => {
		const [median, average] = times[index] ?? [null, null];
		return {
			key: stage.key,
			event: stage.event,
			people: Math.round(counts[index] ?? 0),
			medianSeconds: median === null ? null : Math.round(median),
			averageSeconds: average === null ? null : Math.round(average),
		};
	});

	return { stages, since };
}
