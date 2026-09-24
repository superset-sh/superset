import type {
	InsertConnection,
	SelectIntegrationConnection,
	SelectUserIdentity,
} from "@superset/db/schema";
import { getConnector } from "@superset/shared/connectors";

export type LegacyIdentity = Pick<
	SelectUserIdentity,
	"externalId" | "externalScopeId" | "displayName" | "metadata"
>;

export type ExternalUserSource = "identity" | "superset-user" | "not-required";

export interface LegacyConnectionMapping {
	row: InsertConnection;
	externalUserSource: ExternalUserSource;
}

/**
 * The `connections` row a legacy `integration_connections` row becomes.
 *
 * The id is kept. `automation_events` dedupes on it and Linear and Gmail
 * build their event and resource keys from it, so a new id would make
 * every past delivery look new and could fire its automations again.
 *
 * The old `config` moves to `state` unchanged: it is the same
 * `IntegrationConfig`, and it carries what cannot be recreated, such as
 * Linear's `newTasksTeamId`, Google's watch channels and sync tokens, the
 * Teams `clientState` that live Graph subscriptions echo back, and Sentry's
 * `installationUuid`.
 */
export async function legacyConnectionRow(
	legacy: SelectIntegrationConnection,
	identities: LegacyIdentity[],
	seal: (plaintext: string) => Promise<string>,
): Promise<LegacyConnectionMapping> {
	const connector = getConnector(legacy.provider);
	const method = connector?.methods[0];
	if (!connector || !method)
		throw new Error(`No connector is defined for ${legacy.provider}`);
	if (!legacy.externalOrgId)
		throw new Error(`Connection ${legacy.id} has no external account id`);

	const externalAccountId =
		legacy.provider === "google"
			? legacy.externalOrgId.toLowerCase()
			: legacy.externalOrgId;

	const externalUser = externalUserFor(
		legacy,
		externalAccountId,
		connector.scope,
		identities,
	);

	const accessToken = await seal(legacy.accessToken);

	return {
		externalUserSource: externalUser.source,
		row: {
			id: legacy.id,
			organizationId: legacy.organizationId,
			connectedByUserId: legacy.connectedByUserId,
			connector: legacy.provider,
			ownerKind: connector.scope,
			authMethod: method.type,
			accessToken,
			refreshToken: legacy.refreshToken
				? await seal(legacy.refreshToken)
				: null,
			tokenExpiresAt: legacy.tokenExpiresAt,
			scopes: null,
			externalAccountId,
			externalAccountLabel: legacy.externalOrgName,
			externalUserId: externalUser.id,
			externalUserLabel: externalUser.label,
			config:
				legacy.provider === "slack"
					? { bot_token: accessToken, bot_user_id: null, slack_user_id: null }
					: null,
			state: legacy.config,
			disconnectedAt: legacy.disconnectedAt,
			disconnectReason: legacy.disconnectReason,
			createdAt: legacy.createdAt,
			updatedAt: legacy.updatedAt,
		},
	};
}

function externalUserFor(
	legacy: SelectIntegrationConnection,
	externalAccountId: string,
	scope: "user" | "org",
	identities: LegacyIdentity[],
): { id: string | null; label: string | null; source: ExternalUserSource } {
	if (scope === "org") return { id: null, label: null, source: "not-required" };

	if (legacy.provider === "google") {
		const identity = identities.find((i) => i.externalId === externalAccountId);
		const sub =
			identity?.metadata?.provider === "google"
				? identity.metadata.sub
				: undefined;
		if (sub) return { id: sub, label: externalAccountId, source: "identity" };
	} else {
		const identity = identities.find(
			(i) => i.externalScopeId === externalAccountId,
		);
		if (identity)
			return {
				id: identity.externalId,
				label: identity.displayName,
				source: "identity",
			};
	}

	// The Slack callback falls back to the Superset user id the same way. No
	// reader uses this column for these connectors, and a reconnect replaces it.
	return { id: legacy.connectedByUserId, label: null, source: "superset-user" };
}
