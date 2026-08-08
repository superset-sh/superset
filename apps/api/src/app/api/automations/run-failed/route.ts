import * as Sentry from "@sentry/nextjs";
import { dbWs } from "@superset/db/client";
import { automationRuns, automations } from "@superset/db/schema";
import { Receiver } from "@upstash/qstash";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { env } from "@/env";
import { matchesTerminalOccurrence } from "../terminal-occurrence";

export const dynamic = "force-dynamic";

const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

const failurePayloadSchema = z.object({
	sourceMessageId: z.string(),
	sourceBody: z.string(),
	status: z.number(),
	error: z.string().optional(),
	retried: z.number().optional(),
});

const sourceBodySchema = z.object({
	automationId: z.string().uuid(),
	scheduledFor: z.string().datetime(),
	terminal: z.boolean().default(false),
	terminalDispatchToken: z.string().datetime().optional(),
	terminalPreviousUpdatedAt: z.string().datetime().optional(),
	// Accept messages created before the updatedAt reservation was introduced.
	terminalPendingNextRunAt: z.string().datetime().optional(),
});

export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const signature = request.headers.get("upstash-signature");
	if (!signature) {
		return Response.json({ error: "Missing signature" }, { status: 401 });
	}

	const valid = await receiver.verify({
		body,
		signature,
		url: `${env.NEXT_PUBLIC_API_URL}/api/automations/run-failed`,
	});
	if (!valid) {
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	let rawBody: unknown;
	try {
		rawBody = JSON.parse(body);
	} catch (err) {
		console.error("[automations/run-failed] invalid JSON", err);
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = failurePayloadSchema.safeParse(rawBody);
	if (!parsed.success) {
		console.error("[automations/run-failed] invalid payload", parsed.error);
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	let decoded: unknown;
	try {
		decoded = JSON.parse(
			Buffer.from(parsed.data.sourceBody, "base64").toString("utf-8"),
		);
	} catch (err) {
		console.error("[automations/run-failed] invalid sourceBody JSON", err);
		return Response.json({ error: "Invalid sourceBody JSON" }, { status: 400 });
	}
	const source = sourceBodySchema.safeParse(decoded);
	if (!source.success) {
		console.error("[automations/run-failed] invalid sourceBody", source.error);
		return Response.json({ error: "Invalid sourceBody" }, { status: 400 });
	}

	const { automationId, scheduledFor } = source.data;

	const [automation] = await dbWs
		.select({
			organizationId: automations.organizationId,
			name: automations.name,
			enabled: automations.enabled,
			nextRunAt: automations.nextRunAt,
			updatedAt: automations.updatedAt,
		})
		.from(automations)
		.where(eq(automations.id, automationId))
		.limit(1);

	if (!automation) {
		return Response.json({ ok: true, skipped: "deleted" });
	}

	const errorText = `delivery failed after retries (status ${parsed.data.status}): ${parsed.data.error ?? "unknown"}`;

	await dbWs
		.insert(automationRuns)
		.values({
			automationId,
			organizationId: automation.organizationId,
			title: automation.name,
			scheduledFor: new Date(scheduledFor),
			status: "dispatch_failed",
			error: errorText,
		})
		.onConflictDoUpdate({
			target: [automationRuns.automationId, automationRuns.scheduledFor],
			set: { status: "dispatch_failed", error: errorText },
			// A retry can collide with an already completed or offline run; preserve
			// that observable outcome.
			setWhere: eq(automationRuns.status, "dispatching"),
		});

	const terminalOccurrenceMatches =
		source.data.terminal &&
		matchesTerminalOccurrence({
			nextRunAt: automation.nextRunAt,
			scheduledFor: new Date(scheduledFor),
			legacyPendingNextRunAt: source.data.terminalPendingNextRunAt,
		});
	const canClaimUnreservedTerminal =
		terminalOccurrenceMatches &&
		automation.enabled &&
		(source.data.terminalDispatchToken === undefined
			? true
			: source.data.terminalPreviousUpdatedAt !== undefined &&
				automation.updatedAt.getTime() ===
					new Date(source.data.terminalPreviousUpdatedAt).getTime());

	if (canClaimUnreservedTerminal) {
		const terminalDispatchToken = source.data.terminalDispatchToken;
		await dbWs
			.update(automations)
			.set(
				terminalDispatchToken === undefined
					? { enabled: false }
					: {
							enabled: false,
							updatedAt: new Date(terminalDispatchToken),
						},
			)
			.where(
				and(
					eq(automations.id, automationId),
					eq(automations.enabled, true),
					eq(automations.nextRunAt, automation.nextRunAt),
					...(source.data.terminalPreviousUpdatedAt === undefined
						? []
						: [
								eq(
									automations.updatedAt,
									new Date(source.data.terminalPreviousUpdatedAt),
								),
							]),
				),
			);
	}

	Sentry.captureException(
		new Error(`automation dispatch failed: ${automationId}`),
		{
			tags: { feature: "automations" },
			extra: {
				automationId,
				scheduledFor,
				sourceMessageId: parsed.data.sourceMessageId,
				status: parsed.data.status,
			},
		},
	);

	return Response.json({ ok: true });
}
