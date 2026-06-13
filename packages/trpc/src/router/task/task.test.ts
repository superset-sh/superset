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
const generateBaseTaskSlugMock = mock(
	(title: string) =>
		title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "")
			.slice(0, 50) || "task",
);
const generateUniqueTaskSlugMock = mock(
	(baseSlug: string, existingSlugs: Iterable<string>) => {
		const usedSlugs = new Set(existingSlugs);
		if (!usedSlugs.has(baseSlug)) return baseSlug;

		let counter = 1;
		let slug = `${baseSlug}-${counter}`;
		while (usedSlugs.has(slug)) {
			counter += 1;
			slug = `${baseSlug}-${counter}`;
		}
		return slug;
	},
);

let dbSelectResults: unknown[][] = [];
let insertResults: unknown[][] = [];
let selectResults: unknown[][] = [];
let updateResults: unknown[][] = [];

function createSelectRows(rows: unknown[]) {
	return Object.assign(rows, {
		limit: mock(async () => rows),
		orderBy: mock(async () => rows),
	});
}

function createDb() {
	const selectWhereMock = mock(() =>
		createSelectRows(dbSelectResults.shift() ?? []),
	);
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
	const selectWhereMock = mock(() =>
		createSelectRows(selectResults.shift() ?? []),
	);
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

	const insertReturningMock = mock(async () => insertResults.shift() ?? []);
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
			insertValuesMock,
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
	automationRuns: {
		automationId: "automation_runs.automation_id",
		hostId: "automation_runs.host_id",
		id: "automation_runs.id",
		organizationId: "automation_runs.organization_id",
		v2WorkspaceId: "automation_runs.v2_workspace_id",
	},
	automations: {
		id: "automations.id",
		ownerUserId: "automations.owner_user_id",
		v2WorkspaceId: "automations.v2_workspace_id",
	},
	automationSessionKindValues: ["chat", "terminal"],
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
		assigneeId: "tasks.assigneeId",
		createdAt: "tasks.createdAt",
		creatorId: "tasks.creatorId",
		deletedAt: "tasks.deletedAt",
		externalId: "tasks.externalId",
		externalProvider: "tasks.externalProvider",
		id: "tasks.id",
		organizationId: "tasks.organizationId",
		slug: "tasks.slug",
		v2ProjectId: "tasks.v2ProjectId",
	},
	users: {
		email: "users.email",
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
	generateBaseTaskSlug: generateBaseTaskSlugMock,
	generateUniqueTaskSlug: generateUniqueTaskSlugMock,
}));

