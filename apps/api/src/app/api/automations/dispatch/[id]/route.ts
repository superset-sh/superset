import { db } from "@superset/db/client";
import { automations } from "@superset/db/schema";
import { dispatchAutomation } from "@superset/trpc/automation-dispatch";
import { eq } from "drizzle-orm";
import { getRelayUrl } from "@/lib/relay-url";
import { verifyQstashRequest } from "@/lib/verifyQstash";
import { runPayloadSchema } from "../../runPayloadSchema";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
): Promise<Response> {
	const body = await request.text();
	const { id } = await params;
	const rejected = await verifyQstashRequest(
		request,
		body,
		`/api/automations/dispatch/${id}`,
	);
	if (rejected) return rejected;

	const parsed = runPayloadSchema.safeParse(JSON.parse(body));
	if (!parsed.success) {
		console.error("[automations/dispatch] invalid payload", parsed.error);
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	const [automation] = await db
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
					triggerId: parsed.data.triggerId,
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
