import { db } from "@superset/db/client";
import { Receiver } from "@upstash/qstash";
import { Redis } from "@upstash/redis";
import { sql } from "drizzle-orm";

import { env } from "@/env";

export const dynamic = "force-dynamic";

const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

const redis = new Redis({
	url: env.KV_REST_API_URL,
	token: env.KV_REST_API_TOKEN,
});

// Key shape owned by apps/relay/src/directory.ts — must match.
const RELAY_TTL_KEY = "relay:tunnel-ttl";

export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const signature = request.headers.get("upstash-signature");
	const isDev = env.NODE_ENV === "development";

	if (!isDev) {
		if (!signature) {
			return Response.json({ error: "Missing signature" }, { status: 401 });
		}
		const valid = await receiver
			.verify({
				body,
				signature,
				url: `${env.NEXT_PUBLIC_API_URL}/api/hosts/jobs/sync-presence`,
			})
			.catch((error) => {
				console.error("[sync-presence] signature verify failed:", error);
				return false;
			});
		if (!valid) {
			return Response.json({ error: "Invalid signature" }, { status: 401 });
		}
	}

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

	let rows: Array<{
		organization_id: string;
		machine_id: string;
		is_online: boolean;
	}>;
	try {
		const result = await db.execute<{
			organization_id: string;
			machine_id: string;
			is_online: boolean;
		}>(sql`
			WITH desired AS (
				SELECT
					organization_id,
					machine_id,
					(organization_id::text || ':' || machine_id) = ANY(${connected}::text[]) AS expected
				FROM v2_hosts
			)
			UPDATE v2_hosts h
			SET is_online = d.expected
			FROM desired d
			WHERE h.organization_id = d.organization_id
				AND h.machine_id = d.machine_id
				AND h.is_online IS DISTINCT FROM d.expected
			RETURNING h.organization_id, h.machine_id, h.is_online
		`);
		rows = result.rows;
	} catch (error) {
		console.error("[sync-presence] reconcile UPDATE failed:", error);
		return Response.json({ error: "Reconcile write failed" }, { status: 502 });
	}

	const flippedOn = rows.filter((r) => r.is_online === true).length;
	const flippedOff = rows.filter((r) => r.is_online === false).length;

	return Response.json({
		connected: connected.length,
		flippedOn,
		flippedOff,
	});
}
