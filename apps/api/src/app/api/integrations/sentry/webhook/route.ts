import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import { disconnectSentry } from "@superset/trpc/integrations/sentry";
import { and, eq, sql } from "drizzle-orm";

import { env } from "@/env";
import { ingestAutomationEvent } from "@/lib/automations/ingestAutomationEvent";
import { cappedBody, parseJson } from "@/lib/webhooks/body";
import {
	freshTimestamp,
	hmacHex,
	timingSafeHex,
	unauthorized,
} from "@/lib/webhooks/verify";
import {
	matchableFrom,
	normalizeSentryDelivery,
	type SentryIssuePayload,
} from "./normalizeSentryDelivery";

/**
 * Webhooks from the public Sentry integration.
 *
 * Every delivery is signed with the app's one client secret, an env var, so the
 * signature is verified before anything is looked up. The payload names no
 * Superset org, only the installation's uuid — and that uuid is what the
 * install callback stored on the connection, so it is the only way a delivery
 * finds the org it belongs to.
 */

/** How far a delivery's `sentry-hook-timestamp` may sit from our clock. */
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

/** The connection an installation uuid belongs to, active or not. */
async function connectionByInstallation(installationUuid: string) {
	return db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.provider, "sentry"),
			sql`${integrationConnections.config}->>'installationUuid' = ${installationUuid}`,
		),
		columns: { id: true, organizationId: true, disconnectedAt: true },
	});
}

export async function POST(request: Request) {
	const body = await cappedBody(request);
	if (body instanceof Response) return body;

	const secret = env.SENTRY_CLIENT_SECRET;
	const signature = request.headers.get("sentry-hook-signature");
	if (
		!secret ||
		!signature ||
		!timingSafeHex(signature, hmacHex(body, secret))
	) {
		return unauthorized("Invalid signature");
	}
	if (
		!freshTimestamp(
			request.headers.get("sentry-hook-timestamp"),
			TIMESTAMP_TOLERANCE_MS,
		)
	) {
		return unauthorized("Stale timestamp");
	}

	const payload = parseJson<SentryIssuePayload>(body);
	if (payload instanceof Response) return payload;

	const resource = request.headers.get("sentry-hook-resource");
	const installationUuid =
		payload.installation?.uuid ?? payload.data?.installation?.uuid ?? null;

	// installation.deleted / .created only touch connection state; a deletion
	// drops the token so a later issue delivery for the same install is refused.
	if (resource === "installation") {
		if (installationUuid && payload.action === "deleted") {
			const connection = await connectionByInstallation(installationUuid);
			if (connection) {
				await disconnectSentry(connection.id, "Integration removed in Sentry");
			}
		}
		// installation.created is a no-op: the callback, which alone knows the
		// Superset org, is what writes the connection.
		return Response.json({ success: true });
	}
	if (resource !== "issue" || !payload.action) {
		return Response.json({ success: true, message: "Ignored" });
	}

	const connection = installationUuid
		? await connectionByInstallation(installationUuid)
		: null;
	// No active connection for this install: nothing to attribute the event
	// to, and nothing a retry could resolve.
	if (!connection || connection.disconnectedAt) {
		return Response.json({ success: true, message: "No connection" });
	}

	const event = matchableFrom(payload, `issue.${payload.action}`);
	const deliveryId =
		request.headers.get("request-id") ?? `sentry-${crypto.randomUUID()}`;
	if (event.names.length === 0) {
		console.log(
			`[sentry/webhook] Unhandled action issue.${payload.action}, recorded only:`,
			deliveryId,
		);
	}

	const outcome = await ingestAutomationEvent(
		db,
		normalizeSentryDelivery({
			organizationId: connection.organizationId,
			connectionId: connection.id,
			event,
			deliveryId,
			payload,
		}),
	);
	return Response.json({ success: true, outcome });
}
