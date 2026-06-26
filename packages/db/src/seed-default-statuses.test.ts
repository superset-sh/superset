import { describe, expect, it } from "bun:test";

// The drizzle clients in `./client` instantiate `neon(...)` at module load
// and throw without a URL. We never call the real client in this test
// (every test passes a fake transaction in), so a placeholder url is fine.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.DATABASE_URL_UNPOOLED ??= process.env.DATABASE_URL;

const { seedDefaultStatuses } = await import("./seed-default-statuses");

type Op =
	| { kind: "execute"; payload: unknown }
	| { kind: "select" }
	| { kind: "insert"; rows: Array<Record<string, unknown>> };

function createFakeTx(opts: { existingBacklog?: { id: string } | null } = {}) {
	const ops: Op[] = [];
	const existing = opts.existingBacklog ?? null;

	const limit = async () => (existing ? [existing] : []);
	const orderBy = () => ({ limit });
	const where = () => ({ orderBy });
	const from = () => ({ where });
	const select = () => {
		ops.push({ kind: "select" });
		return { from };
	};

	const insert = () => ({
		values: (rows: Array<Record<string, unknown>>) => {
			ops.push({ kind: "insert", rows });
			return {
				returning: async () =>
					rows.map((r, i) => ({
						id: `id-${ops.length}-${i}`,
						type: r.type,
					})),
			};
		},
	});

	const execute = async (payload: unknown) => {
		ops.push({ kind: "execute", payload });
		return { rows: [] };
	};

	// biome-ignore lint/suspicious/noExplicitAny: minimal fake of a drizzle transaction for unit test
	return { tx: { select, insert, execute } as any, ops };
}

const ORG_ID = "11111111-1111-4111-8111-111111111111";

describe("seedDefaultStatuses", () => {
	it("acquires a transaction-scoped advisory lock before reading existing statuses", async () => {
		// Reproduction of #4827: concurrent invocations created duplicate
		// default statuses because the existence check and insert weren't
		// serialized. The fix is a pg_advisory_xact_lock keyed by the
		// organization id so only one seeder per org runs at a time.
		const { tx, ops } = createFakeTx();

		await seedDefaultStatuses(ORG_ID, tx);

		const lockIndex = ops.findIndex((op) => op.kind === "execute");
		const selectIndex = ops.findIndex((op) => op.kind === "select");

		expect(lockIndex).toBeGreaterThanOrEqual(0);
		expect(selectIndex).toBeGreaterThan(lockIndex);
	});

	it("returns the existing backlog id without inserting when one already exists", async () => {
		const { tx, ops } = createFakeTx({
			existingBacklog: { id: "existing-backlog-id" },
		});

		const result = await seedDefaultStatuses(ORG_ID, tx);

		expect(result).toBe("existing-backlog-id");
		expect(ops.some((op) => op.kind === "insert")).toBe(false);
	});

	it("inserts the five default statuses when none exist", async () => {
		const { tx, ops } = createFakeTx();

		const result = await seedDefaultStatuses(ORG_ID, tx);

		const inserts = ops.filter(
			(op): op is { kind: "insert"; rows: Array<Record<string, unknown>> } =>
				op.kind === "insert",
		);
		expect(inserts).toHaveLength(1);
		expect(inserts[0]?.rows).toHaveLength(5);
		expect(inserts[0]?.rows.map((r) => r.type)).toEqual([
			"backlog",
			"unstarted",
			"started",
			"completed",
			"canceled",
		]);
		expect(typeof result).toBe("string");
	});
});
