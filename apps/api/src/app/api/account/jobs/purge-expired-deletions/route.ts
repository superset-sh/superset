import { db } from "@superset/db/client";
import { users } from "@superset/db/schema";
import { ACCOUNT_DELETION_GRACE_DAYS } from "@superset/shared/constants";
import {
	findOrganizationSolelyOwnedBy,
	purgeAccount,
} from "@superset/trpc/account-purge";
import { and, asc, eq, isNull, lt } from "drizzle-orm";

import { singleFlight } from "@/lib/singleFlight";
import { verifyQstashRequest } from "@/lib/verifyQstash";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PATH = "/api/account/jobs/purge-expired-deletions";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Ceiling on purge attempts per run. A few accounts a day expire in steady
 * state, so this is only a brake on a backlog: each purge is a handful of
 * PostHog and Stripe calls, and the QStash schedule (daily, kept in the
 * Upstash console, not in this repo) picks up whatever a run leaves. Counts
 * attempts rather than rows selected because a sole-owner skip stays in the
 * selection forever and, being oldest, would otherwise fill it.
 */
const MAX_ATTEMPTS_PER_RUN = 50;

/** Stays inside maxDuration so a run ends by choice rather than by kill. */
const TIME_BUDGET_MS = 240_000;

type Outcome =
	| { status: "purged" }
	| { status: "already purged" }
	| { status: "sole owner"; organizationId: string };

/**
 * Purges accounts whose deletion request is older than the recovery window.
 *
 * user.deleteAccount only marks the account, and user.reactivateAccount
 * refuses once the window has passed, so without this nothing ever finishes
 * a deletion: the user can neither come back nor sign up again with the same
 * email. Each account is claimed under the job lock and re-read there, so a
 * run that overlaps or repeats another purges nothing twice, and one failing
 * account is logged and skipped rather than ending the run.
 */
export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const rejected = await verifyQstashRequest(request, body, PATH);
	if (rejected) return rejected;

	const cutoff = new Date(Date.now() - ACCOUNT_DELETION_GRACE_DAYS * DAY_MS);
	const expired = await db
		.select({ id: users.id })
		.from(users)
		.where(and(isNull(users.deletedAt), lt(users.deletionRequestedAt, cutoff)))
		.orderBy(asc(users.deletionRequestedAt));

	const deadline = Date.now() + TIME_BUDGET_MS;
	const purged: string[] = [];
	const skipped: Array<{ userId: string; organizationId: string }> = [];
	const failed: string[] = [];
	let heldByAnotherRun = false;
	let outOfTime = false;

	for (const { id } of expired) {
		if (purged.length + failed.length >= MAX_ATTEMPTS_PER_RUN) break;
		if (Date.now() > deadline) {
			outOfTime = true;
			break;
		}
		try {
			const attempt = await singleFlight(
				"account.purge-expired-deletions",
				async (tx): Promise<Outcome> => {
					const [current] = await tx
						.select({ deletedAt: users.deletedAt })
						.from(users)
						.where(eq(users.id, id));
					if (!current || current.deletedAt)
						return { status: "already purged" };
					const organizationId = await findOrganizationSolelyOwnedBy(id);
					if (organizationId) return { status: "sole owner", organizationId };
					await purgeAccount(id);
					return { status: "purged" };
				},
			);
			if (!attempt.ran) {
				heldByAnotherRun = true;
				break;
			}
			const outcome = attempt.result;
			if (outcome.status === "purged") purged.push(id);
			if (outcome.status === "sole owner") {
				console.warn(
					`[account/purge-expired-deletions] ${id} is the only owner of ${outcome.organizationId}, which has other members; left unpurged`,
				);
				skipped.push({ userId: id, organizationId: outcome.organizationId });
			}
		} catch (error) {
			console.error(`[account/purge-expired-deletions] ${id} failed:`, error);
			failed.push(id);
		}
	}

	return Response.json({
		purged,
		skipped,
		failed,
		heldByAnotherRun,
		outOfTime,
	});
}
