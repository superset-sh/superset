import { db } from "@superset/db/client";
import { connections, pluginInstalls } from "@superset/db/schema";
import type {
	SandboxPlugin,
	SandboxPluginConnection,
} from "@superset/shared/sandbox-contract";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { NEEDS_REAUTH } from "../connectors/refresh";

export async function creatorPlugins(
	userId: string | null,
): Promise<SandboxPlugin[]> {
	if (!userId) return [];
	return await db
		.select({
			marketplace: pluginInstalls.marketplace,
			name: pluginInstalls.pluginName,
			version: pluginInstalls.version,
			enabled: pluginInstalls.enabled,
		})
		.from(pluginInstalls)
		.where(eq(pluginInstalls.userId, userId))
		.orderBy(asc(pluginInstalls.pluginName));
}

/** Same rows and order as `connectors.status`, so a box names each account's MCP entry the way the creator's machine does. */
export async function creatorPluginConnections(
	userId: string | null,
	organizationId: string,
): Promise<SandboxPluginConnection[]> {
	if (!userId) return [];
	const rows = await db.query.connections.findMany({
		orderBy: (row, { asc }) => [asc(row.createdAt), asc(row.id)],
		where: and(
			eq(connections.organizationId, organizationId),
			or(
				eq(connections.ownerKind, "org"),
				eq(connections.connectedByUserId, userId),
			),
			or(
				isNull(connections.disconnectedAt),
				eq(connections.disconnectReason, NEEDS_REAUTH),
			),
		),
		columns: {
			id: true,
			connector: true,
			externalUserId: true,
			externalUserLabel: true,
			externalAccountLabel: true,
			nickname: true,
		},
	});
	return rows.map((row) => ({
		connector: row.connector,
		connectionId: row.id,
		externalUserId: row.externalUserId,
		nickname: row.nickname,
		label: row.externalUserLabel ?? row.externalAccountLabel,
	}));
}
