import { db } from "@superset/db/client";
import { type UserIdentityMetadata, userIdentities } from "@superset/db/schema";

type UpsertIdentityInput = {
	userId: string;
	organizationId: string;
	provider: string;
	externalId: string;
	/** The workspace/tenant the id is scoped to; null for globally-unique ids. */
	externalScopeId: string | null;
	handle?: string | null;
	displayName?: string | null;
	metadata?: UserIdentityMetadata;
};

/**
 * Links an external account to a Superset user. Re-linking claims the account
 * for whoever linked it last.
 */
export async function upsertIdentity(
	input: UpsertIdentityInput,
): Promise<void> {
	await db
		.insert(userIdentities)
		.values({
			userId: input.userId,
			organizationId: input.organizationId,
			provider: input.provider,
			externalId: input.externalId,
			externalScopeId: input.externalScopeId,
			handle: input.handle,
			displayName: input.displayName,
			metadata: input.metadata,
		})
		.onConflictDoUpdate({
			target: [
				userIdentities.organizationId,
				userIdentities.provider,
				userIdentities.externalScopeId,
				userIdentities.externalId,
			],
			set: {
				userId: input.userId,
				handle: input.handle,
				displayName: input.displayName,
				metadata: input.metadata,
			},
		});
}
