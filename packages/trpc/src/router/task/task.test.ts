import { beforeEach, describe, expect, it, mock } from "bun:test";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";

const getCurrentTxidMock = mock(async () => "txid-123");
const seedDefaultStatusesMock = mock(async () => "status-seeded");
const syncTaskMock = mock(() => undefined);
const verifyOrgAdminMock = mock(async () => ({
	membership: { role: "owner" },
}));
const verifyOrgMembershipMock = mock(async () => ({
	membership: { role: "member" },
}));
const verifyOrgMembershipWithSubscriptionMock = mock(async () => ({
	membership: { role: "member" },
	subscription: null,
}));

let dbSelectResults: unknown[][] = [];
let selectResults: unknown[][] = [];
let updateResults: unknown[][] = [];

function createDb() {
	const selectLimitMock = mock(async () => dbSelectResults.shift() ?? []);
	const selectOrderByMock = mock(async () => dbSelectResults.shift() ?? []);
	const selectWhereMock = mock(() => ({
		limit: selectLimitMock,
		orderBy: selectOrderByMock,
	}));
	const selectFromMock = mock(() => ({
		where: selectWhereMock,
	}));
	const selectMock = mock(() => ({
		from: selectFromMock,
	}));

	return {
		db: {
			select: selectMock,
		},
		mocks: {
			selectMock,
		},
	};
}

function createTx() {
	const selectLimitMock = mock(async () => selectResults.shift() ?? []);
	const selectWhereMock = mock(() => ({
		limit: selectLimitMock,
	}));
	const selectFromMock = mock(() => ({
		where: selectWhereMock,
	}));
	const selectMock = mock(() => ({
		from: selectFromMock,
	}));

	const updateReturningMock = mock(async () => updateResults.shift() ?? []);
	const updateWhereMock = mock(() => ({
		returning: updateReturningMock,
	}));
	const updateSetMock = mock(() => ({
		where: updateWhereMock,
	}));
	const updateMock = mock(() => ({
		set: updateSetMock,
	}));

	const insertReturningMock = mock(async () => []);
	const insertValuesMock = mock(() => ({
		returning: insertReturningMock,
	}));
	const insertMock = mock(() => ({
		values: insertValuesMock,
	}));

	return {
		tx: {
			select: selectMock,
			update: updateMock,
			insert: insertMock,
		},
		mocks: {
			insertMock,
			selectMock,
			updateMock,
			updateSetMock,
		},
	};
}

let dbState = createDb();
let txState = createTx();
const dbSelectProxyMock = mock((...args: unknown[]) =>
	(dbState.db.select as (...args: unknown[]) => unknown)(...args),
);

const transactionMock = mock(async (callback: (tx: unknown) => unknown) =>
	callback(txState.tx),
);

mock.module("@superset/db/client", () => ({
	db: {
		select: dbSelectProxyMock,
	},
	dbWs: {
		transaction: transactionMock,
	},
}));

mock.module("@superset/db/schema", () => ({
	members: {
		organizationId: "members.organizationId",
		userId: "members.userId",
	},
	subscriptions: {
		referenceId: "subscriptions.referenceId",
	},
	taskStatuses: {
		id: "task_statuses.id",
		organizationId: "task_statuses.organizationId",
	},
	tasks: {
		assigneeId: "tasks.assigneeId",
		createdAt: "tasks.createdAt",
		creatorId: "tasks.creatorId",
		deletedAt: "tasks.deletedAt",
		externalId: "tasks.externalId",
		externalProvider: "tasks.externalProvider",
		id: "tasks.id",
		organizationId: "tasks.organizationId",
		slug: "tasks.slug",
	},
	users: {
		id: "users.id",
		image: "users.image",
		name: "users.name",
	},
}));

mock.module("@superset/db/seed-default-statuses", () => ({
	seedDefaultStatuses: seedDefaultStatusesMock,
}));

mock.module("@superset/db/utils", () => ({
	getCurrentTxid: getCurrentTxidMock,
}));

