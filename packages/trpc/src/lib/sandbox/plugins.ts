import { db } from "@superset/db/client";
import { organizationPlugins, pluginInstalls } from "@superset/db/schema";
import type { SandboxPlugin } from "@superset/shared/sandbox-contract";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import {
	accessibleTo,
	ensureManagedInstalls,
	memberRole,
} from "../organization-plugins";

export async function creatorPlugins(
	userId: string | null,
	organizationId: string,
): Promise<SandboxPlugin[]> {
	if (!userId) return [];
	await ensureManagedInstalls(userId, organizationId);
	const role = await memberRole(userId, organizationId);
	return await db
		.select({
			marketplace: pluginInstalls.marketplace,
			name: pluginInstalls.pluginName,
			version: pluginInstalls.version,
			enabled: pluginInstalls.enabled,
		})
		.from(pluginInstalls)
		.leftJoin(
			organizationPlugins,
			eq(organizationPlugins.id, pluginInstalls.organizationPluginId),
		)
		.where(
			and(
				eq(pluginInstalls.userId, userId),
				or(
					isNull(pluginInstalls.organizationId),
					and(
						eq(pluginInstalls.organizationId, organizationId),
						accessibleTo(role),
					),
				),
			),
		)
		.orderBy(asc(pluginInstalls.pluginName));
}
