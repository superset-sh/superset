import { dbWs } from "@superset/db/client";
import { automations } from "@superset/db/schema";
import { dispatchAutomation } from "@superset/trpc/automation-dispatch";
import { Receiver } from "@upstash/qstash";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { env } from "@/env";
import { getRelayUrl } from "@/lib/relay-url";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

/**
 * A run comes from a schedule or from an event, never both. Scheduled runs
 * carry the minute they were due, which is also their dedupe key; event runs
 * carry the trigger and the event instead, and have no scheduled time.
 */
const payloadSchema = z.union([
	// Strict, so a payload carrying both causes is rejected rather than
	// silently treated as whichever branch happens to match first.
	z
		.object({
			automationId: z.string().uuid(),
			scheduledFor: z.string().datetime(),
		})
		.strict(),
	z
		.object({
			automationId: z.string().uuid(),
			triggerId: z.string().uuid(),
			eventId: z.string().uuid(),
		})
		.strict(),
]);

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
): Promise<Response> {
	const body = await request.text();
	const signature = request.headers.get("upstash-signature");
	if (!signature) {
		return Response.json({ error: "Missing signature" }, { status: 401 });
	}

	const { id } = await params;
	const valid = await receiver.verify({
		body,
		signature,
		url: `${env.NEXT_PUBLIC_API_URL}/api/automations/dispatch/${id}`,
	});
	if (!valid) {
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	const parsed = payloadSchema.safeParse(JSON.parse(body));
	if (!parsed.success) {
		console.error("[automations/dispatch] invalid payload", parsed.error);
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	const [automation] = await dbWs
		.select()
		.from(automations)
		.where(eq(automations.id, parsed.data.automationId))
		.limit(1);

	if (!automation) {
		return Response.json({ ok: true, skipped: "deleted" });
	}
	if (!automation.enabled) {
		return Response.json({ ok: true, skipped: "disabled" });
	}

	// The owner's host may be on an overridden relay (relay-url-override);
	// env.RELAY_URL alone reaches only hosts still on the default relay.
	const relayUrl = await getRelayUrl(automation.ownerUserId);
	const outcome = await dispatchAutomation(
		"scheduledFor" in parsed.data
			? {
					automation,
					relayUrl,
					scheduledFor: new Date(parsed.data.scheduledFor),
				}
			: {
					automation,
					relayUrl,
					trigger: {
						triggerId: parsed.data.triggerId,
						eventId: parsed.data.eventId,
					},
				},
	);

	return Response.json({ ok: true, outcome });
}
