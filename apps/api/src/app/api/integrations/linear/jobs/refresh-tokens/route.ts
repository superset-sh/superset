import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import { refreshLinearToken } from "@superset/trpc/integrations/linear";
import { Receiver } from "@upstash/qstash";
import { and, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { env } from "@/env";

const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

export async function POST(request: Request) {
	const body = await request.text();
	const signature = request.headers.get("upstash-signature");

	const isDev = env.NODE_ENV === "development";

	if (!isDev) {
		if (!signature) {
			return Response.json({ error: "Missing signature" }, { status: 401 });
		}

		try {
			const isValid = await receiver.verify({
				body,
				signature,
				url: `${env.NEXT_PUBLIC_API_URL}/api/integrations/linear/jobs/refresh-tokens`,
			});

			if (!isValid) {
				return Response.json({ error: "Invalid signature" }, { status: 401 });
			}
		} catch (verifyError) {
			console.error(
				"[linear-refresh-cron] Signature verification failed:",
				verifyError,
			);
			return Response.json(
				{ error: "Signature verification failed" },
				{ status: 401 },
			);
		}
	}

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
