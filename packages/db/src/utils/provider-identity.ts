import { and, eq } from "drizzle-orm";
import { db } from "../client";
import { accounts, userIdentities } from "../schema";

/**
 * A user's id at an external provider, for "Me" scopes and people pickers.
 *
 * A user_identities row wins when one exists — it is the explicit, org-scoped
 * link. For GitHub none are written yet, so a GitHub sign-in's better-auth
 * account supplies the same global id. Null when the user has neither, which
 * callers treat as "matches nobody".
 */
export async function findProviderIdentity(params: {
	organizationId: string;
	userId: string;
	provider: string;
}): Promise<{ externalId: string; handle: string | null } | null> {
	const identity = await db.query.userIdentities.findFirst({
		where: and(
			eq(userIdentities.organizationId, params.organizationId),
			eq(userIdentities.userId, params.userId),
			eq(userIdentities.provider, params.provider),
		),
		columns: { externalId: true, handle: true },
	});
	if (identity) {
		return { externalId: identity.externalId, handle: identity.handle };
	}

	if (params.provider !== "github") return null;
	const account = await db.query.accounts.findFirst({
		where: and(
			eq(accounts.userId, params.userId),
			eq(accounts.providerId, "github"),
		),
		columns: { accountId: true },
	});
	return account ? { externalId: account.accountId, handle: null } : null;
}