mock.module("@superset/shared/task-slug", () => ({
	generateBaseTaskSlug: mock(() => "task"),
	generateUniqueTaskSlug: mock(() => "task"),
}));

mock.module("drizzle-orm", () => ({
	and: (...conditions: unknown[]) => ({ type: "and", conditions }),
	desc: (value: unknown) => ({ type: "desc", value }),
	eq: (left: unknown, right: unknown) => ({ type: "eq", left, right }),
	ilike: (left: unknown, right: unknown) => ({ type: "ilike", left, right }),
	isNull: (value: unknown) => ({ type: "isNull", value }),
}));

mock.module("drizzle-orm/pg-core", () => ({
	alias: (table: unknown) => table,
}));

mock.module("../../lib/integrations/sync", () => ({
	syncTask: syncTaskMock,
}));

mock.module("../integration/utils", () => ({
	verifyOrgAdmin: verifyOrgAdminMock,
	verifyOrgMembership: verifyOrgMembershipMock,
	verifyOrgMembershipWithSubscription: verifyOrgMembershipWithSubscriptionMock,
}));

const { createCallerFactory, createTRPCRouter } = await import("../../trpc");
const { taskRouter } = await import("./task");

const createCaller = createCallerFactory(
	createTRPCRouter({
		task: taskRouter,
	} satisfies TRPCRouterRecord),
);

const ACTOR_USER_ID = "11111111-1111-4111-8111-111111111111";
const ASSIGNEE_ID = "22222222-2222-4222-8222-222222222222";
const ORGANIZATION_ID = "33333333-3333-4333-8333-333333333333";
const STATUS_ID = "44444444-4444-4444-8444-444444444444";
const TASK_ID = "55555555-5555-4555-8555-555555555555";

function createContext() {
	return {
		session: {
			user: {
				id: ACTOR_USER_ID,
				email: "actor@example.com",
			},
			session: {
				activeOrganizationId: ORGANIZATION_ID,
			},
		} as never,
		auth: {} as never,
		headers: new Headers(),
	};
}

