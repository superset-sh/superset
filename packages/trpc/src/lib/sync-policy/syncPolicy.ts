import { db } from "@superset/db/client";
import { subscriptions } from "@superset/db/schema";
import { organizations } from "@superset/db/schema/auth";
import {
	ACTIVE_SUBSCRIPTION_STATUSES,
	PAID_PLAN_TIERS,
} from "@superset/shared/billing";
import {
	and,
	eq,
	exists,
	gt,
	inArray,
	or,
	type SQL,
	type SQLWrapper,
	sql,
} from "drizzle-orm";

/**
 * How long a lapsed subscription keeps its integrations. An organization that
 * comes back inside the week finds everything as it left it; after that its
 * GitHub installation is suspended and its Linear tokens revoked, and coming
 * back means connecting again.
 */
const LAPSE_GRACE = sql`now() - interval '7 days'`;

/**
 * Whether an organization's integrations sync at all: webhooks accepted,
 * tokens refreshed, backfills run, GitHub App installation unsuspended.
 *
 * Today that is "on a paying plan, or was until less than a week ago". This
 * is the one place to add a rule such as recent activity; every consumer takes
 * the predicate from here, so the suspend cron and the accept paths cannot
 * disagree about who is iced.
 */
export function organizationSyncs(organizationId: SQLWrapper): SQL {
	return exists(
		db
			.select({ id: subscriptions.id })
			.from(subscriptions)
			.where(
				and(
					eq(subscriptions.referenceId, organizationId),
					inArray(subscriptions.plan, [...PAID_PLAN_TIERS]),
					or(
						inArray(subscriptions.status, [...ACTIVE_SUBSCRIPTION_STATUSES]),
						and(
							eq(subscriptions.status, "canceled"),
							gt(
								sql`coalesce(${subscriptions.endedAt}, ${subscriptions.periodEnd}, ${subscriptions.updatedAt})`,
								LAPSE_GRACE,
							),
						),
					),
				),
			),
	);
}

export async function syncingOrganizationIds(
	organizationIds: string[],
): Promise<Set<string>> {
	if (organizationIds.length === 0) return new Set();
	const rows = await db
		.select({ id: organizations.id })
		.from(organizations)
		.where(
			and(
				inArray(organizations.id, organizationIds),
				organizationSyncs(organizations.id),
			),
		);
	return new Set(rows.map((row) => row.id));
}

export async function organizationSyncsNow(
	organizationId: string,
): Promise<boolean> {
	return (await syncingOrganizationIds([organizationId])).has(organizationId);
}
