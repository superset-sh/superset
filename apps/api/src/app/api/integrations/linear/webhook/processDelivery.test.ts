import { beforeEach, describe, expect, mock, test } from "bun:test";

const ORG = "org-1";
const WORKSPACE = "linear-workspace-1";

function connection(id: string, userId: string) {
	return {
		id,
		organizationId: ORG,
		connectedByUserId: userId,
		connector: "linear",
		ownerKind: "user",
		externalAccountId: WORKSPACE,
		disconnectedAt: null,
	};
}

let subscribers: ReturnType<typeof connection>[] = [];
// `mock.module` is process-wide, so every export the real module has must be
// here: another file's import of `connectionBotToken` resolves against this
// stub too.
mock.module("@superset/trpc/connectors", () => ({
	accountConnection: mock(async () => subscribers[0] ?? null),
	accountConnections: mock(async () => subscribers),
	connectionBotToken: mock(async () => "bot-token"),
}));

let linearClient: unknown = null;
mock.module("@superset/trpc/integrations/linear", () => ({
	getLinearClient: mock(async () => linearClient),
	linearClientFor: mock(async () => linearClient),
	isLinearAuthError: () => false,
	mapPriorityFromLinear: () => null,
}));

let eventSeq = 0;
mock.module("@/lib/ingest/recordWebhookDelivery", () => ({
	recordWebhookDelivery: mock(async () => ({
		id: `webhook-event-${++eventSeq}`,
		status: "pending",
		retryCount: 0,
		receivedAt: new Date(),
	})),
}));

const ingestCalls: Array<{
	connectionId: string | null;
	externalEventId: string;
	ownerUserId: string | null;
}> = [];
mock.module("@/lib/automations/ingestAutomationEvent", () => ({
	ingestAutomationEvent: mock(async (_db: unknown, delivery: never) => {
		const d = delivery as {
			skip?: string;
			event?: {
				integrationConnectionId: string | null;
				externalEventId: string;
			};
			dispatch?: { ownerUserId?: string } | null;
		};
		if (d.skip) return { status: "skipped", reason: d.skip };
		ingestCalls.push({
			connectionId: d.event?.integrationConnectionId ?? null,
			externalEventId: d.event?.externalEventId ?? "",
			ownerUserId: d.dispatch?.ownerUserId ?? null,
		});
		return { status: "dispatched", eventId: "e" };
	}),
}));

const DONE_STATE = { id: "status-done", externalId: "linear-state-done" };
let syncedStates: Array<typeof DONE_STATE> = [];
const upsertedStatusIds: string[] = [];
mock.module("@superset/db/client", () => ({
	db: {
		update: () => ({ set: () => ({ where: async () => undefined }) }),
		query: {
			taskStatuses: { findFirst: async () => syncedStates[0] },
			tasks: { findFirst: async () => undefined },
		},
		insert: () => ({
			values: (row: { statusId: string }) => ({
				onConflictDoUpdate: async () => {
					upsertedStatusIds.push(row.statusId);
				},
			}),
		}),
	},
}));

const workflowStateSyncs: Array<{ organizationId: string; teamId?: string }> =
	[];
let linearHasState = true;
mock.module("../jobs/initial-sync/syncWorkflowStates", () => ({
	syncWorkflowStates: mock(
		async (input: { organizationId: string; teamId?: string }) => {
			workflowStateSyncs.push({
				organizationId: input.organizationId,
				teamId: input.teamId,
			});
			if (linearHasState) syncedStates = [DONE_STATE];
		},
	),
}));

const { processDelivery } = await import("./processDelivery");

const DELIVERY = {
	organizationId: WORKSPACE,
	type: "Issue",
	action: "create",
	webhookTimestamp: 1_700_000_000,
	data: { id: "issue-1", title: "Repro", teamId: "team-1", assigneeId: null },
	updatedFrom: null,
} as never;

describe("one Linear delivery, two connections in the same organization", () => {
	beforeEach(() => {
		ingestCalls.length = 0;
		eventSeq = 0;
		subscribers = [
			connection("conn-a", "user-a"),
			connection("conn-b", "user-b"),
		];
	});

	test("records one automation event per connection", async () => {
		await processDelivery({ payload: DELIVERY, deliveryId: "delivery-1" });
		expect(ingestCalls.map((c) => c.connectionId)).toEqual([
			"conn-a",
			"conn-b",
		]);
	});

	test("both events name the same delivery", async () => {
		await processDelivery({ payload: DELIVERY, deliveryId: "delivery-1" });
		const ids = new Set(ingestCalls.map((c) => c.externalEventId));
		expect(ids.size).toBe(1);
	});

	test("narrows each dispatch to the member who owns that connection", async () => {
		await processDelivery({ payload: DELIVERY, deliveryId: "delivery-1" });
		expect(ingestCalls.map((c) => c.ownerUserId)).toEqual(["user-a", "user-b"]);
	});
});

describe("an issue moved into a Linear state the organization has not synced", () => {
	const MOVED_TO_DONE = {
		organizationId: WORKSPACE,
		type: "Issue",
		action: "update",
		webhookTimestamp: 1_700_000_000,
		data: {
			id: "issue-2",
			identifier: "ENG-1",
			title: "Moved to Done",
			description: null,
			priority: 0,
			estimate: null,
			dueDate: null,
			createdAt: "2026-09-17T08:00:00.000Z",
			updatedAt: "2026-09-18T08:00:00.000Z",
			startedAt: "2026-09-17T09:00:00.000Z",
			completedAt: "2026-09-18T08:00:00.000Z",
			url: "https://linear.app/example/issue/ENG-1",
			teamId: "team-1",
			assignee: null,
			assigneeId: null,
			labels: [],
			state: { id: DONE_STATE.externalId, name: "Done", type: "completed" },
		},
		updatedFrom: { stateId: "linear-state-in-progress" },
	} as never;

	beforeEach(() => {
		subscribers = [connection("conn-a", "user-a")];
		syncedStates = [];
		upsertedStatusIds.length = 0;
		workflowStateSyncs.length = 0;
		linearHasState = true;
		linearClient = {
			client: { request: async () => ({ issue: { branchName: "eng-1" } }) },
		};
	});

	test("resyncs the team's workflow states and applies the new status", async () => {
		const result = await processDelivery({
			payload: MOVED_TO_DONE,
			deliveryId: "delivery-2",
		});

		expect(workflowStateSyncs).toEqual([
			{ organizationId: ORG, teamId: "team-1" },
		]);
		expect(upsertedStatusIds).toEqual([DONE_STATE.id]);
		expect(result.results.map((r) => r.outcome)).toEqual(["processed"]);
	});

	test("still skips when the state is missing after the resync", async () => {
		linearHasState = false;
		const result = await processDelivery({
			payload: MOVED_TO_DONE,
			deliveryId: "delivery-3",
		});

		expect(workflowStateSyncs).toHaveLength(1);
		expect(upsertedStatusIds).toEqual([]);
		expect(result.results.map((r) => r.outcome)).toEqual(["skipped"]);
	});
});
