import { db } from "@superset/db/client";
import { users } from "@superset/db/schema";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { eq } from "drizzle-orm";
import { userError } from "../../i18n-error";
import { posthog } from "../analytics";

/**
 * Gate every cloud-sandbox procedure — workspaces, environments, secrets — on
 * the flag the clients already hide the Cloud option behind, so the allowlist
 * lives in its release conditions rather than the repository.
 *
 * Not `cloud-access`, despite the name: that one resolves to a broad cohort of
 * mostly external accounts, and sandboxes bill by the hour with no idle-stop.
 *
 * Fails closed — `isFeatureEnabled` resolves undefined when PostHog is
 * unreachable, so an outage suspends cloud access rather than opening it.
 */
export async function assertCloudAccess(ctx: {
	userId: string;
	session: { user: { id: string; email: string } } | null;
}): Promise<void> {
	const account = (await currentEmail(ctx))?.trim().toLowerCase() ?? "";
	const enabled = await posthog.isFeatureEnabled(
		FEATURE_FLAGS.CLOUD_WORKSPACES,
		ctx.userId,
		{
			// Sent explicitly: the conditions are email-based, and a person
			// PostHog has not seen yet would otherwise be refused for the wrong
			// reason. No exposure events — this is authorization, not an experiment.
			personProperties: { email: account },
			sendFeatureFlagEvents: false,
		},
	);
	if (enabled) return;

	throw userError({
		code: "FORBIDDEN",
		message: `Cloud sandboxes are limited to the Superset team while the feature is in internal testing, and ${account || "this account"} is not on the list.`,
		i18nKey: "serverError.cloudWorkspace.cloudSandboxesAreInternalOnly",
		params: { account: account || "this account" },
	});
}

/**
 * The context has already loaded this user's row — `getSession`, or
 * `sessionFromOAuthBearer` for a bearer — so read it there rather than
 * spending a second query on it. Only a session describing somebody else
 * (a cookie and a bearer disagreeing) needs the lookup.
 */
async function currentEmail(ctx: {
	userId: string;
	session: { user: { id: string; email: string } } | null;
}): Promise<string | null> {
	if (ctx.session?.user.id === ctx.userId) return ctx.session.user.email;
	const user = await db.query.users.findFirst({
		where: eq(users.id, ctx.userId),
		columns: { email: true },
	});
	return user?.email ?? null;
}

export function assertMember(
	organizationIds: string[],
	organizationId: string,
): void {
	if (!organizationIds.includes(organizationId)) {
		throw userError({
			code: "FORBIDDEN",
			message: "Not a member of this organization",
			i18nKey: "serverError.cloudWorkspace.notAMemberOfThisOrganization",
		});
	}
}
