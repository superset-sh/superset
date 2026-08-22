import { refreshSigmaMrr } from "@superset/trpc/business-metrics";

import { verifyQstashRequest } from "@/lib/verifyQstash";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Keeps the admin dashboard's MRR tile warm.
 *
 * The Sigma query takes ~30-60s, so whoever triggers it first eats the wait.
 * Left to dashboard traffic that was always a person looking at the tile —
 * admin gets a few dozen loads a day, so the cache had usually expired by the
 * time anyone looked. Running hourly against a 12h entry means the tile only
 * ever reads a landed result.
 */
export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/analytics/jobs/refresh-mrr",
	);
	if (rejected) return rejected;

	const result = await refreshSigmaMrr();
	if (!result.available) {
		console.error("[refresh-mrr] refresh did not land:", result.reason);
		return Response.json({ refreshed: false, reason: result.reason });
	}

	return Response.json({ refreshed: true, points: result.points.length });
}
