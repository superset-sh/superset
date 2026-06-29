import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { TRPCRouterRecord } from "@trpc/server";

// --- ids -------------------------------------------------------------------
const ACTOR_USER_ID = "11111111-1111-4111-8111-111111111111";
const ORGANIZATION_ID = "33333333-3333-4333-8333-333333333333";
const AUTOMATION_ID = "55555555-5555-4555-8555-555555555555";
const PROJECT_P = "66666666-6666-4666-8666-666666666666";
const PROJECT_X = "77777777-7777-4777-8777-777777777777";
const WORKSPACE_W = "88888888-8888-4888-8888-888888888888";
const WORKSPACE_W2 = "99999999-9999-4999-8999-999999999999";
// host machine ids are opaque hex strings, not uuids
const HOST_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const HOST_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const HOST_X = "cccccccccccccccccccccccccccccccc";

// --- queued db results -----------------------------------------------------
let dbSelectResults: unknown[][] = [];
let insertResults: unknown[][] = [];
let updateResults: unknown[][] = [];

const insertValuesMock = mock((_values: unknown) => ({
	returning: mock(async () => insertResults.shift() ?? []),
}));
const updateSetMock = mock((_values: unknown) => ({
	where: mock(() => ({
		returning: mock(async () => updateResults.shift() ?? []),
	})),
}));

function createDb() {
	const limitMock = mock(async () => dbSelectResults.shift() ?? []);
	const orderByMock = mock(async () => dbSelectResults.shift() ?? []);
	const whereMock = mock(() => ({ limit: limitMock, orderBy: orderByMock }));
	const fromMock = mock(() => ({ where: whereMock }));
	const selectMock = mock(() => ({ from: fromMock }));
	return { selectMock };
}

let dbState = createDb();
const dbSelectProxyMock = mock((...args: unknown[]) =>
	(dbState.selectMock as (...a: unknown[]) => unknown)(...args),
);

const transactionMock = mock(async (callback: (tx: unknown) => unknown) =>
	callback({ insert: mock(() => ({ values: insertValuesMock })) }),
);

// --- module mocks ----------------------------------------------------------
mock.module("@superset/db/client", () => ({
	db: { select: dbSelectProxyMock },
	dbWs: {
		transaction: transactionMock,
		update: mock(() => ({ set: updateSetMock })),
	},
}));

mock.module("@superset/shared/rrule", () => ({
	parseRrule: mock(() => ({ nextRunAt: new Date(0) })),
	describeSchedule: mock(() => "every day"),
	nextOccurrences: mock(() => []),
}));

mock.module("../../env", () => ({ env: { RELAY_URL: "http://relay.test" } }));

const requireActiveOrgMembershipMock = mock(async () => ORGANIZATION_ID);
mock.module("../utils/active-org", () => ({
	requireActiveOrgMembership: requireActiveOrgMembershipMock,
}));

const getAutomationForUserMock = mock(
	async () => ({}) as Record<string, unknown>,
);
mock.module("./helpers", () => ({
	getAutomationForUser: getAutomationForUserMock,
	recordPromptVersion: mock(async () => undefined),
	promptSourceFromSession: mock(() => "ui"),
}));

mock.module("./dispatch", () => ({
	dispatchAutomation: mock(async () => ({ status: "dispatched", runId: "r" })),
}));

mock.module("./versions", () => ({ automationVersionsRouter: {} }));

const { createCallerFactory, createTRPCRouter } = await import("../../trpc");
const { automationRouter } = await import("./automation");

const createCaller = createCallerFactory(
	createTRPCRouter({ automation: automationRouter } satisfies TRPCRouterRecord),
);

function createContext() {
	return {
		session: {
			user: { id: ACTOR_USER_ID, email: "actor@example.com" },
			session: { activeOrganizationId: ORGANIZATION_ID },
		} as never,
		auth: {} as never,
		headers: new Headers(),
	};
}

const baseCreateInput = {
	name: "Daily triage",
	prompt: "do the thing",
	agent: "claude",
	rrule: "FREQ=DAILY",
	timezone: "America/Los_Angeles",
};

// host-access checks read two rows: the host, then the membership
function pushHostAccessOk(hostId: string) {
	dbSelectResults.push([{ machineId: hostId }]);
	dbSelectResults.push([{ hostId }]);
}

beforeEach(() => {
	dbSelectResults = [];
	insertResults = [];
	updateResults = [];
	dbState = createDb();
	insertValuesMock.mockClear();
	updateSetMock.mockClear();
	getAutomationForUserMock.mockReset();
});

