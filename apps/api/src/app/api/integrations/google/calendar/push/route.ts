import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import { googleConfigOf } from "@superset/trpc/integrations/google";
import { and, eq, isNull, sql } from "drizzle-orm";
import { syncCalendar } from "../../lib/syncCalendar";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Google Calendar push notifications.
 *
 * The body is empty and nothing is signed: the request is trusted because it
 * names a channel we opened and carries the token we chose for it. State
 * `sync` is the channel's hello; anything else means the calendar changed and
 * the sync token turns that into the actual events.
 */
export async function POST(request: Request) {
	const channelId = request.headers.get("x-goog-channel-id");
	const token = request.headers.get("x-goog-channel-token");
	const state = request.headers.get("x-goog-resource-state");
	if (!channelId || !token) {
		return Response.json({ error: "Missing channel headers" }, { status: 400 });
	}

	// One channel per calendar per connection: find the connection whose
	// calendar state holds this channel id.
	const [connection] = await db
		.select()
		.from(integrationConnections)
		.where(
			and(
				eq(integrationConnections.provider, "google"),
				isNull(integrationConnections.disconnectedAt),
				sql`EXISTS (
					SELECT 1 FROM jsonb_each(coalesce(${integrationConnections.config} -> 'calendars', '{}'::jsonb)) AS c
					WHERE c.value ->> 'channelId' = ${channelId}
				)`,
			),
		)
		.limit(1);
	if (!connection) {
		// A channel from a disconnected account, or one this deploy never
		// opened. 404 tells Google to stop retrying it; the channel expires.
		return Response.json({ error: "Unknown channel" }, { status: 404 });
	}

	const calendars = googleConfigOf(connection.config).calendars ?? {};
	const entry = Object.entries(calendars).find(
		([, s]) => s.channelId === channelId,
	);
	// Only the hash is stored (the config column reaches every member's
	// client); the token Google echoes is hashed the same way and compared.
	const expected = entry?.[1].channelTokenHash;
	const presented = createHash("sha256").update(token).digest("hex");
	if (
		!entry ||
		!expected ||
		expected.length !== presented.length ||
		!timingSafeEqual(Buffer.from(expected), Buffer.from(presented))
	) {
		return Response.json({ error: "Invalid channel token" }, { status: 401 });
	}
	const [calendarId] = entry;

	if (state === "sync") return Response.json({ ok: true, state });

	try {
		const result = await syncCalendar(connection, calendarId);
		if (result.recorded > 0) {
			console.log(
				`[google/calendar/push] ${calendarId}: ${result.recorded} recorded, ${result.matched} matched`,
			);
		}
		return Response.json({ ok: true, ...result });
	} catch (error) {
		console.error("[google/calendar/push] sync failed:", error);
		// Non-2xx makes Google retry with backoff, which is what a transient
		// failure wants; the sync token is only advanced on success.
		return Response.json({ error: "Sync failed" }, { status: 500 });
	}
}
