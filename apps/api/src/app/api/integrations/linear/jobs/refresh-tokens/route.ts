import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import { refreshLinearToken } from "@superset/trpc/integrations/linear";
import { and, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { verifyQstashRequest } from "@/lib/verifyQstash";

export async function POST(request: Request) {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/integrations/linear/jobs/refresh-tokens",
	);
	if (rejected) return rejected;

	const stale = await db.query.integrationConnections.findMany({
		where: and(
			eq(integrationConnections.provider, "linear"),
			isNull(integrationConnections.disconnectedAt),
			isNotNull(integrationConnections.refreshToken),
			lt(
				integrationConnections.tokenExpiresAt,
				sql`now() + interval '90 minutes'`,
			),
		),
		columns: { id: true },
	});

	const results = await Promise.allSettled(
		stale.map(async (connection) => {
			try {
				await refreshLinearToken(connection.id);
				return { id: connection.id, ok: true };
			} catch (error) {
				console.error(
					`[linear-refresh-cron] failed for ${connection.id}:`,
					error,
				);
				return { id: connection.id, ok: false };
			}
		}),
	);

	const succeeded = results.filter(
		(result) => result.status === "fulfilled" && result.value.ok,
	).length;

	return Response.json({ candidates: stale.length, succeeded });
}
