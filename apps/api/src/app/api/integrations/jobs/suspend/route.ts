import { db } from "@superset/db/client";
import { connections, githubInstallations } from "@superset/db/schema";
import { revokeLinearConnection } from "@superset/trpc/integrations/linear";
import { organizationSyncs } from "@superset/trpc/sync-policy";
import { Client } from "@upstash/qstash";
import { and, eq, isNull, not } from "drizzle-orm";
import { env } from "@/env";
import { liftSuspension, suspendInstallation } from "@/lib/github/suspension";
import { verifyQstashRequest } from "@/lib/verifyQstash";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const qstash = new Client({ token: env.QSTASH_TOKEN });

/**
 * Hourly: bring every provider into line with `organizationSyncs`, so the
 * traffic of an iced organization stops at the provider instead of being
 * accepted and dropped here.
 *
 * GitHub can be paused: the App installation is suspended, and unsuspended
 * and backfilled when the policy readmits the organization. Linear cannot:
 * its tokens are revoked and the connection marked disconnected, and coming
 * back is the Connect flow again. The subscription hook readmits the org that
 * has just paid immediately; this is what catches everyone else, such as a
 * policy that also ices idle organizations and lets them back on return.
 *
 * Each provider stops at its first rate-limit response and the next run
 * carries on; whatever is left over is still iced an hour later.
 */
export async function POST(request: Request) {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/integrations/jobs/suspend",
	);
	if (rejected) return rejected;

	return Response.json({ github: await github(), linear: await linear() });
}

async function github() {
	const columns = {
		id: githubInstallations.id,
		installationId: githubInstallations.installationId,
		organizationId: githubInstallations.organizationId,
	};

	const [toSuspend, toResume] = await Promise.all([
		db
			.select(columns)
			.from(githubInstallations)
			.where(
				and(
					eq(githubInstallations.suspended, false),
					not(organizationSyncs(githubInstallations.organizationId)),
				),
			),
		db
			.select(columns)
			.from(githubInstallations)
			.where(
				and(
					eq(githubInstallations.suspended, true),
					organizationSyncs(githubInstallations.organizationId),
				),
			),
	]);

	const outcomes = { suspended: 0, gone: 0, rate_limited: 0, failed: 0 };
	for (const installation of toSuspend) {
		const outcome = await suspendInstallation(installation);
		outcomes[outcome] += 1;
		if (outcome === "rate_limited") break;
	}

	let resumed = 0;
	for (const installation of toResume) {
		try {
			if (!(await liftSuspension(installation))) continue;
			await qstash.publishJSON({
				url: `${env.NEXT_PUBLIC_API_URL}/api/github/jobs/initial-sync`,
				body: {
					installationDbId: installation.id,
					organizationId: installation.organizationId,
				},
				retries: 3,
			});
			resumed += 1;
		} catch (error) {
			console.error(
				`[integrations/suspend] github resume failed for installation ${installation.installationId}:`,
				error,
			);
		}
	}

	return { candidates: toSuspend.length, ...outcomes, resumed };
}

async function linear() {
	const toRevoke = await db
		.select()
		.from(connections)
		.where(
			and(
				eq(connections.connector, "linear"),
				isNull(connections.disconnectedAt),
				not(organizationSyncs(connections.organizationId)),
			),
		);

	const outcomes = { revoked: 0, rate_limited: 0, failed: 0 };
	for (const connection of toRevoke) {
		const outcome = await revokeLinearConnection(connection).catch((error) => {
			console.error(
				`[integrations/suspend] linear revoke failed for connection ${connection.id}:`,
				error,
			);
			return "failed" as const;
		});
		outcomes[outcome] += 1;
		if (outcome === "rate_limited") break;
	}

	return { candidates: toRevoke.length, ...outcomes };
}
