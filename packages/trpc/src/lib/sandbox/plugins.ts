import { db } from "@superset/db/client";
import { pluginInstalls } from "@superset/db/schema";
import type { SandboxPlugin } from "@superset/shared/sandbox-contract";
import { asc, eq } from "drizzle-orm";

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