describe("automation.create host/workspace reconciliation", () => {
	it("pins targetHostId and v2ProjectId to the workspace's host and project", async () => {
		// verifyWorkspaceInOrg, then verifyHostAccess(workspace.host)
		dbSelectResults.push([
			{
				id: WORKSPACE_W,
				organizationId: ORGANIZATION_ID,
				projectId: PROJECT_P,
				hostId: HOST_A,
			},
		]);
		pushHostAccessOk(HOST_A);
		insertResults.push([
			{
				id: AUTOMATION_ID,
				rrule: "FREQ=DAILY",
				timezone: "America/Los_Angeles",
			},
		]);

		const caller = createCaller(createContext());
		await caller.automation.create({
			...baseCreateInput,
			v2WorkspaceId: WORKSPACE_W,
		});

		expect(insertValuesMock).toHaveBeenCalledTimes(1);
		expect(insertValuesMock.mock.calls[0]?.[0]).toMatchObject({
			targetHostId: HOST_A,
			v2ProjectId: PROJECT_P,
			v2WorkspaceId: WORKSPACE_W,
		});
	});

	it("rejects a targetHostId that disagrees with the workspace's host", async () => {
		pushHostAccessOk(HOST_X); // verifyHostAccess(input.targetHostId)
		dbSelectResults.push([
			{
				id: WORKSPACE_W,
				organizationId: ORGANIZATION_ID,
				projectId: PROJECT_P,
				hostId: HOST_A,
			},
		]);

		const caller = createCaller(createContext());
		await expect(
			caller.automation.create({
				...baseCreateInput,
				targetHostId: HOST_X,
				v2WorkspaceId: WORKSPACE_W,
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "targetHostId does not match the workspace's host",
		});
		expect(insertValuesMock).not.toHaveBeenCalled();
	});

	it("rejects a v2ProjectId that disagrees with the workspace's project", async () => {
		dbSelectResults.push([
			{
				id: WORKSPACE_W,
				organizationId: ORGANIZATION_ID,
				projectId: PROJECT_P,
				hostId: HOST_A,
			},
		]);

		const caller = createCaller(createContext());
		await expect(
			caller.automation.create({
				...baseCreateInput,
				v2ProjectId: PROJECT_X,
				v2WorkspaceId: WORKSPACE_W,
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "v2ProjectId does not match the workspace's project",
		});
		expect(insertValuesMock).not.toHaveBeenCalled();
	});
});

describe("automation.update host/workspace reconciliation", () => {
	const existing = {
		id: AUTOMATION_ID,
		ownerUserId: ACTOR_USER_ID,
		name: "Daily triage",
		agent: "claude",
		targetHostId: HOST_A,
		v2ProjectId: PROJECT_P,
		v2WorkspaceId: WORKSPACE_W,
		rrule: "FREQ=DAILY",
		dtstart: new Date(0),
		timezone: "America/Los_Angeles",
		mcpScope: [],
		nextRunAt: new Date(0),
	};

	it("clears the stale workspace when the device changes without a new workspace", async () => {
		getAutomationForUserMock.mockResolvedValue({ ...existing });
		pushHostAccessOk(HOST_B); // verifyHostAccess(input.targetHostId)
		updateResults.push([
			{ id: AUTOMATION_ID, rrule: "FREQ=DAILY", timezone: "UTC" },
		]);

		const caller = createCaller(createContext());
		await caller.automation.update({ id: AUTOMATION_ID, targetHostId: HOST_B });

		expect(updateSetMock).toHaveBeenCalledTimes(1);
		expect(updateSetMock.mock.calls[0]?.[0]).toMatchObject({
			targetHostId: HOST_B,
			v2ProjectId: PROJECT_P,
			v2WorkspaceId: null,
		});
	});

	it("re-pins targetHostId to the new workspace's host", async () => {
		getAutomationForUserMock.mockResolvedValue({ ...existing });
		// verifyWorkspaceInOrg(W2), then verifyHostAccess(W2.host)
		dbSelectResults.push([
			{
				id: WORKSPACE_W2,
				organizationId: ORGANIZATION_ID,
				projectId: PROJECT_P,
				hostId: HOST_B,
			},
		]);
		pushHostAccessOk(HOST_B);
		updateResults.push([
			{ id: AUTOMATION_ID, rrule: "FREQ=DAILY", timezone: "UTC" },
		]);

		const caller = createCaller(createContext());
		await caller.automation.update({
			id: AUTOMATION_ID,
			v2WorkspaceId: WORKSPACE_W2,
		});

		expect(updateSetMock).toHaveBeenCalledTimes(1);
		expect(updateSetMock.mock.calls[0]?.[0]).toMatchObject({
			targetHostId: HOST_B,
			v2WorkspaceId: WORKSPACE_W2,
		});
	});

	it("derives the project from the workspace when moving across projects", async () => {
		getAutomationForUserMock.mockResolvedValue({ ...existing });
		// W2 lives in a different project (PROJECT_X) and on a different host
		dbSelectResults.push([
			{
				id: WORKSPACE_W2,
				organizationId: ORGANIZATION_ID,
				projectId: PROJECT_X,
				hostId: HOST_B,
			},
		]);
		pushHostAccessOk(HOST_B);
		updateResults.push([
			{ id: AUTOMATION_ID, rrule: "FREQ=DAILY", timezone: "UTC" },
		]);

		const caller = createCaller(createContext());
		await caller.automation.update({
			id: AUTOMATION_ID,
			v2WorkspaceId: WORKSPACE_W2,
		});

		expect(updateSetMock).toHaveBeenCalledTimes(1);
		expect(updateSetMock.mock.calls[0]?.[0]).toMatchObject({
			targetHostId: HOST_B,
			v2ProjectId: PROJECT_X,
			v2WorkspaceId: WORKSPACE_W2,
		});
	});

	it("rejects re-pinning a workspace whose host disagrees with an explicit targetHostId", async () => {
		getAutomationForUserMock.mockResolvedValue({ ...existing });
		pushHostAccessOk(HOST_X); // verifyHostAccess(input.targetHostId)
		dbSelectResults.push([
			{
				id: WORKSPACE_W2,
				organizationId: ORGANIZATION_ID,
				projectId: PROJECT_P,
				hostId: HOST_B,
			},
		]);

		const caller = createCaller(createContext());
		await expect(
			caller.automation.update({
				id: AUTOMATION_ID,
				targetHostId: HOST_X,
				v2WorkspaceId: WORKSPACE_W2,
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "targetHostId does not match the workspace's host",
		});
		expect(updateSetMock).not.toHaveBeenCalled();
	});
});
