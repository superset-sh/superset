import { beforeEach, describe, expect, mock, test } from "bun:test";

const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const AUTOMATION_ID = "44444444-4444-4444-8444-444444444444";
const RUN_ID = "55555555-5555-4555-8555-555555555555";
const MACHINE_ID = "machine-local-abc";
const WORKSPACE_ID = "66666666-6666-4666-8666-666666666666";

interface DbCallLog {
	op: "select" | "insert" | "update";
	table?: string;
	values?: unknown;
	setValues?: unknown;
}

let selectResults: unknown[][] = [];
let insertReturning: unknown[][] = [];
let dbCalls: DbCallLog[] = [];

function makeDbWs() {
	function selectChain(_table?: string) {
		const limit = mock(async () => selectResults.shift() ?? []);
		const orderBy = mock(() => ({ limit }));
		const where = mock(() => ({ limit, orderBy }));
		const innerJoin = mock(() => ({ where }));
		const from = mock((tbl: { __name?: string }) => {
			if (tbl?.__name) dbCalls.push({ op: "select", table: tbl.__name });
			return { where, innerJoin };
		});
		return { from };
	}

	const insert = mock((tbl: { __name?: string }) => {
		const returning = mock(async () => insertReturning.shift() ?? []);
		const onConflictDoNothing = mock(() => ({ returning }));
		const values = mock((vals: unknown) => {
			dbCalls.push({ op: "insert", table: tbl?.__name, values: vals });
			return { onConflictDoNothing, returning };
		});
		return { values };
	});

	const update = mock((tbl: { __name?: string }) => {
		const where = mock(async () => undefined);
		const set = mock((vals: unknown) => {
			dbCalls.push({ op: "update", table: tbl?.__name, setValues: vals });
			return { where };
		});
		return { set };
	});

	return {
		select: mock(() => selectChain()),
		insert,
		update,
	};
}

let dbWsState = makeDbWs();
const dbWsProxy = {
	select: mock((...args: unknown[]) =>
		(dbWsState.select as (...args: unknown[]) => unknown)(...args),
	),
	insert: mock((...args: unknown[]) =>
		(dbWsState.insert as (...args: unknown[]) => unknown)(...args),
	),
	update: mock((...args: unknown[]) =>
		(dbWsState.update as (...args: unknown[]) => unknown)(...args),
	),
};

const mintUserJwtMock = mock(async () => "test-jwt");
const relayMutationMock = mock(async (_opts: unknown, procedure: string) => {
	if (procedure === "workspaces.create") {
		return {
			workspace: {
				id: WORKSPACE_ID,
				projectId: PROJECT_ID,
				name: "auto",
				branch: "branch",
			},
			terminals: [],
			agents: [],
			alreadyExists: false,
		};
	}
	if (procedure === "agents.run") {
		return { kind: "chat", sessionId: "session-1", label: "label" };
	}
	throw new Error(`unexpected procedure: ${procedure}`);
});

mock.module("@superset/auth/server", () => ({
	mintUserJwt: mintUserJwtMock,
}));

mock.module("@superset/db/client", () => ({
	dbWs: dbWsProxy,
}));

mock.module("@superset/db/schema", () => ({
	automationRuns: { __name: "automation_runs", id: "automation_runs.id" },
	users: { __name: "users", id: "users.id", email: "users.email" },
	v2Hosts: {
		__name: "v2_hosts",
		organizationId: "v2_hosts.organization_id",
		machineId: "v2_hosts.machine_id",
		name: "v2_hosts.name",
		isOnline: "v2_hosts.is_online",
		createdByUserId: "v2_hosts.created_by_user_id",
		createdAt: "v2_hosts.created_at",
		updatedAt: "v2_hosts.updated_at",
	},
	v2UsersHosts: {
		__name: "v2_users_hosts",
		organizationId: "v2_users_hosts.organization_id",
		userId: "v2_users_hosts.user_id",
		hostId: "v2_users_hosts.host_id",
	},
}));

mock.module("@superset/shared/host-routing", () => ({
	buildHostRoutingKey: (orgId: string, machineId: string) =>
		`${orgId}:${machineId}`,
}));

mock.module("@superset/shared/workspace-launch", () => ({
	deduplicateBranchName: (name: string) => name,
	sanitizeBranchNameWithMaxLength: (name: string) => name,
	slugifyForBranch: (name: string) => name,
}));

mock.module("drizzle-orm", () => ({
	and: (...conditions: unknown[]) => ({ type: "and", conditions }),
	eq: (left: unknown, right: unknown) => ({ type: "eq", left, right }),
}));

class FakeRelayDispatchError extends Error {
	readonly status: number;
	readonly body: string;
	constructor(message: string, status: number, body: string) {
		super(message);
		this.name = "RelayDispatchError";
		this.status = status;
		this.body = body;
	}
}

