import { db } from "@superset/db/client";
import { pluginInstalls } from "@superset/db/schema";
import type { SandboxPlugin } from "@superset/shared/sandbox-contract";
import { and, asc, eq, isNull, or } from "drizzle-orm";

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
		.where(
			and(
				eq(pluginInstalls.userId, userId),
				or(
					isNull(pluginInstalls.organizationId),
					eq(pluginInstalls.organizationId, organizationId),
				),
			),
		)
		.orderBy(asc(pluginInstalls.pluginName));
}
