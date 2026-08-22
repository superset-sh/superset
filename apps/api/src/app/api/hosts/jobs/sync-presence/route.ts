import { db } from "@superset/db/client";
import { Redis } from "@upstash/redis";
import { sql } from "drizzle-orm";

import { env } from "@/env";
import { verifyQstashRequest } from "@/lib/verifyQstash";

export const dynamic = "force-dynamic";

const redis = new Redis({
	url: env.KV_REST_API_URL,
	token: env.KV_REST_API_TOKEN,
});

// Key shape owned by apps/relay/src/directory.ts — must match.
const RELAY_TTL_KEY = "relay:tunnel-ttl";

export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/hosts/jobs/sync-presence",
	);
	if (rejected) return rejected;

	let connected: string[];
	try {
		connected = await redis.zrange<string[]>(
			RELAY_TTL_KEY,
			Date.now(),
			"+inf",
			{ byScore: true },
		);
	} catch (error) {
		console.error("[sync-presence] redis read failed:", error);
		return Response.json({ error: "Directory read failed" }, { status: 502 });
	}

	// Refuse to mass-flip when the directory comes back empty — most likely a
	// misconfigured KV credential or a wiped key, not a real zero-host state.
	// The relay's event-driven setOnline writes still cover genuine disconnects.
	if (connected.length === 0) {
		console.warn(
			"[sync-presence] empty connected set; skipping reconcile to avoid mass-flip",
		);
		return Response.json({
			connected: 0,
			flippedOn: 0,
			flippedOff: 0,
			skipped: true,
		});
	}

	// Pass the connected set as a single Postgres array-literal parameter
	// rather than letting drizzle expand the JS array into N placeholders
	// (`($1, $2, ...)::text[]` is a row-cast, not an array). Routing keys are
	// `${uuid}:${32-char-hex}` so the unquoted `{a,b,c}` literal is safe.
	const connectedArrayLiteral = `{${connected.join(",")}}`;

	// Flip-on only. The directory covers just the v1 relay, so absence proves
	// nothing: relay2 hosts are never in it, and reconciling them to offline
	// mass-flips every live relay2 host. The offline direction is owned by the
	// relays' own disconnect writes and the relay2 liveness sweep.
	let rows: Array<{
		organization_id: string;
		machine_id: string;
	}>;
	try {
		const result = await db.execute<{
			organization_id: string;
			machine_id: string;
		}>(sql`
			UPDATE v2_hosts
			SET is_online = true
			WHERE (organization_id::text || ':' || machine_id) = ANY(${connectedArrayLiteral}::text[])
				AND is_online = false
			RETURNING organization_id, machine_id
		`);
		rows = result.rows;
	} catch (error) {
		console.error("[sync-presence] reconcile UPDATE failed:", error);
		return Response.json({ error: "Reconcile write failed" }, { status: 502 });
	}

	return Response.json({
		connected: connected.length,
		flippedOn: rows.length,
		flippedOff: 0,
	});
}
