import { beforeEach, describe, expect, it, mock } from "bun:test";

// ── DB mock ──────────────────────────────────────────────────────────────────

const updateWhereMock = mock(() => Promise.resolve());
const updateSetMock = mock(
	() => ({ where: updateWhereMock }) as { where: typeof updateWhereMock },
);
const updateMock = mock(
	() => ({ set: updateSetMock }) as { set: typeof updateSetMock },
);

const dbMock = {
	delete: mock(() => ({
		where: mock(() => ({
			returning: mock(() => Promise.resolve([{ id: "conn-1" }])),
		})),
	})),
	update: updateMock,
};

mock.module("@superset/db/client", () => ({
	db: dbMock,
}));

const tasksTable = {
	organizationId: "tasks.organizationId",
	externalProvider: "tasks.externalProvider",
	deletedAt: "tasks.deletedAt",
};

mock.module("@superset/db/schema", () => ({
	integrationConnections: {
		id: "ic.id",
		organizationId: "ic.organizationId",
		provider: "ic.provider",
	},
	tasks: tasksTable,
}));

mock.module("@superset/db/utils", () => ({
	findOrgMembership: mock(() => Promise.resolve({ role: "admin" })),
}));

const eqMock = mock(
	(a: unknown, b: unknown) => ({ op: "eq", a, b }) as unknown,
);
const andMock = mock((...args: unknown[]) => ({ op: "and", args }) as unknown);

mock.module("drizzle-orm", () => ({
	eq: eqMock,
	and: andMock,
}));

mock.module("@trpc/server", () => ({
	TRPCError: class TRPCError extends Error {
		code: string;
		constructor(opts: { code: string; message: string }) {
			super(opts.message);
			this.code = opts.code;
		}
	},
}));

mock.module("../../../trpc", () => {
	function createProcedureBuilder() {
		const builder: Record<string, unknown> = {};
		builder.input = () => ({
			mutation: (fn: (...args: never) => unknown) => fn,
			query: (fn: (...args: never) => unknown) => fn,
		});
		return builder;
	}
	return { protectedProcedure: createProcedureBuilder() };
});

mock.module("../utils", () => ({
	verifyOrgAdmin: mock(() =>
		Promise.resolve({ membership: { role: "admin" } }),
	),
	verifyOrgMembership: mock(() =>
		Promise.resolve({ membership: { role: "admin" } }),
	),
}));

mock.module("@linear/sdk", () => ({
	LinearClient: class {},
}));

mock.module("./utils", () => ({
	getLinearClient: mock(() => Promise.resolve(null)),
}));

mock.module("zod", () => ({
	z: {
		object: () => ({ uuid: () => "schema" }),
		uuid: () => "uuid",
		string: () => "string",
	},
}));

// ── Import the function under test ───────────────────────────────────────────

const { softDeleteLinearTasks } = await import("./linear");

// ── Tests ────────────────────────────────────────────────────────────────────

describe("softDeleteLinearTasks", () => {
	const ORG_ID = "org-123";

	beforeEach(() => {
		updateMock.mockClear();
		updateSetMock.mockClear();
		updateWhereMock.mockClear();
		eqMock.mockClear();
		andMock.mockClear();
	});

	it("should soft-delete tasks by setting deletedAt where externalProvider is linear", async () => {
		await softDeleteLinearTasks(ORG_ID);

		// db.update was called with the tasks table
		expect(updateMock).toHaveBeenCalledTimes(1);
		expect(updateMock.mock.calls[0]?.[0]).toBe(tasksTable);

		// .set() was called with a deletedAt Date
		expect(updateSetMock).toHaveBeenCalledTimes(1);
		const setArg = updateSetMock.mock.calls[0]?.[0] as
			| { deletedAt?: unknown }
			| undefined;
		expect(setArg?.deletedAt).toBeInstanceOf(Date);

		// .where() was called once
		expect(updateWhereMock).toHaveBeenCalledTimes(1);

		// eq() was called with (tasks.organizationId, orgId) and (tasks.externalProvider, "linear")
		expect(eqMock).toHaveBeenCalledWith(tasksTable.organizationId, ORG_ID);
		expect(eqMock).toHaveBeenCalledWith(tasksTable.externalProvider, "linear");

		// and() was called to combine the two conditions
		expect(andMock).toHaveBeenCalledTimes(1);
	});
});
