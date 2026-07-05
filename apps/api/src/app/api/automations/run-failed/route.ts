import * as Sentry from "@sentry/nextjs";
import { dbWs } from "@superset/db/client";
import { automationRuns, automations } from "@superset/db/schema";
import { Receiver } from "@upstash/qstash";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { env } from "@/env";

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
		});

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
