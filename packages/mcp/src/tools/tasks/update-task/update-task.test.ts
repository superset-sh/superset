import { beforeEach, describe, expect, it, mock } from "bun:test";

const taskStatusesTable = {
	id: "task_statuses.id",
	name: "task_statuses.name",
	color: "task_statuses.color",
	type: "task_statuses.type",
	position: "task_statuses.position",
	progressPercent: "task_statuses.progress_percent",
	organizationId: "task_statuses.organization_id",
};

const tasksTable = {
	id: "tasks.id",
	slug: "tasks.slug",
	title: "tasks.title",
	statusId: "tasks.status_id",
	organizationId: "tasks.organization_id",
	deletedAt: "tasks.deleted_at",
};

let dbSelectResults: unknown[][] = [];
let updateResults: unknown[][] = [];

const selectLimitMock = mock(async () => dbSelectResults.shift() ?? []);
const selectWhereMock = mock((table: unknown) => {
	if (table === taskStatusesTable) {
		return Promise.resolve(dbSelectResults.shift() ?? []);
	}

	return {
		limit: selectLimitMock,
	};
});
const selectFromMock = mock((table: unknown) => ({
	where: () => selectWhereMock(table),
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

const getMcpContextMock = mock(() => ({
	organizationId: "org-1",
	userId: "user-1",
}));

mock.module("@superset/db/client", () => ({
	db: {
		select: selectMock,
	},
	dbWs: {
		update: updateMock,
	},
}));

mock.module("@superset/db/schema", () => ({
	taskStatuses: taskStatusesTable,
	tasks: tasksTable,
}));

mock.module("drizzle-orm", () => ({
	and: (...conditions: unknown[]) => ({ type: "and", conditions }),
	eq: (left: unknown, right: unknown) => ({ type: "eq", left, right }),
	isNull: (value: unknown) => ({ type: "isNull", value }),
}));

mock.module("../../utils", () => ({
	getMcpContext: getMcpContextMock,
}));

const { register } = await import("./index");

type UpdateTaskHandler = (
	args: Record<string, unknown>,
	extra: unknown,
) => Promise<{
	structuredContent?: {
		updated?: Array<Record<string, unknown>>;
	};
	content?: Array<{ text?: string }>;
	isError?: boolean;
}>;

function createHandler() {
	const handlers = new Map<string, UpdateTaskHandler>();

	register({
		registerTool: (
			name: string,
			_config: unknown,
			nextHandler: UpdateTaskHandler,
		) => {
			handlers.set(name, nextHandler);
		},
	} as never);

	const handler = handlers.get("update_task");
	if (!handler) {
		throw new Error("update_task handler was not registered");
	}

	return handler;
}

describe("update_task MCP tool", () => {
	beforeEach(() => {
		dbSelectResults = [];
		updateResults = [];
		selectMock.mockClear();
		selectFromMock.mockClear();
		selectWhereMock.mockClear();
		selectLimitMock.mockClear();
		updateMock.mockClear();
		updateSetMock.mockClear();
		updateWhereMock.mockClear();
		updateReturningMock.mockClear();
		getMcpContextMock.mockClear();
	});

	it("resolves statusName to a statusId and returns status metadata", async () => {
		dbSelectResults.push(
			[
				{
					id: "status-todo",
					name: "Todo",
					color: "#e2e2e2",
					type: "unstarted",
					position: 1,
					progressPercent: 0,
				},
				{
					id: "status-progress",
					name: "In Progress",
					color: "#f2c94c",
					type: "started",
					position: 2,
					progressPercent: 50,
				},
			],
			[{ id: "task-1" }],
		);
		updateResults.push([
			{
				id: "task-1",
				slug: "add-status-moves",
				title: "Add status moves",
				statusId: "status-progress",
			},
		]);

		const handler = createHandler();
		const result = await handler(
			{
				updates: [
					{
						taskId: "add-status-moves",
						statusName: "In Progress",
					},
				],
			},
			{},
		);

		expect(result.isError).toBeUndefined();
		expect(updateSetMock).toHaveBeenCalledWith({ statusId: "status-progress" });
		expect(result.structuredContent?.updated).toEqual([
			{
				id: "task-1",
				slug: "add-status-moves",
				title: "Add status moves",
				statusId: "status-progress",
				statusName: "In Progress",
				statusType: "started",
				statusColor: "#f2c94c",
				statusProgress: 50,
			},
		]);
	});

	it("rejects ambiguous statusName matches", async () => {
		dbSelectResults.push(
			[
				{
					id: "status-review-a",
					name: "In Review",
					color: "#4f46e5",
					type: "started",
					position: 3,
					progressPercent: 80,
				},
				{
					id: "status-review-b",
					name: "In Review",
					color: "#6366f1",
					type: "started",
					position: 4,
					progressPercent: 85,
				},
			],
			[{ id: "task-1" }],
		);

		const handler = createHandler();
		const result = await handler(
			{
				updates: [
					{
						taskId: "task-1",
						statusName: "In Review",
					},
				],
			},
			{},
		);

		expect(result.isError).toBe(true);
		expect(result.content?.[0]?.text).toContain(
			'Multiple statuses match "In Review"',
		);
		expect(updateMock).not.toHaveBeenCalled();
	});

	it("rejects conflicting statusId and statusName combinations", async () => {
		dbSelectResults.push(
			[
				{
					id: "status-todo",
					name: "Todo",
					color: "#e2e2e2",
					type: "unstarted",
					position: 1,
					progressPercent: 0,
				},
				{
					id: "status-progress",
					name: "In Progress",
					color: "#f2c94c",
					type: "started",
					position: 2,
					progressPercent: 50,
				},
			],
			[{ id: "task-1" }],
		);

		const handler = createHandler();
		const result = await handler(
			{
				updates: [
					{
						taskId: "task-1",
						statusId: "status-todo",
						statusName: "In Progress",
					},
				],
			},
			{},
		);

		expect(result.isError).toBe(true);
		expect(result.content?.[0]?.text).toContain(
			"statusId and statusName refer to different statuses",
		);
		expect(updateMock).not.toHaveBeenCalled();
	});
});
