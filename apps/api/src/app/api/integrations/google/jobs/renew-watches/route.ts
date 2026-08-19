import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { verifyQstashRequest } from "@/lib/verifyQstash";
import { reconcileWatches } from "../../lib/reconcileWatches";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const bodySchema = z.object({ connectionId: z.string().uuid().optional() });

/**
 * Daily: renew every connection's Calendar channels and Gmail watch before
 * they expire. Also run once for a single connection right after it connects.
 */
export async function POST(request: Request) {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/integrations/google/jobs/renew-watches",
	);
	if (rejected) return rejected;

	let json: unknown = {};
	if (body) {
		try {
			json = JSON.parse(body);
		} catch {
			return Response.json({ error: "Invalid JSON" }, { status: 400 });
		}
	}
	const parsed = bodySchema.safeParse(json);
	if (!parsed.success) {
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	const connections = await db
		.select({ id: integrationConnections.id })
		.from(integrationConnections)
		.where(
			and(
				eq(integrationConnections.provider, "google"),
				isNull(integrationConnections.disconnectedAt),
				...(parsed.data.connectionId
					? [eq(integrationConnections.id, parsed.data.connectionId)]
					: []),
			),
		);

	const results = [];
	for (const connection of connections) {
		try {
			const result = await reconcileWatches(connection.id);
			if (result.errors.length > 0) {
				console.error(
					`[google/renew-watches] ${connection.id}:`,
					result.errors.join("; "),
				);
			}
			results.push({ connectionId: connection.id, ...result });
		} catch (error) {
			console.error(`[google/renew-watches] ${connection.id} failed:`, error);
			results.push({
				connectionId: connection.id,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
	return Response.json({ connections: connections.length, results });
}
