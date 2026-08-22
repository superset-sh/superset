import {
	authenticateNotification,
	collectionSchema,
	lifecycleNotificationSchema,
	validationResponse,
} from "../notify/notifications";
import { enqueueTeamsWork, type TeamsWork } from "../notify/queue";

export const dynamic = "force-dynamic";

/**
 * Graph's lifecycle channel for the subscriptions the notify route depends on.
 *
 * `reauthorizationRequired` means renew now or lose it; `subscriptionRemoved`
 * means it is already gone and must be recreated; `missed` means deliveries
 * were dropped, and with no delta to replay from there is nothing to do but
 * note it. The renewals go through the queue like everything else, so this
 * answers inside Graph's window whatever Graph is doing on the other side.
 */
export async function POST(request: Request) {
	const validation = validationResponse(request);
	if (validation) return validation;

	const body = await request.text();
	let json: unknown;
	try {
		json = JSON.parse(body);
	} catch {
		return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
	}
	const parsed = collectionSchema(lifecycleNotificationSchema).safeParse(json);
	if (!parsed.success) {
		return Response.json({ error: "Unrecognised payload" }, { status: 400 });
	}

	const accepted: TeamsWork[] = [];
	const ignored: Array<{ subscriptionId: string; reason: string }> = [];
	for (const notification of parsed.data.value) {
		const auth = await authenticateNotification(notification);
		if (!auth.ok) {
			console.warn("[microsoft-teams/lifecycle] refused:", auth.reason);
			ignored.push({
				subscriptionId: notification.subscriptionId,
				reason: auth.reason,
			});
			continue;
		}
		if (
			notification.lifecycleEvent !== "reauthorizationRequired" &&
			notification.lifecycleEvent !== "subscriptionRemoved"
		) {
			if (notification.lifecycleEvent === "missed") {
				console.warn(
					"[microsoft-teams/lifecycle] notifications missed for",
					auth.connection.id,
					notification.subscriptionId,
				);
			}
			ignored.push({
				subscriptionId: notification.subscriptionId,
				reason: notification.lifecycleEvent,
			});
			continue;
		}
		accepted.push({
			kind: "lifecycle",
			connectionId: auth.connection.id,
			notification,
		});
	}

	await enqueueTeamsWork(accepted);

	return Response.json({ accepted: accepted.length, ignored }, { status: 202 });
}
