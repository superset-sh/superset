import { afterEach, expect, mock, spyOn, test } from "bun:test";
import type { NormalizedDelivery } from "./ingestAutomationEvent";

mock.module("@superset/db/client", () => ({ db: {} }));
const { db } = await import("@superset/db/client");
let inserted: { id: string } | null = { id: "event-1" };
let recordFailure = false;
const recorded: unknown[] = [];
mock.module("./recordAutomationEvent", () => ({
	recordAutomationEvent: async (database: unknown, input: unknown) => {
		recorded.push({ database, input });
		if (recordFailure) throw Error("fixture record failure");
		return inserted;
	},
}));
const dispatched: unknown[] = [];
let dispatchFailure = false;
mock.module("./dispatchMatchingTriggers", () => ({
	dispatchMatchingTriggers: async (input: unknown) => {
		dispatched.push(input);
		if (dispatchFailure) throw Error("fixture dispatch failure");
		return { matched: 2, considered: 3 };
	},
}));
const implementation = await import("./ingestAutomationEvent");
const delivery: NormalizedDelivery = {
	event: {
		organizationId: "org-1",
		integrationConnectionId: "connection-1",
		provider: "gitlab",
		eventType: "merge_request",
		externalEventId: "delivery-1",
		title: "Merge request",
		payload: {},
	},
	dispatch: {
		event: {
			provider: "webhook",
			eventType: "incoming",
			actorId: null,
			actorLogin: null,
			body: null,
		},
		automationId: "automation-1",
		triggerId: "trigger-1",
		ownerUserId: "owner-1",
	},
};
afterEach(() => {
	inserted = { id: "event-1" };
	recordFailure = false;
	dispatchFailure = false;
	recorded.length = 0;
	dispatched.length = 0;
});

test("existing ingest keeps skip, duplicate and record-only outcomes without publishing", async () => {
	expect(
		await implementation.ingestAutomationEvent(db, { skip: "permanent" }),
	).toEqual({ status: "skipped", reason: "permanent" });
	expect(recorded).toHaveLength(0);
	inserted = null;
	expect(await implementation.ingestAutomationEvent(db, delivery)).toEqual({
		status: "duplicate",
	});
	inserted = { id: "event-1" };
	expect(
		await implementation.ingestAutomationEvent(db, {
			...delivery,
			dispatch: null,
		}),
	).toEqual({ status: "recorded", eventId: "event-1" });
	expect(dispatched).toHaveLength(0);
});
test("existing ingest passes all dispatch restrictions and leaves failed handoffs for redispatch", async () => {
	expect(await implementation.ingestAutomationEvent(db, delivery)).toEqual({
		status: "dispatched",
		eventId: "event-1",
		matched: 2,
		considered: 3,
	});
	expect(dispatched).toEqual([
		{
			organizationId: "org-1",
			integrationConnectionId: "connection-1",
			eventId: "event-1",
			event: delivery.dispatch?.event,
			automationId: "automation-1",
			triggerId: "trigger-1",
			ownerUserId: "owner-1",
		},
	]);
	dispatchFailure = true;
	const logging = spyOn(console, "error").mockImplementation(() => {});
	try {
		expect(await implementation.ingestAutomationEvent(db, delivery)).toEqual({
			status: "dispatch_failed",
			eventId: "event-1",
		});
	} finally {
		logging.mockRestore();
	}
});
test("existing ingest propagates record failures without dispatch", async () => {
	recordFailure = true;
	await expect(
		implementation.ingestAutomationEvent(db, delivery),
	).rejects.toThrow("fixture record failure");
	expect(dispatched).toHaveLength(0);
});
test("post-record dispatch helper performs no second insert and preserves duplicate and recorded outcomes", async () => {
	const helper = implementation.dispatchRecordedAutomationEvent;
	expect(typeof helper).toBe("function");
	if (!helper) return;
	expect(await helper(delivery, null)).toEqual({ status: "duplicate" });
	expect(
		await helper({ ...delivery, dispatch: null }, { id: "committed-1" }),
	).toEqual({ status: "recorded", eventId: "committed-1" });
	expect(await helper(delivery, { id: "committed-1" })).toEqual({
		status: "dispatched",
		eventId: "committed-1",
		matched: 2,
		considered: 3,
	});
	expect(recorded).toHaveLength(0);
	expect(dispatched).toHaveLength(1);
});
