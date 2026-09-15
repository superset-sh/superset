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
mock.module("@superset/trpc/connectors", () => ({
	accountConnection: mock(async () => subscribers[0] ?? null),
	accountConnections: mock(async () => subscribers),
}));

mock.module("@superset/trpc/integrations/linear", () => ({
	getLinearClient: mock(async () => null),
	linearClientFor: mock(async () => null),
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

mock.module("@superset/db/client", () => ({
	db: { update: () => ({ set: () => ({ where: async () => undefined }) }) },
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
