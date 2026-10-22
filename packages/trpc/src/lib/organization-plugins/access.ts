import { db } from "@superset/db/client";
import {
	members,
	organizationPlugins,
	pluginInstalls,
} from "@superset/db/schema";
import { organizationMarketplace } from "@superset/shared/plugins";
import { and, eq, inArray, type SQL, sql } from "drizzle-orm";

export async function memberRole(
	userId: string,
	organizationId: string,
): Promise<string | null> {
	const [row] = await db
		.select({ role: members.role })
		.from(members)
		.where(
			and(
				eq(members.userId, userId),
				eq(members.organizationId, organizationId),
			),
		)
		.limit(1);
	return row?.role ?? null;
}

/** Rows of `organization_plugins` this role may see and install. */
export function accessibleTo(role: string | null): SQL {
	if (!role) return sql`false`;
	return inArray(sql`${organizationPlugins.installPolicy} ->> ${role}`, [
		"available",
		"installed",
	]);
}

export function installedFor(role: string | null): SQL {
	if (!role) return sql`false`;
	return eq(sql`${organizationPlugins.installPolicy} ->> ${role}`, "installed");
}

/** Records an install for every plugin the organization installs for this member's role, so it reaches their machines and cloud workspaces like one they chose. */
export async function ensureManagedInstalls(
	userId: string,
	organizationId: string,
): Promise<void> {
	const role = await memberRole(userId, organizationId);
	const managed = await db
		.select()
		.from(organizationPlugins)
		.where(
			and(
				eq(organizationPlugins.organizationId, organizationId),
				installedFor(role),
			),
		);
	if (!managed.length) return;
	await db
		.insert(pluginInstalls)
		.values(
			managed.map((plugin) => ({
				userId,
				organizationId,
				marketplace: organizationMarketplace(organizationId),
				pluginName: plugin.name,
				version: plugin.version,
				manifest: plugin.manifest,
				organizationPluginId: plugin.id,
			})),
		)
		.onConflictDoNothing();
}