describe("task router authorization", () => {
	beforeEach(() => {
		dbSelectResults = [];
		selectResults = [];
		updateResults = [];
		dbState = createDb();
		txState = createTx();

		getCurrentTxidMock.mockReset();
		getCurrentTxidMock.mockImplementation(async () => "txid-123");

		seedDefaultStatusesMock.mockReset();
		seedDefaultStatusesMock.mockImplementation(async () => "status-seeded");

		syncTaskMock.mockReset();
		syncTaskMock.mockImplementation(() => undefined);

		transactionMock.mockReset();
		transactionMock.mockImplementation(async (callback) =>
			callback(txState.tx),
		);

		verifyOrgMembershipMock.mockReset();
		verifyOrgMembershipMock.mockImplementation(async () => ({
			membership: { role: "member" },
		}));
		verifyOrgAdminMock.mockReset();
		verifyOrgAdminMock.mockImplementation(async () => ({
			membership: { role: "owner" },
		}));
	});

	it("rejects non-members from task.byOrganization before reading tasks", async () => {
		verifyOrgMembershipMock.mockImplementationOnce(async () => {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: "Not a member of this organization",
			});
		});

		const caller = createCaller(createContext());

		await expect(
			caller.task.byOrganization(ORGANIZATION_ID),
		).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: "Not a member of this organization",
		});

		expect(dbState.mocks.selectMock).not.toHaveBeenCalled();
	});

	it("returns null from task.byId when the task does not exist", async () => {
		dbSelectResults.push([]);
		const caller = createCaller(createContext());

		const result = await caller.task.byId(TASK_ID);

		expect(result).toBeNull();
		expect(verifyOrgMembershipMock).not.toHaveBeenCalled();
	});

	it("rejects cross-tenant task.byId access after resolving task ownership", async () => {
		dbSelectResults.push([
			{
				id: TASK_ID,
				organizationId: ORGANIZATION_ID,
				title: "Cross-tenant task",
			},
		]);
		verifyOrgMembershipMock.mockImplementationOnce(async () => {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: "Not a member of this organization",
			});
		});

		const caller = createCaller(createContext());

		await expect(caller.task.byId(TASK_ID)).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: "Not a member of this organization",
		});
	});

	it("scopes task.bySlug to the active organization", async () => {
		dbSelectResults.push([
			{
				id: TASK_ID,
				organizationId: ORGANIZATION_ID,
				slug: "demo-task",
				title: "Scoped task",
			},
		]);
		const caller = createCaller(createContext());

		const result = await caller.task.bySlug("demo-task");

		expect(verifyOrgMembershipMock).toHaveBeenCalledWith(
			ACTOR_USER_ID,
			ORGANIZATION_ID,
		);
		expect(result).toMatchObject({
			id: TASK_ID,
			slug: "demo-task",
			title: "Scoped task",
		});
	});

	it("rejects cross-tenant task updates before modifying the row", async () => {
		selectResults.push([{ id: TASK_ID, organizationId: ORGANIZATION_ID }]);
		verifyOrgMembershipMock.mockImplementationOnce(async () => {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: "Not a member of this organization",
			});
		});

		const caller = createCaller(createContext());

		await expect(
			caller.task.update({
				id: TASK_ID,
				title: "Renamed task",
			}),
		).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: "Not a member of this organization",
		});

		expect(verifyOrgMembershipMock).toHaveBeenCalledWith(
			ACTOR_USER_ID,
			ORGANIZATION_ID,
		);
		expect(txState.mocks.updateMock).not.toHaveBeenCalled();
		expect(syncTaskMock).not.toHaveBeenCalled();
	});

	it("rejects cross-tenant task deletes before soft-deleting the row", async () => {
		selectResults.push([{ id: TASK_ID, organizationId: ORGANIZATION_ID }]);
		verifyOrgMembershipMock.mockImplementationOnce(async () => {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: "Not a member of this organization",
			});
		});

		const caller = createCaller(createContext());

		await expect(caller.task.delete(TASK_ID)).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: "Not a member of this organization",
		});

		expect(verifyOrgMembershipMock).toHaveBeenCalledWith(
			ACTOR_USER_ID,
			ORGANIZATION_ID,
		);
		expect(txState.mocks.updateMock).not.toHaveBeenCalled();
		expect(syncTaskMock).not.toHaveBeenCalled();
	});

	it("rejects status changes that point at another organization", async () => {
		selectResults.push([{ id: TASK_ID, organizationId: ORGANIZATION_ID }]);
		selectResults.push([]);

		const caller = createCaller(createContext());

		await expect(
			caller.task.update({
				id: TASK_ID,
				statusId: STATUS_ID,
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "Status must belong to the task organization",
		});

		expect(txState.mocks.updateMock).not.toHaveBeenCalled();
	});

	it("allows same-org updates and clears external assignee fields", async () => {
		selectResults.push([{ id: TASK_ID, organizationId: ORGANIZATION_ID }]);
		selectResults.push([{ id: STATUS_ID, organizationId: ORGANIZATION_ID }]);
		selectResults.push([
			{ userId: ASSIGNEE_ID, organizationId: ORGANIZATION_ID },
		]);
		updateResults.push([{ id: TASK_ID, title: "Renamed task" }]);

		const caller = createCaller(createContext());
		const result = await caller.task.update({
			assigneeId: ASSIGNEE_ID,
			id: TASK_ID,
			statusId: STATUS_ID,
			title: "Renamed task",
		});

		expect(result).toEqual({
			task: { id: TASK_ID, title: "Renamed task" },
			txid: "txid-123",
		});
		expect(verifyOrgMembershipMock).toHaveBeenCalledWith(
			ACTOR_USER_ID,
			ORGANIZATION_ID,
		);
		expect(txState.mocks.updateSetMock).toHaveBeenCalledWith({
			assigneeAvatarUrl: null,
			assigneeDisplayName: null,
			assigneeExternalId: null,
			assigneeId: ASSIGNEE_ID,
			statusId: STATUS_ID,
			title: "Renamed task",
		});
		expect(syncTaskMock).toHaveBeenCalledWith(TASK_ID);
	});
});