mock.module("./relay-client", () => ({
	relayMutation: relayMutationMock,
	RelayDispatchError: FakeRelayDispatchError,
}));

const { dispatchAutomation } = await import("./dispatch");
const RelayDispatchError = FakeRelayDispatchError;

function makeAutomation(
	overrides: Partial<{
		targetHostId: string | null;
		v2WorkspaceId: string | null;
	}> = {},
) {
	return {
		id: AUTOMATION_ID,
		organizationId: ORGANIZATION_ID,
		ownerUserId: OWNER_USER_ID,
		name: "Nightly digest",
		prompt: "summarize",
		agent: "claude",
		targetHostId: overrides.targetHostId ?? MACHINE_ID,
		v2ProjectId: PROJECT_ID,
		v2WorkspaceId: overrides.v2WorkspaceId ?? null,
		rrule: "FREQ=DAILY",
		dtstart: new Date("2026-01-01T00:00:00Z"),
		timezone: "UTC",
		enabled: true,
		mcpScope: [],
		nextRunAt: new Date("2026-05-21T09:00:00Z"),
		createdAt: new Date("2026-01-01T00:00:00Z"),
		updatedAt: new Date("2026-01-01T00:00:00Z"),
	};
}

describe("dispatchAutomation — issue #4803 'target host offline' for local device", () => {
	beforeEach(() => {
		selectResults = [];
		insertReturning = [];
		dbCalls = [];
		dbWsState = makeDbWs();
		mintUserJwtMock.mockClear();
		relayMutationMock.mockClear();
		relayMutationMock.mockImplementation(async (_opts, procedure) => {
			if (procedure === "workspaces.create") {
				return {
					workspace: {
						id: WORKSPACE_ID,
						projectId: PROJECT_ID,
						name: "auto",
						branch: "branch",
					},
					terminals: [],
					agents: [],
					alreadyExists: false,
				};
			}
			if (procedure === "agents.run") {
				return { kind: "chat", sessionId: "session-1", label: "label" };
			}
			throw new Error(`unexpected procedure: ${procedure}`);
		});
	});

	test("dispatches even when v2Hosts.isOnline=false but the host is actually reachable via relay", async () => {
		// Scenario from issue #4803: user's local desktop is running and the relay
		// tunnel is up, but the v2_hosts.is_online cache has not been flipped to
		// true yet (relay debounces writes by 250ms + tRPC roundtrip latency, and
		// can lag during reconnects). The old behavior skipped dispatch with
		// "target host offline" purely from the stale cache. The fix is to let
		// the relay be the source of truth.
		selectResults.push([
			{
				organizationId: ORGANIZATION_ID,
				machineId: MACHINE_ID,
				name: "local",
				isOnline: false, // stale cache: relay tunnel is actually up
				createdByUserId: OWNER_USER_ID,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		]);
		// dispatching row insert returns the row
		insertReturning.push([{ id: RUN_ID }]);
		// owner lookup
		selectResults.push([{ email: "owner@example.com" }]);

		const outcome = await dispatchAutomation({
			automation: makeAutomation({ v2WorkspaceId: WORKSPACE_ID }),
			scheduledFor: new Date("2026-05-21T09:00:00Z"),
			relayUrl: "https://relay.example.com",
		});

		expect(outcome.status).toBe("dispatched");
		expect(relayMutationMock).toHaveBeenCalled();
	});

	test("records skipped_offline when the relay confirms no tunnel exists for the host", async () => {
		// When the host really is unreachable, the relay returns 503 "Host not
		// connected". The dispatcher should bucket this as skipped_offline (not
		// dispatch_failed) so the previous-runs sidebar still flags it as an
		// offline-host issue rather than a generic crash.
		selectResults.push([
			{
				organizationId: ORGANIZATION_ID,
				machineId: MACHINE_ID,
				name: "local",
				isOnline: true,
				createdByUserId: OWNER_USER_ID,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		]);
		insertReturning.push([{ id: RUN_ID }]);
		selectResults.push([{ email: "owner@example.com" }]);

		relayMutationMock.mockImplementation(async () => {
			throw new RelayDispatchError(
				"relay 503: Host not connected",
				503,
				'{"error":"Host not connected"}',
			);
		});

		const outcome = await dispatchAutomation({
			automation: makeAutomation({ v2WorkspaceId: WORKSPACE_ID }),
			scheduledFor: new Date("2026-05-21T09:00:00Z"),
			relayUrl: "https://relay.example.com",
		});

		expect(outcome.status).toBe("skipped_offline");
		if (outcome.status === "skipped_offline") {
			expect(outcome.error).toContain("target host offline");
		}
	});
});
