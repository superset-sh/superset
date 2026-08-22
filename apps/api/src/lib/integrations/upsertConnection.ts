import { db } from "@superset/db/client";
import {
	type IntegrationConfig,
	type IntegrationProvider,
	integrationConnections,
	users,
} from "@superset/db/schema";
import { and, eq, isNull, ne, type SQL, sql } from "drizzle-orm";

const UNIQUE_VIOLATION = "23505";
const ACTIVE_LINKAGE_INDEXES = new Set([
	"integration_connections_provider_external_org_active_unique",
	"integration_connections_slack_external_org_active_unique",
]);

export type ConnectionConflict = { ownerEmail: string | null };

/**
 * The active connection in a DIFFERENT Superset organization already holding
 * this external workspace/tenant/account, if any. One external org, one
 * Superset organization: a second organization claiming the same one would
 * receive its events too.
 */
export async function connectionConflict(
	provider: IntegrationProvider,
	externalOrgId: string,
	organizationId: string,
): Promise<ConnectionConflict | null> {
	const [conflict] = await db
		.select({ email: users.email })
		.from(integrationConnections)
		.innerJoin(users, eq(users.id, integrationConnections.connectedByUserId))
		.where(
			and(
				eq(integrationConnections.provider, provider),
				eq(integrationConnections.externalOrgId, externalOrgId),
				isNull(integrationConnections.disconnectedAt),
				ne(integrationConnections.organizationId, organizationId),
			),
		)
		.limit(1);
	return conflict ? { ownerEmail: conflict.email } : null;
}

type UpsertConnectionInput = {
	organizationId: string;
	userId: string;
	provider: IntegrationProvider;
	accessToken: string;
	/** Omit to leave the stored value alone on reconnect. */
	refreshToken?: string | null;
	tokenExpiresAt?: Date | null;
	externalOrgId: string;
	externalOrgName?: string | null;
	/** Omit to leave the stored config alone on reconnect. */
	config?: IntegrationConfig;
	/** Overrides `config` on the update path (Google merges sync state in SQL). */
	configOnUpdate?: SQL;
};

export type UpsertConnectionResult =
	| { conflict: ConnectionConflict }
	| { conflict?: undefined; connectionId: string };

/**
 * Writes (or revives) the organization's connection for a provider. Refuses
 * with `conflict` when the external org is already actively linked to a
 * different Superset organization.
 */
export async function upsertConnection(
	input: UpsertConnectionInput,
): Promise<UpsertConnectionResult> {
	const conflict = await connectionConflict(
		input.provider,
		input.externalOrgId,
		input.organizationId,
	);
	if (conflict) return { conflict };

	// One connection per organization for org-scoped providers; Google is per
	// member. Both uniquenesses are partial indexes, and Postgres only infers a
	// partial index when the predicate is named in the conflict target.
	const conflictTarget =
		input.provider === "google"
			? {
					target: [
						integrationConnections.organizationId,
						integrationConnections.provider,
						integrationConnections.connectedByUserId,
					],
					targetWhere: sql`${integrationConnections.provider} = 'google'`,
				}
			: {
					target: [
						integrationConnections.organizationId,
						integrationConnections.provider,
					],
					targetWhere: sql`${integrationConnections.provider} <> 'google'`,
				};

	try {
		const [connection] = await db
			.insert(integrationConnections)
			.values({
				organizationId: input.organizationId,
				connectedByUserId: input.userId,
				provider: input.provider,
				accessToken: input.accessToken,
				refreshToken: input.refreshToken,
				tokenExpiresAt: input.tokenExpiresAt,
				externalOrgId: input.externalOrgId,
				externalOrgName: input.externalOrgName,
				config: input.config,
			})
			.onConflictDoUpdate({
				...conflictTarget,
				set: {
					accessToken: input.accessToken,
					refreshToken: input.refreshToken,
					tokenExpiresAt: input.tokenExpiresAt,
					externalOrgId: input.externalOrgId,
					externalOrgName: input.externalOrgName,
					connectedByUserId: input.userId,
					config: input.configOnUpdate ?? input.config,
					disconnectedAt: null,
					disconnectReason: null,
					updatedAt: new Date(),
				},
			})
			.returning({ id: integrationConnections.id });
		if (!connection) throw new Error("Connection upsert returned no row");
		return { connectionId: connection.id };
	} catch (error) {
		// Racing connects: the partial unique index on active external orgs wins
		// where the pre-check above cannot.
		const raced = error as { code?: string; constraint?: string };
		if (
			raced.code === UNIQUE_VIOLATION &&
			raced.constraint &&
			ACTIVE_LINKAGE_INDEXES.has(raced.constraint)
		) {
			return { conflict: { ownerEmail: null } };
		}
		throw error;
	}
}
