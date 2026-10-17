import { db } from "@superset/db/client";
import { users } from "@superset/db/schema";
import { ACCOUNT_DELETION_GRACE_DAYS } from "@superset/shared/constants";
import {
	findOrganizationSolelyOwnedBy,
	purgeAccount,
} from "@superset/trpc/account-purge";
import { and, asc, eq, isNull, lt } from "drizzle-orm";

import { singleFlight } from "@/lib/singleFlight";

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

export interface PurgeExpiredDeletionsResult {
	dryRun: boolean;
	purged: string[];
	/** Dry run only: the accounts a real run would have purged. */
	wouldPurge: string[];
	skipped: Array<{ userId: string; organizationId: string }>;
	failed: string[];
	heldByAnotherRun: boolean;
	outOfTime: boolean;
}

/**
 * Purges accounts whose deletion request is older than the recovery window.
 *
 * user.deleteAccount only marks the account, and user.reactivateAccount
 * refuses once the window has passed, so without this nothing ever finishes
 * a deletion: the user can neither come back nor sign up again with the same
 * email. Each account is claimed under the job lock and re-read there, so a
 * run that overlaps or repeats another purges nothing twice, and one failing
 * account is logged and skipped rather than ending the run.
 *
 * A dry run makes the same selection and sole-owner checks but writes nothing.
 */
export async function purgeExpiredDeletions({
	now,
	dryRun,
}: {
	now: () => number;
	dryRun: boolean;
}): Promise<PurgeExpiredDeletionsResult> {
	const cutoff = new Date(now() - ACCOUNT_DELETION_GRACE_DAYS * DAY_MS);
	const expired = await db
		.select({ id: users.id })
		.from(users)
		.where(and(isNull(users.deletedAt), lt(users.deletionRequestedAt, cutoff)))
		.orderBy(asc(users.deletionRequestedAt));

	const deadline = now() + TIME_BUDGET_MS;
	const result: PurgeExpiredDeletionsResult = {
		dryRun,
		purged: [],
		wouldPurge: [],
		skipped: [],
		failed: [],
		heldByAnotherRun: false,
		outOfTime: false,
	};
	const log = dryRun
		? "[account/purge-expired-deletions] (dry run)"
		: "[account/purge-expired-deletions]";

	for (const { id } of expired) {
		const attempts =
			result.purged.length + result.wouldPurge.length + result.failed.length;
		if (attempts >= MAX_ATTEMPTS_PER_RUN) break;
		if (now() > deadline) {
			result.outOfTime = true;
			break;
		}
		try {
			let outcome: Outcome;
			if (dryRun) {
				const organizationId = await findOrganizationSolelyOwnedBy(id);
				outcome = organizationId
					? { status: "sole owner", organizationId }
					: { status: "purged" };
			} else {
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
					result.heldByAnotherRun = true;
					break;
				}
				outcome = attempt.result;
			}

			if (outcome.status === "purged") {
				(dryRun ? result.wouldPurge : result.purged).push(id);
				console.info(`${log} ${id} ${dryRun ? "would be purged" : "purged"}`);
			}
			if (outcome.status === "already purged") {
				console.info(`${log} ${id} already purged`);
			}
			if (outcome.status === "sole owner") {
				console.warn(
					`${log} ${id} is the only owner of ${outcome.organizationId}, which has other members; left unpurged`,
				);
				result.skipped.push({
					userId: id,
					organizationId: outcome.organizationId,
				});
			}
		} catch (error) {
			console.error(`${log} ${id} failed:`, error);
			result.failed.push(id);
		}
	}

	return result;
}
