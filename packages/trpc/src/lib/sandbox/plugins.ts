import { db } from "@superset/db/client";
import { organizationPlugins, pluginInstalls } from "@superset/db/schema";
import type { SandboxPlugin } from "@superset/shared/sandbox-contract";
import { and, asc, eq, isNotNull, isNull, or } from "drizzle-orm";

export async function creatorPlugins(
	userId: string | null,
	organizationId: string,
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
						isNotNull(organizationPlugins.publishedAt),
					),
				),
			),
		)
		.orderBy(asc(pluginInstalls.pluginName));
}
