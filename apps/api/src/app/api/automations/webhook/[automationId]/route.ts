import { createHash } from "node:crypto";
import { db } from "@superset/db/client";
import { automations, automationTriggers } from "@superset/db/schema";
import {
	bearerToken,
	WEBHOOK_TOKEN_PREFIX,
	webhookTokenMatches,
} from "@superset/trpc/automation-webhook-secret";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { env } from "@/env";
import { ingestAutomationEvent } from "@/lib/automations/ingestAutomationEvent";
import { cappedBody } from "@/lib/webhooks/body";
import { normalizeWebhookDelivery } from "./normalizeWebhookDelivery";

export const dynamic = "force-dynamic";

const rateLimit = new Ratelimit({
	redis: new Redis({
		url: env.KV_REST_API_URL,
		token: env.KV_REST_API_TOKEN,
	}),
	limiter: Ratelimit.slidingWindow(300, "1 m"),
	prefix: "ratelimit:automations:webhook",
});

function parseBody(body: string): Record<string, unknown> | unknown[] {
	if (body.trim() === "") return {};
	const parsed: unknown = JSON.parse(body);
	if (typeof parsed !== "object" || parsed === null) {
		throw new Error("not an object");
	}
	return parsed as Record<string, unknown> | unknown[];
}

/**
 * Inbound raw webhook: `POST /api/automations/webhook/{automationId}` with
 * `Authorization: Bearer <token>`. Every authenticated delivery is one event
 * and fires every enabled webhook trigger on the automation; there are no
 * filters and no dedupe.
 */
export async function POST(
	request: Request,
	{ params }: { params: Promise<{ automationId: string }> },
): Promise<Response> {
	const { automationId } = await params;
	if (!z.string().uuid().safeParse(automationId).success) {
		return Response.json({ error: "Not found" }, { status: 404 });
	}

	const token = bearerToken(request.headers.get("authorization"));
	if (!token) {
		return Response.json({ error: "Missing bearer token" }, { status: 401 });
	}
	if (!token.startsWith(WEBHOOK_TOKEN_PREFIX)) {
		return Response.json({ error: "Invalid bearer token" }, { status: 401 });
	}

	// Keyed on the presented token, not the public automation id, so someone
	// who only knows the URL cannot spend the real producer's budget.
	const { success: withinLimit } = await rateLimit.limit(
		createHash("sha256").update(token).digest("hex"),
	);
	if (!withinLimit) {
		return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
	}

	const triggers = await db
		.select({
			secretHash: automationTriggers.secretHash,
			organizationId: automations.organizationId,
			automationEnabled: automations.enabled,
		})
		.from(automationTriggers)
		.innerJoin(automations, eq(automations.id, automationTriggers.automationId))
		.where(
			and(
				eq(automationTriggers.automationId, automationId),
				eq(automationTriggers.kind, "webhook"),
			),
		);

	const authenticating = triggers.find((t) =>
		webhookTokenMatches(token, t.secretHash),
	);
	if (!authenticating) {
		return Response.json({ error: "Invalid bearer token" }, { status: 401 });
	}
	const { organizationId } = authenticating;
	if (!authenticating.automationEnabled) {
		return Response.json(
			{ error: `Automation ${automationId} is disabled` },
			{ status: 400 },
		);
	}

	const body = await cappedBody(request);
	if (body instanceof Response) return body;
	let payload: Record<string, unknown> | unknown[];
	try {
		payload = parseBody(body);
	} catch {
		return Response.json(
			{ error: "Body must be a JSON object" },
			{ status: 400 },
		);
	}

	const outcome = await ingestAutomationEvent(
		db,
		normalizeWebhookDelivery({ organizationId, automationId, payload }),
	);
	return Response.json({
		ok: true,
		eventId: "eventId" in outcome ? outcome.eventId : null,
		runs: outcome.status === "dispatched" ? outcome.matched : 0,
	});
}
