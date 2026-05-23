import { describe, expect, mock, test } from "bun:test";

mock.module("./client", () => ({
	dbWs: {} as never,
}));

mock.module("drizzle-orm", () => ({
	and: (...conditions: unknown[]) => ({ type: "and", conditions }),
	eq: (left: unknown, right: unknown) => ({ type: "eq", left, right }),
	isNull: (value: unknown) => ({ type: "isNull", value }),
}));

mock.module("./schema", () => ({
	taskStatuses: {
		id: "task_statuses.id",
		organizationId: "task_statuses.organization_id",
		type: "task_statuses.type",
		externalProvider: "task_statuses.external_provider",
		position: "task_statuses.position",
	},
}));

const { seedDefaultStatuses } = await import("./seed-default-statuses");

type InsertedRow = { type: string; id: string };

function createMockExecutor(initialRows: InsertedRow[] = []) {
	const rows: InsertedRow[] = [...initialRows];
	const insertCalls: InsertedRow[][] = [];
	let nextInsertId = 0;

	const select = mock(() => ({
		from: () => ({
			where: () => ({
				orderBy: () => ({
					limit: async () => {
						const backlog = rows.find((r) => r.type === "backlog");
						return backlog ? [{ id: backlog.id }] : [];
					},
				}),
			}),
		}),
	}));

	const insert = mock(() => ({
		values: (values: Array<{ type: string }>) => ({
			returning: async () => {
				const created = values.map((v) => ({
					id: `inserted-${nextInsertId++}`,
					type: v.type,
				}));
				insertCalls.push(created);
				rows.push(...created);
				return created;
			},
		}),
	}));

	return {
		executor: { select, insert } as never,
		select,
		insert,
		insertCalls,
		rows,
	};
}

describe("seedDefaultStatuses — duplicate native statuses (#4879)", () => {
	test("returns the existing backlog id when one already exists (idempotent serial call)", async () => {
		const { executor, insert } = createMockExecutor([
			{ id: "existing-backlog", type: "backlog" },
		]);

		const id = await seedDefaultStatuses("org-1", executor);

		expect(id).toBe("existing-backlog");
		expect(insert).not.toHaveBeenCalled();
	});

	test("two concurrent callers must not both insert the full default set", async () => {
		// Reproduce the race: both callers pass the existence check before
		// either insert resolves, so both proceed to seed. With no DB-level
		// lock and the partial-unique index missing (the schema bug), this
		// silently produces 10 duplicate native rows for one org.
		const { executor, insert, insertCalls } = createMockExecutor();

		// Hold both SELECT promises until both have observed an empty result,
		// then resolve both — modeling the concurrent transaction race.
		let releaseSelects: () => void = () => undefined;
		const bothSelectsReady = new Promise<void>((resolve) => {
			releaseSelects = resolve;
		});
		let selectsObserved = 0;

		const raceExecutor = {
			...executor,
			select: mock(() => ({
				from: () => ({
					where: () => ({
						orderBy: () => ({
							limit: async () => {
								selectsObserved += 1;
								if (selectsObserved === 2) releaseSelects();
								await bothSelectsReady;
								return [];
							},
						}),
					}),
				}),
			})),
		};

		const [a, b] = await Promise.all([
			seedDefaultStatuses("org-1", raceExecutor as never),
			seedDefaultStatuses("org-1", raceExecutor as never),
		]);

		expect(a).toBeTruthy();
		expect(b).toBeTruthy();

		// Expected (correct) behavior: at most one insert across the two
		// concurrent callers. Actual (bug): both insert, producing duplicates.
		expect(insert).toHaveBeenCalledTimes(1);
		expect(insertCalls.flat()).toHaveLength(5);
	});
});
