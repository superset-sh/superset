import { db } from "@superset/db/client";
import { taskStatuses } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Plain threads have a fixed three-state lifecycle, so unlike Linear (whose
 * workflow states are synced from the API) these statuses are a static set.
 */
export const PLAIN_TASK_STATUSES = [
	{
		externalId: "TODO",
		name: "Todo",
		color: "#e2e2e2",
		type: "unstarted",
		position: 0,
	},
	{
		externalId: "SNOOZED",
		name: "Snoozed",
		color: "#95a2b3",
		type: "backlog",
		position: 1,
	},
	{
		externalId: "DONE",
		name: "Done",
		color: "#0e9f6e",
		type: "completed",
		position: 2,
	},
] as const;

/**
 * Idempotently creates the Plain task statuses for an org and returns a map
 * of Plain status (`TODO` | `SNOOZED` | `DONE`) to task status id.
 */
export async function ensurePlainStatuses(
	organizationId: string,
): Promise<Map<string, string>> {
	await db
		.insert(taskStatuses)
		.values(
			PLAIN_TASK_STATUSES.map((status) => ({
				organizationId,
				name: status.name,
				color: status.color,
				type: status.type,
				position: status.position,
				externalProvider: "plain" as const,
				externalId: status.externalId,
			})),
		)
		.onConflictDoNothing();

	const rows = await db.query.taskStatuses.findMany({
		where: and(
			eq(taskStatuses.organizationId, organizationId),
			eq(taskStatuses.externalProvider, "plain"),
		),
	});

	return new Map(
		rows
			.filter((row) => row.externalId !== null)
			.map((row) => [row.externalId as string, row.id]),
	);
}
