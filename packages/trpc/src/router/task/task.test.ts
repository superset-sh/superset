import { beforeEach, describe, expect, it, mock } from "bun:test";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";

const getCurrentTxidMock = mock(async () => "txid-123");
const seedDefaultStatusesMock = mock(async () => "status-seeded");
const syncTaskMock = mock(() => undefined);
const verifyOrgAdminMock = mock(async () => ({
	membership: { role: "owner" },
}));
const verifyOrgOwnerMock = mock(async () => ({
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

type SelectQuery = {
	catch: Promise<unknown[]>["catch"];
	finally: Promise<unknown[]>["finally"];
	from: (...args: unknown[]) => SelectQuery;
	innerJoin: (...args: unknown[]) => SelectQuery;
	leftJoin: (...args: unknown[]) => SelectQuery;
	limit: (...args: unknown[]) => SelectQuery;
	offset: (...args: unknown[]) => SelectQuery;
	orderBy: (...args: unknown[]) => SelectQuery;
	then: Promise<unknown[]>["then"];
	where: (...args: unknown[]) => SelectQuery;
};

function createDb() {
	let currentQuery: SelectQuery;
	const selectLimitMock = mock((..._args: unknown[]) => currentQuery);
	const selectOffsetMock = mock((..._args: unknown[]) => currentQuery);
	const selectOrderByMock = mock((..._args: unknown[]) => currentQuery);
	const selectWhereMock = mock((..._args: unknown[]) => currentQuery);
	const selectInnerJoinMock = mock((..._args: unknown[]) => currentQuery);
	const selectLeftJoinMock = mock((..._args: unknown[]) => currentQuery);
	const selectFromMock = mock((..._args: unknown[]) => currentQuery);
	const createSelectQuery = (): SelectQuery => {
		let rowsPromise: Promise<unknown[]> | null = null;
		const resolveRows = () => {
			rowsPromise ??= Promise.resolve(dbSelectResults.shift() ?? []);
			return rowsPromise;
		};

		return {
			catch: ((onRejected) => resolveRows().catch(onRejected)) as Promise<
				unknown[]
			>["catch"],
			finally: ((onFinally) => resolveRows().finally(onFinally)) as Promise<
				unknown[]
			>["finally"],
			from: selectFromMock,
			innerJoin: selectInnerJoinMock,
			leftJoin: selectLeftJoinMock,
			limit: selectLimitMock,
			offset: selectOffsetMock,
			orderBy: selectOrderByMock,
			// biome-ignore lint/suspicious/noThenProperty: Mock Drizzle queries are awaited directly in the router.
			then: ((onFulfilled, onRejected) =>
				resolveRows().then(onFulfilled, onRejected)) as Promise<
				unknown[]
			>["then"],
			where: selectWhereMock,
		};
	};
	const selectMock = mock(() => {
		currentQuery = createSelectQuery();
		return currentQuery;
	});

	return {
		db: {
			select: selectMock,
		},
		mocks: {
			selectMock,
			selectWhereMock,
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
	accounts: {
		accountId: "accounts.accountId",
		providerId: "accounts.providerId",
		userId: "accounts.userId",
	},
	members: {
		organizationId: "members.organizationId",
		userId: "members.userId",
	},
	v2Projects: {
		id: "v2_projects.id",
		organizationId: "v2_projects.organization_id",
		name: "v2_projects.name",
		slug: "v2_projects.slug",
		repoCloneUrl: "v2_projects.repo_clone_url",
		githubRepositoryId: "v2_projects.github_repository_id",
		iconUrl: "v2_projects.icon_url",
	},
	githubRepositories: {
		id: "github_repositories.id",
		organizationId: "github_repositories.organization_id",
		fullName: "github_repositories.full_name",
	},
	organizations: {
		id: "organizations.id",
		name: "organizations.name",
	},
	subscriptions: {
		referenceId: "subscriptions.referenceId",
	},
	taskStatuses: {
		id: "task_statuses.id",
		organizationId: "task_statuses.organizationId",
	},
	tasks: {
		assigneeExternalId: "tasks.assigneeExternalId",
		assigneeId: "tasks.assigneeId",
		createdAt: "tasks.createdAt",
		creatorId: "tasks.creatorId",
		deletedAt: "tasks.deletedAt",
		externalId: "tasks.externalId",
		externalProvider: "tasks.externalProvider",
		id: "tasks.id",
		organizationId: "tasks.organizationId",
		priority: "tasks.priority",
		slug: "tasks.slug",
		statusId: "tasks.statusId",
		title: "tasks.title",
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
	inArray: (left: unknown, values: unknown[]) => ({
		type: "inArray",
		left,
		values,
	}),
	isNull: (value: unknown) => ({ type: "isNull", value }),
	or: (...conditions: unknown[]) => ({ type: "or", conditions }),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({
			type: "sql",
			strings,
			values,
		}),
		{ raw: (s: string) => ({ type: "raw", s }) },
	),
}));

mock.module("drizzle-orm/pg-core", () => ({
	alias: (table: unknown) => table,
}));

mock.module("../../lib/integrations/sync", () => ({
	syncTask: syncTaskMock,
}));

mock.module("../integration/utils", () => ({
	verifyOrgAdmin: verifyOrgAdminMock,
	verifyOrgOwner: verifyOrgOwnerMock,
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
const LINEAR_ACCOUNT_ID = "99a67c67-11f1-4e3d-961a-8cc4987a1964";
const OTHER_LINEAR_ACCOUNT_ID = "88888888-8888-4888-8888-888888888888";

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

function conditionMatchesTaskAssignee(
	condition: unknown,
	task: { assigneeExternalId: string | null; assigneeId: string | null },
): boolean {
	if (!condition || typeof condition !== "object") {
		return true;
	}

	const candidate = condition as {
		conditions?: unknown[];
		left?: unknown;
		right?: unknown;
		type?: string;
		values?: unknown[];
	};

	if (candidate.type === "and") {
		return (candidate.conditions ?? []).every((child) =>
			conditionMatchesTaskAssignee(child, task),
		);
	}

	if (candidate.type === "or") {
		return (candidate.conditions ?? []).some((child) =>
			conditionMatchesTaskAssignee(child, task),
		);
	}

	if (candidate.type === "eq" && candidate.left === "tasks.assigneeId") {
		return task.assigneeId === candidate.right;
	}

	if (
		candidate.type === "inArray" &&
		candidate.left === "tasks.assigneeExternalId"
	) {
		return (
			task.assigneeExternalId !== null &&
			(candidate.values ?? []).includes(task.assigneeExternalId)
		);
	}

	return true;
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

	it("returns Linear-synced tasks assigned to my linked external account", async () => {
		const linearTaskRow = {
			assignee: null,
			creator: {
				id: ACTOR_USER_ID,
				image: null,
				name: "Actor",
			},
			statusName: "In Progress",
			task: {
				assigneeExternalId: LINEAR_ACCOUNT_ID,
				assigneeId: null,
				id: TASK_ID,
				organizationId: ORGANIZATION_ID,
				slug: "SUPER-820",
				title: "Linear assigned task",
			},
		};
		dbSelectResults.push([{ accountId: LINEAR_ACCOUNT_ID }]);
		dbSelectResults.push([linearTaskRow]);
		const caller = createCaller(createContext());

		const result = await caller.task.list({
			assigneeMe: true,
			statusId: STATUS_ID,
		});

		expect(result).toEqual([linearTaskRow]);
		const accountWhere = dbState.mocks.selectWhereMock.mock.calls.at(-2)?.[0];
		expect(accountWhere).toEqual(
			expect.objectContaining({
				conditions: expect.arrayContaining([
					{
						left: "accounts.providerId",
						type: "inArray",
						values: ["linear"],
					},
				]),
				type: "and",
			}),
		);
		const taskWhere = dbState.mocks.selectWhereMock.mock.calls.at(-1)?.[0];
		expect(taskWhere).toEqual(
			expect.objectContaining({
				conditions: expect.arrayContaining([
					{
						conditions: [
							{
								left: "tasks.assigneeId",
								right: ACTOR_USER_ID,
								type: "eq",
							},
							{
								left: "tasks.assigneeExternalId",
								type: "inArray",
								values: [LINEAR_ACCOUNT_ID],
							},
						],
						type: "or",
					},
				]),
				type: "and",
			}),
		);
		expect(
			conditionMatchesTaskAssignee(taskWhere, {
				assigneeExternalId: LINEAR_ACCOUNT_ID,
				assigneeId: null,
			}),
		).toBe(true);
	});

	it("excludes Linear-synced tasks assigned to a different external account", async () => {
		dbSelectResults.push([{ accountId: LINEAR_ACCOUNT_ID }]);
		dbSelectResults.push([]);
		const caller = createCaller(createContext());

		const result = await caller.task.list({
			assigneeMe: true,
			statusId: STATUS_ID,
		});

		expect(result).toEqual([]);
		const taskWhere = dbState.mocks.selectWhereMock.mock.calls.at(-1)?.[0];
		expect(
			conditionMatchesTaskAssignee(taskWhere, {
				assigneeExternalId: OTHER_LINEAR_ACCOUNT_ID,
				assigneeId: null,
			}),
		).toBe(false);
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
