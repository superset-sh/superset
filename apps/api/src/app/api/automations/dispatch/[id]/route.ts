import { dbWs } from "@superset/db/client";
import {
	automationRuns,
	automations,
	type SelectAutomation,
} from "@superset/db/schema";
import { dispatchAutomation } from "@superset/trpc/automation-dispatch";
import { Receiver } from "@upstash/qstash";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { env } from "@/env";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

const payloadSchema = z.object({
	automationId: z.string().uuid(),
	scheduledFor: z.string().datetime(),
	// Marks the terminal occurrence of a bounded (COUNT/UNTIL) rule, whose
	// evaluate tick disables the automation in the same request that enqueues
	// this message.
	terminal: z.boolean().default(false),
});

function bucketToMinute(d: Date): Date {
	const copy = new Date(d.getTime());
	copy.setUTCSeconds(0, 0);
	return copy;
}

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

	const scheduledFor = new Date(parsed.data.scheduledFor);
	if (!automation.enabled) {
		// evaluate disables an exhausted bounded rule in the same tick that
		// enqueues its final occurrence, and that UPDATE can beat QStash
		// delivery. A terminal payload whose slot still matches next_run_at is
		// that final occurrence, not a user pause — dispatch it (#6128).
		// next_run_at moves on any other transition (advance, pause/resume
		// recompute), so a stale terminal replay can't match.
		const isTerminalSlot =
			parsed.data.terminal &&
			bucketToMinute(automation.nextRunAt).getTime() === scheduledFor.getTime();
		if (!isTerminalSlot) {
			await recordDisabledSkip(automation, scheduledFor);
			return Response.json({ ok: true, skipped: "disabled" });
		}
	}

	const outcome = await dispatchAutomation({
		automation,
		scheduledFor,
		relayUrl: env.RELAY_URL,
	});

	return Response.json({ ok: true, outcome });
}

/**
 * A slot that reaches this handler already consumed its occurrence
 * (evaluate advanced next_run_at when it enqueued), so dropping it on the
 * disabled guard must leave a row — otherwise the loss is indistinguishable
 * from a healthy finished series.
 */
async function recordDisabledSkip(
	automation: SelectAutomation,
	scheduledFor: Date,
): Promise<void> {
	await dbWs
		.insert(automationRuns)
		.values({
			automationId: automation.id,
			organizationId: automation.organizationId,
			title: automation.name,
			scheduledFor,
			status: "dispatch_failed",
			error: "automation disabled before dispatch delivery",
		})
		.onConflictDoNothing({
			target: [automationRuns.automationId, automationRuns.scheduledFor],
		});
}
