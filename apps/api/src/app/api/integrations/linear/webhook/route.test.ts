import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("@/env", () => ({
	env: {
		LINEAR_WEBHOOK_SECRET: "test-secret",
	},
}));

// Captured Linear payload that parseData() returns. Each test overwrites this.
let parsedPayload: unknown;

mock.module("@linear/sdk/webhooks", () => ({
	LINEAR_WEBHOOK_SIGNATURE_HEADER: "linear-signature",
	LinearWebhookClient: class {
		parseData() {
			return parsedPayload;
		}
	},
}));

// Spy we assert on: the on-demand workflow-state resync.
const syncWorkflowStatesMock = mock(async () => {});
mock.module("../jobs/initial-sync/syncWorkflowStates", () => ({
	syncWorkflowStates: syncWorkflowStatesMock,
}));

// getLinearClient returns a truthy client so the resync branch can run.
const getLinearClientMock = mock(async () => ({}));
mock.module("@superset/trpc/integrations/linear", () => ({
	mapPriorityFromLinear: () => "none",
	getLinearClient: getLinearClientMock,
}));

const CONNECTION = {
	id: "conn-1",
	organizationId: "org-1",
	connectedByUserId: "user-1",
};

const SYNCED_STATUS = { id: "status-1" };

// findFirst on taskStatuses returns whatever this queue dictates, one entry per call.
let taskStatusLookups: Array<typeof SYNCED_STATUS | undefined> = [];
const taskInsertValues = mock((_v: unknown) => {});

function makeInsertBuilder(table: string) {
	// tasks are awaited directly; webhookEvents needs a .returning() row.
	const builder = {
		values: (v: unknown) => {
			if (table === "tasks") taskInsertValues(v);
			return builder;
		},
		onConflictDoUpdate: () =>
			table === "tasks"
				? Promise.resolve(undefined)
				: {
						returning: async () => [
							{ id: "evt-1", status: "pending", retryCount: 0 },
						],
					},
	};
	return builder;
}

mock.module("@superset/db/client", () => ({
	db: {
		query: {
			integrationConnections: {
				findMany: async () => [CONNECTION],
			},
			taskStatuses: {
				findFirst: async () => taskStatusLookups.shift(),
			},
		},
		insert: (table: { _table?: string }) =>
			makeInsertBuilder(table?._table === "tasks" ? "tasks" : "webhookEvents"),
		update: () => ({
			set: () => ({
				where: async () => undefined,
			}),
		}),
	},
}));

// Schema identity objects so insert() can tell which table it received.
mock.module("@superset/db/schema", () => ({
	integrationConnections: { _table: "integrationConnections" },
	members: {},
	taskStatuses: {},
	tasks: { _table: "tasks" },
	users: {},
	webhookEvents: { _table: "webhookEvents" },
}));

const { POST } = await import("./route");

function issueWebhookRequest(stateId: string) {
	parsedPayload = {
		type: "Issue",
		action: "update",
		organizationId: "linear-org-1",
		webhookTimestamp: 1_700_000_000,
		data: {
			id: "issue-1",
			identifier: "ENG-1",
			title: "Test issue",
			description: null,
			state: { id: stateId },
			priority: 0,
			assignee: null,
			estimate: null,
			dueDate: null,
			labels: [],
			startedAt: null,
			completedAt: null,
			url: "https://linear.app/issue/ENG-1",
			createdAt: "2026-01-01T00:00:00.000Z",
		},
	};

	return new Request("http://localhost/api/integrations/linear/webhook", {
		method: "POST",
		headers: { "linear-signature": "fake" },
		body: "{}",
	});
}

describe("linear webhook — workflow state resync", () => {
	beforeEach(() => {
		syncWorkflowStatesMock.mockClear();
		getLinearClientMock.mockClear();
		taskInsertValues.mockClear();
	});

	test("resyncs workflow states when an issue references an unseen Linear state", async () => {
		// First lookup misses (status not yet synced), second lookup hits after resync.
		taskStatusLookups = [undefined, SYNCED_STATUS];

		const response = await POST(issueWebhookRequest("state-new"));

		expect(response.status).toBe(200);
		// The bug: webhook skipped unseen states without ever resyncing.
		expect(syncWorkflowStatesMock).toHaveBeenCalledTimes(1);
		// And after resync the task should actually be upserted, not skipped.
		expect(taskInsertValues).toHaveBeenCalledTimes(1);
	});

	test("does not resync when the state is already known", async () => {
		taskStatusLookups = [SYNCED_STATUS];

		const response = await POST(issueWebhookRequest("status-1"));

		expect(response.status).toBe(200);
		expect(syncWorkflowStatesMock).toHaveBeenCalledTimes(0);
		expect(taskInsertValues).toHaveBeenCalledTimes(1);
	});
});
