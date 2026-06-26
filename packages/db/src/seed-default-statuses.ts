import { and, eq, isNull, sql } from "drizzle-orm";
import { dbWs } from "./client";
import type { InsertTaskStatus } from "./schema";
import { taskStatuses } from "./schema";

type DbWsTransaction = Parameters<Parameters<typeof dbWs.transaction>[0]>[0];
type Executor = typeof dbWs | DbWsTransaction;

const DEFAULT_STATUSES: Array<
	Pick<InsertTaskStatus, "name" | "color" | "type" | "position">
> = [
	{ name: "Backlog", color: "#95a2b3", type: "backlog", position: 0 },
	{ name: "Todo", color: "#e2e2e2", type: "unstarted", position: 1 },
	{ name: "In Progress", color: "#f2c94c", type: "started", position: 2 },
	{ name: "Done", color: "#0e9f6e", type: "completed", position: 3 },
	{ name: "Canceled", color: "#95a2b3", type: "canceled", position: 4 },
];

const LOCK_KEY_PREFIX = "task_status_seed:";

/**
 * Seed default task statuses for an organization. Idempotent under
 * concurrent invocations: takes a transaction-scoped advisory lock keyed
 * by organization id so the existence check and insert run atomically
 * for a given org. Pass a transaction (`tx`) to run within an existing
 * transaction, otherwise wraps in its own via `dbWs`.
 */
export async function seedDefaultStatuses(
	organizationId: string,
	executor: Executor = dbWs,
): Promise<string> {
	if (executor === dbWs) {
		return dbWs.transaction((tx) => seedInTransaction(organizationId, tx));
	}
	return seedInTransaction(organizationId, executor as DbWsTransaction);
}

async function seedInTransaction(
	organizationId: string,
	tx: DbWsTransaction,
): Promise<string> {
	await tx.execute(
		sql`SELECT pg_advisory_xact_lock(hashtextextended(${LOCK_KEY_PREFIX + organizationId}, 0))`,
	);

	const [existing] = await tx
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

	const created = await tx
		.insert(taskStatuses)
		.values(rows)
		.returning({ id: taskStatuses.id, type: taskStatuses.type });

	const backlog = created.find((s) => s.type === "backlog");
	if (!backlog) throw new Error("Failed to seed default task statuses");
	return backlog.id;
}
