import type { RealtimeNudgeKind } from "@superset/shared/realtime";
import { waitUntil } from "@vercel/functions";
import { env } from "../env";

/**
 * Tell an organization's subscribed windows that a kind of thing changed, so
 * they refetch instead of polling. Called after the write and never awaited
 * by it: the request is handed to the platform to finish after the response,
 * and a failed delivery only costs freshness until the next focus.
 */
export function nudge(organizationId: string, kind: RealtimeNudgeKind): void {
	waitUntil(
		fetch(`${env.REALTIME_URL}/v2/nudge`, {
			method: "POST",
			headers: {
				authorization: `Bearer ${env.REALTIME_NUDGE_SECRET}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({ organizationId, kind }),
			signal: AbortSignal.timeout(5_000),
		})
			.then((response) => {
				if (!response.ok) {
					console.warn(`[realtime] nudge ${kind} rejected: ${response.status}`);
				}
			})
			.catch((error) => {
				console.warn(
					`[realtime] nudge ${kind} failed:`,
					error instanceof Error ? error.message : error,
				);
			}),
	);
}
