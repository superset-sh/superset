import { describe, expect, test } from "bun:test";

import {
	connectionEventId,
	type DeliveryIdentity,
	deliveryEventId,
} from "./deliveryIds";

const CONNECTION = "11111111-1111-1111-1111-111111111111";

function delivery(overrides: Partial<DeliveryIdentity> = {}): DeliveryIdentity {
	return {
		organizationId: "org-1",
		type: "Issue",
		action: "update",
		webhookTimestamp: 1_757_000_000_000,
		data: { id: "issue-1" },
		...overrides,
	};
}

describe("deliveryEventId", () => {
	test("an empty delivery header is not an id", () => {
		expect(deliveryEventId(delivery(), "")).toBe(
			"org-1-1757000000000-Issue-issue-1",
		);
	});

	test("bulk edits in the same millisecond do not collide", () => {
		const first = deliveryEventId(delivery({ data: { id: "issue-1" } }), null);
		const second = deliveryEventId(delivery({ data: { id: "issue-2" } }), null);

		expect(first).not.toBe(second);
	});

	test("falls back to the action when the payload names no entity", () => {
		expect(deliveryEventId(delivery({ data: null }), null)).toBe(
			"org-1-1757000000000-Issue-update",
		);
		expect(deliveryEventId(delivery({ data: {} }), null)).toBe(
			"org-1-1757000000000-Issue-update",
		);
	});

	test("the same delivery to two organizations is one id", () => {
		const header = "b8c5d0aa-0000-4000-8000-000000000000";

		expect(deliveryEventId(delivery(), header)).toBe(
			deliveryEventId(delivery({ organizationId: "org-2" }), header),
		);
	});
});

describe("connectionEventId", () => {
	test("keeps the format per-connection rows were recorded under", () => {
		const header = "b8c5d0aa-0000-4000-8000-000000000000";

		expect(
			connectionEventId(CONNECTION, deliveryEventId(delivery(), header)),
		).toBe(`${CONNECTION}-${header}`);
		expect(
			connectionEventId(CONNECTION, deliveryEventId(delivery(), null)),
		).toBe(`${CONNECTION}-org-1-1757000000000-Issue-issue-1`);
	});

	test("two connections on one delivery get different rows", () => {
		const id = deliveryEventId(delivery(), "delivery-1");

		expect(connectionEventId(CONNECTION, id)).not.toBe(
			connectionEventId("22222222-2222-2222-2222-222222222222", id),
		);
	});

	test("a connection row never collides with the delivery row", () => {
		const id = deliveryEventId(delivery(), "delivery-1");

		expect(connectionEventId(CONNECTION, id)).not.toBe(id);
	});
});
