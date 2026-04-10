import { db } from "@superset/db/client";
import { subscriptions } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Look up the active subscription plan for an organization.
 *
 * Used by both `customSession` (cookie auth path) and `customAccessTokenClaims`
 * (OAuth JWT mint path) so the two flows can never report a different plan
 * for the same org.
 */
export async function resolvePlanForOrganization(
	organizationId: string | null | undefined,
): Promise<string | null> {
	if (!organizationId) return null;

	const subscription = await db.query.subscriptions.findFirst({
		where: and(
			eq(subscriptions.referenceId, organizationId),
			eq(subscriptions.status, "active"),
		),
	});

	return subscription?.plan ?? null;
}
