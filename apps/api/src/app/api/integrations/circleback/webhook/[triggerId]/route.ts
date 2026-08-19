import { dbWs } from "@superset/db/client";
import { automations, automationTriggers } from "@superset/db/schema";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { env } from "@/env";
import { ingestAutomationEvent } from "@/lib/automations/ingestAutomationEvent";
import { cappedBody, parseJson } from "@/lib/webhooks/body";
import { hmacHex, timingSafeHex } from "@/lib/webhooks/verify";
import {
	meetingSchema,
	normalizeCirclebackDelivery,
} from "./normalizeCirclebackDelivery";

export const dynamic = "force-dynamic";

const rateLimit = new Ratelimit({
	redis: new Redis({
		url: env.KV_REST_API_URL,
		token: env.KV_REST_API_TOKEN,
	}),
	limiter: Ratelimit.slidingWindow(300, "1 m"),
	prefix: "ratelimit:integrations:circleback:webhook",
});

/**
 * One meeting, delivered by Circleback to the trigger named in the URL.
 *
 * Unlike GitHub, where one delivery is matched against every trigger in the
 * organization, a Circleback delivery is addressed: the user configured this
 * URL in Circleback, so only this trigger is evaluated.
 */
export async function POST(
	request: Request,
	{ params }: { params: Promise<{ triggerId: string }> },
): Promise<Response> {
	const { triggerId } = await params;
	if (!z.string().uuid().safeParse(triggerId).success) {
		return Response.json({ error: "Unknown trigger" }, { status: 404 });
	}

	const { success: withinLimit } = await rateLimit.limit(triggerId);
	if (!withinLimit) {
		return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
	}

	const [trigger] = await dbWs
		.select({
			organizationId: automationTriggers.organizationId,
			automationId: automationTriggers.automationId,
			// For an HMAC provider the column holds the signing key itself — a
			// hash could not verify a signature.
			secret: automationTriggers.secretHash,
			automationEnabled: automations.enabled,
		})
		.from(automationTriggers)
		.innerJoin(automations, eq(automations.id, automationTriggers.automationId))
		.where(
			and(
				eq(automationTriggers.id, triggerId),
				eq(automationTriggers.kind, "circleback"),
			),
		)
		.limit(1);

	if (!trigger) {
		return Response.json({ error: "Unknown trigger" }, { status: 404 });
	}

	const body = await cappedBody(request);
	if (body instanceof Response) return body;

	// A trigger with no secret yet cannot tell Circleback from anyone who has
	// seen the URL, so it accepts nothing until one is pasted in.
	const secret = trigger.secret;
	if (!secret) {
		console.warn(
			"[circleback/webhook] No signing secret configured for trigger:",
			triggerId,
		);
		return Response.json(
			{ error: "Signing secret not configured" },
			{ status: 401 },
		);
	}
	// Circleback signs the raw body with the secret it issued for the automation
	// and puts the hex digest in `x-signature`.
	const signature = request.headers.get("x-signature");
	if (!signature || !timingSafeHex(signature, hmacHex(body, secret))) {
		console.warn(
			"[circleback/webhook] Invalid signature for trigger:",
			triggerId,
		);
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	// Refused before the event row exists: the dedupe key is permanent, so a
	// delivery recorded during a pause would swallow the redelivery too.
	if (!trigger.automationEnabled) {
		return Response.json({ error: "Automation is disabled" }, { status: 400 });
	}

	const json = parseJson<unknown>(body);
	if (json instanceof Response) return json;
	const parsed = meetingSchema.safeParse(json);
	if (!parsed.success) {
		console.error(
			"[circleback/webhook] Unexpected payload shape",
			parsed.error,
		);
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	const outcome = await ingestAutomationEvent(
		dbWs,
		normalizeCirclebackDelivery({
			organizationId: trigger.organizationId,
			automationId: trigger.automationId,
			triggerId,
			meeting: parsed.data,
			payload: json,
		}),
	);
	return Response.json({ ok: true, outcome });
}
