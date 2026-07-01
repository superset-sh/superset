import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { TRPCRouterRecord } from "@trpc/server";

const membersFindFirst = mock(async () => ({ role: "member" }) as unknown);
const selectWhere = mock(async () => [] as unknown[]);
const selectFrom = mock(() => ({ where: selectWhere }));
const selectMock = mock((_cols?: unknown) => ({ from: selectFrom }));

mock.module("@superset/db/client", () => ({
	db: {
		query: { members: { findFirst: membersFindFirst } },
		select: selectMock,
	},
}));

// The sync router imports every synced table at module load, so the mock must
// export all of them. Each carries the columns the router references.
const col = (t: string) => (name: string) => `${t}.${name}`;
function tableStub(name: string, extra: string[] = []) {
	const c = col(name);
	const stub: Record<string, string> = { organizationId: c("organization_id") };
	for (const e of extra) stub[e] = c(e);
	return stub;
}

mock.module("@superset/db/schema", () => ({
	tasks: tableStub("tasks"),
	taskStatuses: tableStub("task_statuses"),
	projects: tableStub("projects"),
	v2Projects: tableStub("v2_projects"),
	v2Hosts: tableStub("v2_hosts"),
	v2Clients: tableStub("v2_clients"),
	v2UsersHosts: tableStub("v2_users_hosts"),
	workspaces: tableStub("workspaces"),
	members: tableStub("members", ["userId"]),
	invitations: tableStub("invitations"),
	teams: tableStub("teams"),
	teamMembers: tableStub("team_members"),
	users: { organizationIds: "users.organization_ids" },
	organizations: { id: "organizations.id" },
	apikeys: tableStub("apikeys", [
		"id",
		"name",
		"start",
		"createdAt",
		"lastRequest",
		"key",
	]),
	devicePresence: tableStub("device_presence"),
	agentCommands: tableStub("agent_commands"),
	integrationConnections: tableStub("integration_connections", [
		"id",
		"connectedByUserId",
		"provider",
		"tokenExpiresAt",
		"externalOrgId",
		"externalOrgName",
		"config",
		"createdAt",
		"updatedAt",
		"accessToken",
		"refreshToken",
	]),
	subscriptions: { referenceId: "subscriptions.reference_id" },
	chatSessions: tableStub("chat_sessions"),
	githubRepositories: tableStub("github_repositories"),
	githubPullRequests: tableStub("github_pull_requests"),
	automations: tableStub("automations"),
	automationRuns: tableStub("automation_runs"),
}));

mock.module("drizzle-orm", () => ({
	and: (...conditions: unknown[]) => ({ type: "and", conditions }),
	eq: (left: unknown, right: unknown) => ({ type: "eq", left, right }),
	arrayContains: (left: unknown, right: unknown) => ({
		type: "arrayContains",
		left,
		right,
	}),
	inArray: (left: unknown, right: unknown) => ({
		type: "inArray",
		left,
		right,
	}),
}));

const { createCallerFactory, createTRPCRouter } = await import("../../trpc");
const { syncRouter } = await import("./sync");

const createCaller = createCallerFactory(
	createTRPCRouter({ sync: syncRouter } satisfies TRPCRouterRecord),
);

const ACTOR = "11111111-1111-4111-8111-111111111111";
const ORG = "33333333-3333-4333-8333-333333333333";

function ctx() {
	return {
		session: {
			user: { id: ACTOR, email: "a@b.c" },
			session: { activeOrganizationId: ORG },
		} as never,
		auth: {} as never,
		headers: new Headers(),
	};
}

describe("sync.pull", () => {
	beforeEach(() => {
		selectMock.mockReset();
		selectMock.mockImplementation(() => ({ from: selectFrom }));
		selectWhere.mockReset();
		selectWhere.mockImplementation(async () => []);
		membersFindFirst.mockReset();
		membersFindFirst.mockImplementation(async () => ({ role: "member" }));
	});

	it("rejects non-members before reading any table", async () => {
		membersFindFirst.mockImplementationOnce(async () => undefined);
		await expect(
			createCaller(ctx()).sync.pull({ table: "tasks", organizationId: ORG }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(selectMock).not.toHaveBeenCalled();
	});

	it("scopes each table to the requested org", async () => {
		await createCaller(ctx()).sync.pull({
			table: "tasks",
			organizationId: ORG,
		});
		expect(selectWhere.mock.calls[0]?.[0]).toEqual({
			type: "eq",
			left: "tasks.organization_id",
			right: ORG,
		});
	});

	it("never returns the API key secret column", async () => {
		await createCaller(ctx()).sync.pull({
			table: "auth.apikeys",
			organizationId: ORG,
		});
		const cols = selectMock.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(cols.key).toBeUndefined();
		expect(cols.id).toBe("apikeys.id");
	});

	it("never returns integration OAuth tokens", async () => {
		await createCaller(ctx()).sync.pull({
			table: "integration_connections",
			organizationId: ORG,
		});
		const cols = selectMock.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(cols.accessToken).toBeUndefined();
		expect(cols.refreshToken).toBeUndefined();
		expect(cols.provider).toBe("integration_connections.provider");
	});

	it("requires organizationId for org-scoped tables", async () => {
		await expect(
			createCaller(ctx()).sync.pull({ table: "tasks" }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});
