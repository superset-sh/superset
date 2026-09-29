import { db } from "@superset/db/client";
import { connections, githubInstallations } from "@superset/db/schema";
import { revokeLinearConnection } from "@superset/trpc/integrations/linear";
import {
	organizationSyncs,
	organizationSyncsNow,
} from "@superset/trpc/sync-policy";
import { Client } from "@upstash/qstash";
import { and, eq, isNull, not } from "drizzle-orm";
import { env } from "@/env";
import {
	appPlacedSuspension,
	suspendInstallation,
} from "@/lib/github/suspension";
import { verifyQstashRequest } from "@/lib/verifyQstash";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const qstash = new Client({ token: env.QSTASH_TOKEN });

// api.superset.sh answers through Cloudflare, which returns 524 to the caller
// once the origin has been silent for ~100s; QStash then retries and a second
// run starts while the first is still going. The budget keeps the summary
// inside that window; every processed row is already written, and the next
// run takes the rest.
const RUN_BUDGET_MS = 60_000;

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
 * Each provider stops at its first rate-limit response or at the run budget
 * and the next run carries on; whatever is left over is still iced an hour
 * later.
 */
export async function POST(request: Request) {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/integrations/jobs/suspend",
	);
	if (rejected) return rejected;

	const deadline = Date.now() + RUN_BUDGET_MS;
	const [github, linear] = await Promise.all([
		githubPass(deadline),
		linearPass(deadline),
	]);
	return Response.json({ github, linear });
}

async function githubPass(deadline: number) {
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
	let processed = 0;
	for (const installation of toSuspend) {
		if (Date.now() > deadline) break;
		const outcome = await suspendInstallation(installation);
		outcomes[outcome] += 1;
		processed += 1;
		if (outcome === "rate_limited") break;
	}

	// The backfill job lifts the suspension itself, so it is queued first: a
	// publish that fails leaves the row suspended for the next run, rather than
	// an installation delivering again with the gap never filled.
	let resumed = 0;
	for (const installation of toResume) {
		if (Date.now() > deadline) break;
		try {
			if (!(await appPlacedSuspension(installation))) continue;
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

	return {
		candidates: toSuspend.length,
		...outcomes,
		deferred: toSuspend.length - processed,
		resumed,
	};
}

async function linearPass(deadline: number) {
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
	let processed = 0;
	for (const connection of toRevoke) {
		if (Date.now() > deadline) break;
		// Revocation costs the org a reconnect, so an org that paid since the
		// candidates were selected is left alone.
		if (await organizationSyncsNow(connection.organizationId)) continue;
		const outcome = await revokeLinearConnection(connection).catch((error) => {
			console.error(
				`[integrations/suspend] linear revoke failed for connection ${connection.id}:`,
				error,
			);
			return "failed" as const;
		});
		outcomes[outcome] += 1;
		processed += 1;
		if (outcome === "rate_limited") break;
	}

	return {
		candidates: toRevoke.length,
		...outcomes,
		deferred: toRevoke.length - processed,
	};
}