mock.module("drizzle-orm", () => ({
	and: (...conditions: unknown[]) => ({ type: "and", conditions }),
	asc: (value: unknown) => ({ type: "asc", value }),
	desc: (value: unknown) => ({ type: "desc", value }),
	eq: (left: unknown, right: unknown) => ({ type: "eq", left, right }),
	ilike: (left: unknown, right: unknown) => ({ type: "ilike", left, right }),
	inArray: (left: unknown, right: unknown) => ({
		type: "inArray",
		left,
		right,
	}),
	isNull: (value: unknown) => ({ type: "isNull", value }),
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
const V2_PROJECT_ID = "66666666-6666-4666-8666-666666666666";
const TASK_DUE_DATE = new Date("2026-06-01T00:00:00.000Z");

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
		insertResults = [];
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

		generateBaseTaskSlugMock.mockReset();
		generateBaseTaskSlugMock.mockImplementation(
			(title: string) =>
				title
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, "-")
					.replace(/^-|-$/g, "")
					.slice(0, 50) || "task",
		);
		generateUniqueTaskSlugMock.mockReset();
		generateUniqueTaskSlugMock.mockImplementation(
			(baseSlug: string, existingSlugs: Iterable<string>) => {
				const usedSlugs = new Set(existingSlugs);
				if (!usedSlugs.has(baseSlug)) return baseSlug;

				let counter = 1;
				let slug = `${baseSlug}-${counter}`;
				while (usedSlugs.has(slug)) {
					counter += 1;
					slug = `${baseSlug}-${counter}`;
				}
				return slug;
			},
		);
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

	it("creates a minimal local task with seeded status and neutral defaults", async () => {
		selectResults.push([]);
		insertResults.push([
			{
				id: TASK_ID,
				slug: "write-tests",
				title: "Write tests",
			},
		]);

		const caller = createCaller(createContext());
		const result = await caller.task.create({
			title: "Write tests",
		});

		expect(result).toEqual({
			task: {
				id: TASK_ID,
				slug: "write-tests",
				title: "Write tests",
			},
			txid: "txid-123",
		});
		expect(seedDefaultStatusesMock).toHaveBeenCalledWith(
			ORGANIZATION_ID,
			txState.tx,
		);
		expect(txState.mocks.insertValuesMock).toHaveBeenCalledWith({
			assigneeId: null,
			creatorId: ACTOR_USER_ID,
			description: null,
			dueDate: null,
			estimate: null,
			labels: [],
			organizationId: ORGANIZATION_ID,
			priority: "none",
			slug: "write-tests",
			statusId: "status-seeded",
			title: "Write tests",
			v2ProjectId: null,
		});
		expect(syncTaskMock).toHaveBeenCalledWith(TASK_ID);
	});

	it("creates a rich local task with status, assignee, project, due date, labels, and Chinese-title slug suffix", async () => {
		selectResults.push([{ id: STATUS_ID, organizationId: ORGANIZATION_ID }]);
		selectResults.push([
			{ userId: ASSIGNEE_ID, organizationId: ORGANIZATION_ID },
		]);
		selectResults.push([
			{ id: V2_PROJECT_ID, organizationId: ORGANIZATION_ID },
		]);
		selectResults.push([{ slug: "task" }, { slug: "task-1" }]);
		insertResults.push([
			{
				id: TASK_ID,
				slug: "task-2",
				v2ProjectId: V2_PROJECT_ID,
			},
		]);

		const caller = createCaller(createContext());
		const result = await caller.task.create({
			assigneeId: ASSIGNEE_ID,
			description:
				"- 阅读项目主要目录与核心模块\n- 总结系统整体架构、模块职责与关键调用关系",
			dueDate: TASK_DUE_DATE,
			labels: ["architecture", "review"],
			priority: "high",
			statusId: STATUS_ID,
			title: "梳理项目整体代码架构与设计思路",
			v2ProjectId: V2_PROJECT_ID,
		});

		expect(result).toEqual({
			task: {
				id: TASK_ID,
				slug: "task-2",
				v2ProjectId: V2_PROJECT_ID,
			},
			txid: "txid-123",
		});
		expect(txState.mocks.insertValuesMock).toHaveBeenCalledWith({
			assigneeId: ASSIGNEE_ID,
			creatorId: ACTOR_USER_ID,
			description:
				"- 阅读项目主要目录与核心模块\n- 总结系统整体架构、模块职责与关键调用关系",
			dueDate: TASK_DUE_DATE,
			estimate: null,
			labels: ["architecture", "review"],
			organizationId: ORGANIZATION_ID,
			priority: "high",
			slug: "task-2",
			statusId: STATUS_ID,
			title: "梳理项目整体代码架构与设计思路",
			v2ProjectId: V2_PROJECT_ID,
		});
	});

	it("rejects task creation when the status is outside the active organization", async () => {
		selectResults.push([]);

		const caller = createCaller(createContext());

		await expect(
			caller.task.create({
				statusId: STATUS_ID,
				title: "Invalid status",
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "Status must belong to the active organization",
		});

		expect(txState.mocks.insertMock).not.toHaveBeenCalled();
	});

	it("rejects task creation when the assignee is outside the active organization", async () => {
		selectResults.push([{ id: STATUS_ID, organizationId: ORGANIZATION_ID }]);
		selectResults.push([]);

		const caller = createCaller(createContext());

		await expect(
			caller.task.create({
				assigneeId: ASSIGNEE_ID,
				statusId: STATUS_ID,
				title: "Invalid assignee",
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "Assignee must belong to the active organization",
		});

		expect(txState.mocks.insertMock).not.toHaveBeenCalled();
	});

	it("rejects task creation when the project is outside the active organization", async () => {
		selectResults.push([{ id: STATUS_ID, organizationId: ORGANIZATION_ID }]);
		selectResults.push([
			{ userId: ASSIGNEE_ID, organizationId: ORGANIZATION_ID },
		]);
		selectResults.push([]);

		const caller = createCaller(createContext());

		await expect(
			caller.task.create({
				assigneeId: ASSIGNEE_ID,
				statusId: STATUS_ID,
				title: "Invalid project",
				v2ProjectId: V2_PROJECT_ID,
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "Project must belong to the active organization",
		});

		expect(txState.mocks.insertMock).not.toHaveBeenCalled();
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

	it("rejects project changes that point at another organization", async () => {
		selectResults.push([{ id: TASK_ID, organizationId: ORGANIZATION_ID }]);
		selectResults.push([]);

		const caller = createCaller(createContext());

		await expect(
			caller.task.update({
				id: TASK_ID,
				v2ProjectId: V2_PROJECT_ID,
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "Project must belong to the task organization",
		});

		expect(txState.mocks.updateMock).not.toHaveBeenCalled();
	});

	it("allows same-org project updates", async () => {
		selectResults.push([{ id: TASK_ID, organizationId: ORGANIZATION_ID }]);
		selectResults.push([
			{ id: V2_PROJECT_ID, organizationId: ORGANIZATION_ID },
		]);
		updateResults.push([{ id: TASK_ID, v2ProjectId: V2_PROJECT_ID }]);

		const caller = createCaller(createContext());
		const result = await caller.task.update({
			id: TASK_ID,
			v2ProjectId: V2_PROJECT_ID,
		});

		expect(result).toEqual({
			task: { id: TASK_ID, v2ProjectId: V2_PROJECT_ID },
			txid: "txid-123",
		});
		expect(txState.mocks.updateSetMock).toHaveBeenCalledWith({
			v2ProjectId: V2_PROJECT_ID,
		});
		expect(syncTaskMock).toHaveBeenCalledWith(TASK_ID);
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
