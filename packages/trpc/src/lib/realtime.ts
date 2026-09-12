import type { RealtimeNudgeKind } from "@superset/shared/realtime";
import { env } from "../env";

/**
 * Tell an organization's subscribed windows that a kind of thing changed, so
 * they refetch instead of polling. Called after the write; never fails the
 * caller, since a missed nudge only costs freshness until the next focus.
 */
export async function nudge(
	organizationId: string,
	kind: RealtimeNudgeKind,
): Promise<void> {
	try {
		const response = await fetch(`${env.REALTIME_URL}/v2/nudge`, {
			method: "POST",
			headers: {
				authorization: `Bearer ${env.REALTIME_NUDGE_SECRET}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({ organizationId, kind }),
			signal: AbortSignal.timeout(2_000),
		});
		if (!response.ok) {
			console.warn(`[realtime] nudge ${kind} rejected: ${response.status}`);
		}
	} catch (error) {
		console.warn(
			`[realtime] nudge ${kind} failed:`,
			error instanceof Error ? error.message : error,
		);
	}
}
