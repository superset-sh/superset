import {
	authenticateNotification,
	changeNotificationSchema,
	collectionSchema,
	validationResponse,
} from "./notifications";
import { enqueueTeamsWork, type TeamsWork } from "./queue";

export const dynamic = "force-dynamic";

/**
 * Where Graph posts change notifications for every Teams connection.
 *
 * Fast by design: verify each notification's clientState against its
 * tenant's connection, queue the accepted ones, answer 202 — Graph allows
 * three seconds and throttles endpoints that miss it. Refused notifications
 * are acknowledged too, since a forged or stale one will not verify on retry
 * either. The work itself happens in `../process/route.ts`.
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
	const parsed = collectionSchema(changeNotificationSchema).safeParse(json);
	if (!parsed.success) {
		return Response.json({ error: "Unrecognised payload" }, { status: 400 });
	}

	const accepted: TeamsWork[] = [];
	const refused: Array<{ resource: string; reason: string }> = [];
	for (const notification of parsed.data.value) {
		const auth = await authenticateNotification(notification);
		if (!auth.ok) {
			console.warn("[microsoft-teams/notify] refused:", auth.reason);
			refused.push({ resource: notification.resource, reason: auth.reason });
			continue;
		}
		accepted.push({
			kind: "change",
			connectionId: auth.connection.id,
			notification,
		});
	}

	// A queue failure is the one case worth a 5xx: Graph will redeliver, and
	// nothing has been recorded yet.
	await enqueueTeamsWork(accepted);

	return Response.json({ accepted: accepted.length, refused }, { status: 202 });
}
