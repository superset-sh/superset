import { timingSafeEqual } from "node:crypto";
import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { env } from "@/env";
import { syncMailbox } from "../../lib/syncMailbox";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const pushSchema = z.object({
	message: z.object({
		data: z.string().min(1),
		messageId: z.string().optional(),
	}),
	subscription: z.string().optional(),
});

const notificationSchema = z.object({
	emailAddress: z.string().email(),
	historyId: z.union([z.string(), z.number()]),
});

/**
 * Gmail's change notification, delivered by Cloud Pub/Sub push.
 *
 * The subscription appends a shared secret to this URL; that is what
 * authenticates it. The payload names the mailbox and a history id, and only
 * the mailbox is used — the sync continues from the last id it processed, so
 * a dropped or reordered push costs nothing.
 */
export async function POST(request: Request) {
	const secret = env.GOOGLE_PUBSUB_PUSH_TOKEN;
	if (!secret) {
		return Response.json(
			{ error: "Gmail push not configured" },
			{ status: 404 },
		);
	}
	const token = new URL(request.url).searchParams.get("token") ?? "";
	if (
		token.length !== secret.length ||
		!timingSafeEqual(Buffer.from(token), Buffer.from(secret))
	) {
		return Response.json({ error: "Invalid token" }, { status: 401 });
	}

	const body = await request.text();
	let notification: z.infer<typeof notificationSchema>;
	try {
		const envelope = pushSchema.parse(JSON.parse(body));
		notification = notificationSchema.parse(
			JSON.parse(Buffer.from(envelope.message.data, "base64").toString()),
		);
	} catch {
		// Malformed messages are acknowledged: Pub/Sub would otherwise redeliver
		// them until the retention window closes.
		return Response.json({ ok: true, skipped: "malformed" });
	}

	const connections = await db
		.select()
		.from(integrationConnections)
		.where(
			and(
				eq(integrationConnections.provider, "google"),
				eq(
					integrationConnections.externalOrgId,
					notification.emailAddress.toLowerCase(),
				),
				isNull(integrationConnections.disconnectedAt),
			),
		);
	if (connections.length === 0) {
		return Response.json({ ok: true, skipped: "no connection" });
	}

	// Per connection, so one mailbox failing does not make Pub/Sub replay the
	// ones that already advanced their history ids. Any failure still answers
	// non-2xx, which is what asks for the redelivery.
	const results = [];
	let failed = 0;
	for (const connection of connections) {
		try {
			const result = await syncMailbox(connection);
			if (result.recorded > 0) {
				console.log(
					`[google/gmail/push] ${connection.id}: ${result.recorded} recorded, ${result.matched} matched`,
				);
			}
			results.push({ connectionId: connection.id, ...result });
		} catch (error) {
			failed += 1;
			console.error(`[google/gmail/push] ${connection.id} sync failed:`, error);
			results.push({ connectionId: connection.id, error: "sync failed" });
		}
	}
	return Response.json(
		{ ok: failed === 0, results },
		{ status: failed === 0 ? 200 : 500 },
	);
}
