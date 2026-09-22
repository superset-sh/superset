import {
	refreshSigmaMrr,
	refreshSigmaNrr,
} from "@superset/trpc/business-metrics";

import { verifyQstashRequest } from "@/lib/verifyQstash";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Keeps the admin dashboard's Stripe Sigma tiles (MRR, NRR) warm.
 *
 * A Sigma query takes ~20-60s, so whoever triggers it first eats the wait.
 * Left to dashboard traffic that was always a person looking at the tile —
 * admin gets a few dozen loads a day, so the cache had usually expired by the
 * time anyone looked. Running hourly against a 12h entry means the tiles only
 * ever read a landed result.
 */
export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/analytics/jobs/refresh-mrr",
	);
	if (rejected) return rejected;

	const [mrrRun, nrrRun] = await Promise.allSettled([
		refreshSigmaMrr(),
		refreshSigmaNrr(),
	]);
	const mrr = settled(mrrRun);
	const nrr = settled(nrrRun);
	if (!mrr.available) {
		console.error("[refresh-mrr] MRR refresh did not land:", mrr.reason);
	}
	if (!nrr.available) {
		console.error("[refresh-mrr] NRR refresh did not land:", nrr.reason);
	}

	return Response.json({
		mrr: mrr.available
			? { refreshed: true, points: mrr.points.length }
			: { refreshed: false, reason: mrr.reason },
		nrr: nrr.available
			? { refreshed: true, months: nrr.months.length }
			: { refreshed: false, reason: nrr.reason },
	});
}

function settled<T>(
	result: PromiseSettledResult<T>,
): T | { available: false; reason: string } {
	if (result.status === "fulfilled") return result.value;
	return {
		available: false,
		reason:
			result.reason instanceof Error
				? result.reason.message
				: String(result.reason),
	};
}
