import * as Sentry from "@sentry/nextjs";
import { db } from "@superset/db/client";
import { automationRuns, automations } from "@superset/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { verifyQstashRequest } from "@/lib/verifyQstash";
import { runPayloadSchema } from "../runPayloadSchema";

export const dynamic = "force-dynamic";

const failurePayloadSchema = z.object({
	sourceMessageId: z.string(),
	sourceBody: z.string(),
	status: z.number(),
	error: z.string().optional(),
	retried: z.number().optional(),
});

export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/automations/run-failed",
	);
	if (rejected) return rejected;

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
	const source = runPayloadSchema.safeParse(decoded);
	if (!source.success) {
		console.error("[automations/run-failed] invalid sourceBody", source.error);
		return Response.json({ error: "Invalid sourceBody" }, { status: 400 });
	}

	const { automationId } = source.data;

	const [automation] = await db
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
	const failed = { status: "dispatch_failed", error: errorText } as const;

	if ("scheduledFor" in source.data) {
		await db
			.insert(automationRuns)
			.values({
				automationId,
				organizationId: automation.organizationId,
				title: automation.name,
				scheduledFor: new Date(source.data.scheduledFor),
				triggerId: source.data.triggerId ?? null,
				...failed,
			})
			.onConflictDoUpdate({
				target: [automationRuns.automationId, automationRuns.scheduledFor],
				targetWhere: sql`${automationRuns.scheduledFor} IS NOT NULL`,
				set: failed,
			});
	} else {
		await db
			.insert(automationRuns)
			.values({
				automationId,
				organizationId: automation.organizationId,
				title: automation.name,
				triggerId: source.data.triggerId,
				eventId: source.data.eventId,
				...failed,
			})
			.onConflictDoUpdate({
				target: [automationRuns.triggerId, automationRuns.eventId],
				targetWhere: sql`${automationRuns.eventId} IS NOT NULL`,
				set: failed,
			});
	}

	Sentry.captureException(
		new Error(`automation dispatch failed: ${automationId}`),
		{
			tags: { feature: "automations" },
			extra: {
				...source.data,
				sourceMessageId: parsed.data.sourceMessageId,
				status: parsed.data.status,
			},
		},
	);

	return Response.json({ ok: true });
}
