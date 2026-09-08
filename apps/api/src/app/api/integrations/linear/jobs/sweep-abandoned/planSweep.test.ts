import { describe, expect, test } from "bun:test";

import { type AbandonedRow, planSweep } from "./planSweep";

const LIMITS = { maxAttempts: 5, maxRequeues: 50 };
const HEADER = "b8c5d0aa-0000-4000-8000-000000000000";

function row(overrides: Partial<AbandonedRow> = {}): AbandonedRow {
	return {
		id: "9f1c0a3e-0000-4000-8000-000000000001",
		event_id: `delivery:h:${HEADER}`,
		received_at: "2026-09-08 01:53:31.335643",
		retry_count: 0,
		...overrides,
	};
}

describe("planSweep", () => {
	test("never re-queues a per-connection row as if it were a delivery", () => {
		const plan = planSweep(
			[
				row({
					event_id: `11111111-1111-1111-1111-111111111111-${HEADER}`,
				}),
			],
			LIMITS,
		);

		expect(plan.requeue).toHaveLength(0);
		expect(plan.unrecognised).toHaveLength(1);
	});

	test("never re-queues a row recorded before this format existed", () => {
		const plan = planSweep([row({ event_id: HEADER })], LIMITS);

		expect(plan.requeue).toHaveLength(0);
		expect(plan.unrecognised).toEqual([HEADER]);
	});

	test("gives up rather than looping once the attempts are spent", () => {
		const plan = planSweep([row({ retry_count: 5 })], LIMITS);

		expect(plan.requeue).toHaveLength(0);
		expect(plan.exhausted).toEqual(["9f1c0a3e-0000-4000-8000-000000000001"]);
	});

	test("the attempt before the last is still re-queued", () => {
		const plan = planSweep([row({ retry_count: 4 })], LIMITS);

		expect(plan.requeue).toHaveLength(1);
		expect(plan.exhausted).toHaveLength(0);
	});

	test("bounds one run, and the overflow is not silently given up on", () => {
		const rows = Array.from({ length: 120 }, (_, index) =>
			row({ id: `id-${index}` }),
		);

		const plan = planSweep(rows, LIMITS);

		expect(plan.requeue).toHaveLength(50);
		expect(plan.exhausted).toHaveLength(0);
		expect(plan.unrecognised).toHaveLength(0);
	});

	test("the ceiling never crowds out giving up", () => {
		// Exhausted rows must still be marked even when the re-queue ceiling is
		// already full, or a poison delivery is never written off.
		const rows = [
			...Array.from({ length: 60 }, (_, index) => row({ id: `id-${index}` })),
			row({ id: "poison", retry_count: 9 }),
		];

		const plan = planSweep(rows, LIMITS);

		expect(plan.requeue).toHaveLength(50);
		expect(plan.exhausted).toEqual(["poison"]);
	});

	test("carries the delivery header through unchanged", () => {
		const plan = planSweep([row()], LIMITS);

		expect(plan.requeue[0]?.deliveryId).toBe(HEADER);
	});

	test("a delivery that arrived without a header stays without one", () => {
		const plan = planSweep(
			[row({ event_id: "delivery:c:org-1-1757000000000-Issue-issue-1" })],
			LIMITS,
		);

		expect(plan.requeue[0]?.deliveryId).toBeNull();
	});

	test("reads the timestamp back as the UTC instant it was stored as", () => {
		const plan = planSweep([row()], LIMITS);

		// Microseconds are lost to Date, which is exactly why the consumer matches
		// the body on the event row rather than on this value.
		expect(plan.requeue[0]?.receivedAt.toISOString()).toBe(
			"2026-09-08T01:53:31.335Z",
		);
	});
});

describe("planSweep write-back fencing", () => {
	test("carries the count the row was read at, so the write-back can fence on it", () => {
		const plan = planSweep([row({ retry_count: 3 })], LIMITS);

		expect(plan.requeue[0]?.observedRetryCount).toBe(3);
	});

	test("the queue message carries only what the consumer needs", () => {
		const plan = planSweep([row()], LIMITS);
		const { observedRetryCount, ...work } = plan.requeue[0] ?? {};

		expect(observedRetryCount).toBe(0);
		expect(Object.keys(work).sort()).toEqual([
			"deliveryId",
			"receivedAt",
			"webhookEventId",
		]);
	});
});
