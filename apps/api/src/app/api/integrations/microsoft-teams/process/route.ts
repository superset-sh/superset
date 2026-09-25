import {
	ensureTeamsSubscriptions,
	type SubscriptionKey,
} from "@superset/trpc/integrations/microsoft-teams";

import { verifyQstashRequest } from "@/lib/verifyQstash";
import { handleNotification } from "../notify/handleNotification";
import { loadConnection } from "../notify/notifications";
import { PROCESS_PATH, teamsWorkSchema } from "../notify/queue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The slow half of a Teams notification, run by QStash after the notify or
 * lifecycle route has verified it came from Graph and answered 202.
 *
 * A non-2xx here makes QStash retry, which is what a Graph hiccup on the
 * fetch deserves. Anything that will never succeed — the connection is gone,
 * the resource type is unknown — returns 200 with the reason so it is not
 * retried into the ground.
 */
export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const rejected = await verifyQstashRequest(request, body, PROCESS_PATH);
	if (rejected) return rejected;

	const parsed = teamsWorkSchema.safeParse(JSON.parse(body));
	if (!parsed.success) {
		return Response.json({ error: "Unrecognised work item" }, { status: 400 });
	}
	const work = parsed.data;

	// Re-read rather than trust the enqueued copy: the connection may have been
	// disconnected, or reconnected with a new clientState, since it was queued.
	const connection = await loadConnection(work.connectionId);
	if (!connection || connection.clientState !== work.notification.clientState) {
		return Response.json({ skipped: "connection changed" });
	}

	if (work.kind === "change") {
		const outcome = await handleNotification(connection, work.notification);
		if (outcome.status === "dispatched" && outcome.matched > 0) {
			console.log(
				`[microsoft-teams/process] ${outcome.matched}/${outcome.considered} triggers matched:`,
				outcome.eventId,
			);
		}
		return Response.json(outcome);
	}

	const key = (
		Object.entries(connection.subscriptions) as Array<
			[SubscriptionKey, { id: string } | undefined]
		>
	).find(([, sub]) => sub?.id === work.notification.subscriptionId)?.[0];
	const ensured = await ensureTeamsSubscriptions(connection.id, {
		force: true,
		only: key ? [key] : undefined,
	});
	const failure = ensured
		? Object.values(ensured.failures).find(Boolean)
		: null;
	if (failure) {
		console.error("[microsoft-teams/process] renew failed:", ensured);
		return Response.json({ error: failure }, { status: 500 });
	}
	return Response.json({ renewed: ensured?.subscriptions ?? null });
}
