import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import { Receiver } from "@upstash/qstash";
import { and, eq, isNull } from "drizzle-orm";

import { env } from "@/env";
import { syncGitLabConnection } from "../sync";

const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

/**
 * Periodic poll (poll-primary sync, spec B1): incrementally refreshes every active
 * GitLab connection. Intended to be driven by a QStash schedule. Group webhooks are
 * Premium-only, so polling is the baseline.
 */
export async function POST(request: Request) {
	const body = await request.text();
	const signature = request.headers.get("upstash-signature");
	const isDev = env.NODE_ENV === "development";

	if (!isDev) {
		if (!signature) {
			return Response.json({ error: "Missing signature" }, { status: 401 });
		}
		const isValid = await receiver
			.verify({
				body,
				signature,
				url: `${env.NEXT_PUBLIC_API_URL}/api/gitlab/sync`,
			})
			.catch((error) => {
				console.error("[gitlab/sync] Signature verify failed:", error);
				return false;
			});
		if (!isValid) {
			return Response.json({ error: "Invalid signature" }, { status: 401 });
		}
	}

	const connections = await db.query.integrationConnections.findMany({
		where: and(
			eq(integrationConnections.provider, "gitlab"),
			isNull(integrationConnections.disconnectedAt),
		),
	});

	let ok = 0;
	let failed = 0;
	for (const connection of connections) {
		try {
			await syncGitLabConnection(connection, { incremental: true });
			ok += 1;
		} catch (error) {
			failed += 1;
			console.error(`[gitlab/sync] Connection ${connection.id} failed:`, error);
		}
	}

	return Response.json({ success: true, synced: ok, failed });
}
