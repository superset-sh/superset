import { db } from "@superset/db/client";
import {
	connections,
	type IntegrationConfig,
	type SelectConnection,
	users,
} from "@superset/db/schema";
import type { Connector } from "@superset/shared/connectors";
import { and, desc, eq, isNull, ne, type SQL, sql } from "drizzle-orm";
import {
	decryptOptional,
	decryptSecret,
	encryptOptional,
	encryptSecret,
} from "../../router/plugins/crypto";
import type { ConnectorIdentity, ConnectorTokens } from "./index";

export type ConnectionConflict = { ownerEmail: string | null };

export async function connectionConflict(
	connector: string,
	externalAccountId: string,
	organizationId: string,
): Promise<ConnectionConflict | null> {
	const [conflict] = await db
		.select({ email: users.email })
		.from(connections)
		.innerJoin(users, eq(users.id, connections.connectedByUserId))
		.where(
			and(
				eq(connections.connector, connector),
				eq(connections.externalAccountId, externalAccountId),
				isNull(connections.disconnectedAt),
				ne(connections.organizationId, organizationId),
			),
		)
		.limit(1);
	return conflict ? { ownerEmail: conflict.email } : null;
}

export type UpsertConnectionResult =
	| { conflict: ConnectionConflict }
	| { conflict?: undefined; connectionId: string };

export async function upsertConnection(input: {
	connector: Connector;
	slug: string;
	authMethod: string;
	organizationId: string;
	userId: string;
	tokens: ConnectorTokens;
	identity: ConnectorIdentity;
	/** Plaintext per-connection state, written on insert and on reconnect. */
	state?: IntegrationConfig;
	/** Overrides `state` on the update path (Google merges sync state in SQL). */
	stateOnUpdate?: SQL;
}): Promise<UpsertConnectionResult> {
	const { connector, slug, organizationId, userId, tokens, identity } = input;

	const conflict = await connectionConflict(
		slug,
		identity.account.id,
		organizationId,
	);
	if (conflict) return { conflict };

	const ownerKind = connector.scope;
	const target =
		ownerKind === "org"
			? {
					target: [connections.organizationId, connections.connector],
					targetWhere: sql`${connections.ownerKind} = 'org'`,
				}
			: {
					target: [
						connections.organizationId,
						connections.connector,
						connections.connectedByUserId,
						connections.externalAccountId,
					],
					targetWhere: sql`${connections.ownerKind} = 'user'`,
				};

	const accessToken = await encryptSecret(tokens.accessToken);
	const refreshToken = await encryptOptional(tokens.refreshToken);
	const config = await encryptStored(tokens.stored);

	const [row] = await db
		.insert(connections)
		.values({
			organizationId,
			connectedByUserId: userId,
			connector: slug,
			ownerKind,
			authMethod: input.authMethod,
			accessToken,
			refreshToken,
			tokenExpiresAt: tokens.expiresAt,
			scopes: tokens.scopes,
			externalAccountId: identity.account.id,
			externalAccountLabel: identity.account.label,
			externalUserId: identity.user?.id ?? null,
			externalUserLabel: identity.user?.label ?? null,
			config,
			state: input.state ?? null,
			disconnectedAt: null,
			disconnectReason: null,
		})
		.onConflictDoUpdate({
			...target,
			set: {
				accessToken,
				refreshToken,
				tokenExpiresAt: tokens.expiresAt,
				scopes: tokens.scopes,
				externalAccountLabel: identity.account.label,
				externalUserId: identity.user?.id ?? null,
				externalUserLabel: identity.user?.label ?? null,
				config,
				...(input.stateOnUpdate
					? { state: input.stateOnUpdate }
					: input.state !== undefined
						? { state: input.state }
						: {}),
				disconnectedAt: null,
				disconnectReason: null,
			},
		})
		.returning({ id: connections.id });

	if (!row) return { conflict: { ownerEmail: null } };
	return { connectionId: row.id };
}

async function encryptStored(
	stored: Record<string, unknown>,
): Promise<Record<string, string | null> | null> {
	const keys = Object.keys(stored);
	if (!keys.length) return null;
	const entries = await Promise.all(
		keys.map(async (key) => {
			const value = stored[key];
			return [
				key,
				value === undefined || value === null
					? null
					: await encryptSecret(String(value)),
			] as const;
		}),
	);
	return Object.fromEntries(entries);
}

export interface ConnectionSecrets {
	accessToken: string;
	refreshToken: string | null;
	config: Record<string, string | null>;
}

export async function connectionSecrets(row: {
	accessToken: string;
	refreshToken: string | null;
	config: unknown;
}): Promise<ConnectionSecrets> {
	const stored = (row.config ?? {}) as Record<string, string | null>;
	const entries = await Promise.all(
		Object.entries(stored).map(
			async ([key, value]) => [key, await decryptOptional(value)] as const,
		),
	);
	return {
		accessToken: await decryptSecret(row.accessToken),
		refreshToken: await decryptOptional(row.refreshToken),
		config: Object.fromEntries(entries),
	};
}

export async function activeConnection(
	userId: string,
	connector: string,
	organizationId: string | null,
): Promise<SelectConnection | null> {
	if (!organizationId) return null;
	const [row] = await db
		.select()
		.from(connections)
		.where(
			and(
				eq(connections.organizationId, organizationId),
				eq(connections.connector, connector),
				eq(connections.connectedByUserId, userId),
				isNull(connections.disconnectedAt),
			),
		)
		.orderBy(desc(connections.updatedAt))
		.limit(1);
	return row ?? null;
}
