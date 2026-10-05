import { db } from "@superset/db/client";
import { connections, organizations } from "@superset/db/schema";
import { and, eq, isNull, notExists } from "drizzle-orm";

export async function trackTasksInSupersetWithoutLinear(
	organizationId: string,
): Promise<void> {
	await db
		.update(organizations)
		.set({ taskTracker: "superset" })
		.where(
			and(
				eq(organizations.id, organizationId),
				eq(organizations.taskTracker, "linear"),
				notExists(
					db
						.select({ id: connections.id })
						.from(connections)
						.where(
							and(
								eq(connections.organizationId, organizationId),
								eq(connections.connector, "linear"),
								isNull(connections.disconnectedAt),
							),
						),
				),
			),
		);
}
