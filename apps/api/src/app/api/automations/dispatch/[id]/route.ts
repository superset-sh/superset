import { dbWs } from "@superset/db/client";
import { automations, type SelectAutomation } from "@superset/db/schema";
import { dispatchAutomation } from "@superset/trpc/automation-dispatch";
import { Receiver } from "@upstash/qstash";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { env } from "@/env";
import {
	matchesTerminalOccurrence,
	matchesTerminalReservation,
} from "../../terminal-occurrence";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

const payloadSchema = z.object({
	automationId: z.string().uuid(),
	scheduledFor: z.string().datetime(),
	// The token identifies the evaluator's terminal reservation. The previous
	// value lets dispatch claim an enabled row only if no edit won the race.
	terminal: z.boolean().default(false),
	terminalDispatchToken: z.string().datetime().optional(),
	terminalPreviousUpdatedAt: z.string().datetime().optional(),
	// Accept messages created before the updatedAt reservation was introduced.
	terminalPendingNextRunAt: z.string().datetime().optional(),
});

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
	if (parsed.data.terminal) {
		const terminalReservation = matchesTerminalReservation({
			updatedAt: automation.updatedAt,
			terminalDispatchToken: parsed.data.terminalDispatchToken,
		});
		if (!automation.enabled && !terminalReservation) {
			return Response.json({ ok: true, skipped: "disabled" });
		}
		if (
			!matchesTerminalOccurrence({
				nextRunAt: automation.nextRunAt,
				scheduledFor,
				legacyPendingNextRunAt: parsed.data.terminalPendingNextRunAt,
			})
		) {
			return Response.json({ ok: true, skipped: "stale" });
		}

		const claimed = await claimTerminalOccurrence({
			automation,
			automationId: parsed.data.automationId,
			terminalDispatchToken: parsed.data.terminalDispatchToken,
			terminalPreviousUpdatedAt: parsed.data.terminalPreviousUpdatedAt,
		});
		if (!claimed) {
			return Response.json({
				ok: true,
				skipped: automation.enabled ? "stale" : "disabled",
			});
		}
	} else if (!automation.enabled) {
		return Response.json({ ok: true, skipped: "disabled" });
	}

	const outcome = await dispatchAutomation({
		automation,
		scheduledFor,
		relayUrl: env.RELAY_URL,
	});

	if (parsed.data.terminal && outcome.status === "conflict") {
		// A conflict can mean that another worker owns a still-dispatching run.
		// Do not acknowledge the message or close the recurrence: QStash retries,
		// then its failure callback records dispatch_failed if the owner never
		// reaches a terminal run state.
		return Response.json(
			{
				ok: false,
				error: "Terminal automation dispatch is already in progress",
			},
			{ status: 409 },
		);
	}

	return Response.json({ ok: true, outcome });
}

async function claimTerminalOccurrence({
	automation,
	automationId,
	terminalDispatchToken,
	terminalPreviousUpdatedAt,
}: {
	automation: SelectAutomation;
	automationId: string;
	terminalDispatchToken?: string;
	terminalPreviousUpdatedAt?: string;
}): Promise<boolean> {
	if (terminalDispatchToken !== undefined) {
		if (terminalPreviousUpdatedAt === undefined) {
			return false;
		}

		const token = new Date(terminalDispatchToken);
		const previousUpdatedAt = new Date(terminalPreviousUpdatedAt);
		const [claimed] = automation.enabled
			? await dbWs
					.update(automations)
					.set({ enabled: false, updatedAt: token })
					.where(
						and(
							eq(automations.id, automationId),
							eq(automations.enabled, true),
							eq(automations.nextRunAt, automation.nextRunAt),
							eq(automations.updatedAt, previousUpdatedAt),
						),
					)
					.returning({ id: automations.id })
			: await dbWs
					.update(automations)
					.set({ updatedAt: token })
					.where(
						and(
							eq(automations.id, automationId),
							eq(automations.enabled, false),
							eq(automations.nextRunAt, automation.nextRunAt),
							eq(automations.updatedAt, token),
						),
					)
					.returning({ id: automations.id });

		return claimed !== undefined;
	}

	// Rolling-deployment compatibility for messages that carry only the old
	// nextRunAt reservation. They may claim an enabled row, but never bypass a
	// user-disabled row.
	if (!automation.enabled) {
		return false;
	}

	const [claimed] = await dbWs
		.update(automations)
		.set({ enabled: false })
		.where(
			and(
				eq(automations.id, automationId),
				eq(automations.enabled, true),
				eq(automations.nextRunAt, automation.nextRunAt),
			),
		)
		.returning({ id: automations.id });

	return claimed !== undefined;
}
