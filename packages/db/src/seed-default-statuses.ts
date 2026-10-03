import { and, eq, isNull } from "drizzle-orm";
import { dbWs } from "./client";
import type { InsertTaskStatus } from "./schema";
import { taskStatuses } from "./schema";

type DbWsTransaction = Parameters<Parameters<typeof dbWs.transaction>[0]>[0];
type Executor = typeof dbWs | DbWsTransaction;

/**
 * Linear's fill for its "started" icons: one state is half full, two are half
 * and three-quarters, more are spaced evenly below full (full is "completed").
 */
export function startedStatusProgress(total: number): number[] {
	if (total === 1) return [50];
	if (total === 2) return [50, 75];
	return Array.from({ length: total }, (_, index) =>
		Math.round(((index + 1) / (total + 1)) * 100),
	);
}

const [IN_PROGRESS, IN_REVIEW] = startedStatusProgress(2);

const DEFAULT_STATUSES: Array<
	Pick<
		InsertTaskStatus,
		"name" | "color" | "type" | "position" | "progressPercent"
	>
> = [
	{ name: "Backlog", color: "#95a2b3", type: "backlog", position: 0 },
	{ name: "Todo", color: "#e2e2e2", type: "unstarted", position: 1 },
	{
		name: "In Progress",
		color: "#f2c94c",
		type: "started",
		position: 2,
		progressPercent: IN_PROGRESS,
	},
	{
		name: "In Review",
		color: "#0f783c",
		type: "started",
		position: 3,
		progressPercent: IN_REVIEW,
	},
	{ name: "Done", color: "#5e6ad2", type: "completed", position: 4 },
	{ name: "Canceled", color: "#95a2b3", type: "canceled", position: 5 },
];

/**
 * Seed default task statuses for an organization. Idempotent.
 * Pass a transaction (`tx`) to run within an existing transaction,
 * otherwise wraps in its own via `dbWs`.
 */
export async function seedDefaultStatuses(
	organizationId: string,
	executor: Executor = dbWs,
): Promise<string> {
	const [existing] = await executor
		.select({ id: taskStatuses.id })
		.from(taskStatuses)
		.where(
			and(
				eq(taskStatuses.organizationId, organizationId),
				eq(taskStatuses.type, "backlog"),
				isNull(taskStatuses.externalProvider),
			),
		)
		.orderBy(taskStatuses.position)
		.limit(1);

	if (existing) return existing.id;

	const rows = DEFAULT_STATUSES.map((s) => ({
		...s,
		organizationId,
	}));

	const created = await executor
		.insert(taskStatuses)
		.values(rows)
		.returning({ id: taskStatuses.id, type: taskStatuses.type });

	const backlog = created.find((s) => s.type === "backlog");
	if (!backlog) throw new Error("Failed to seed default task statuses");
	return backlog.id;
}
