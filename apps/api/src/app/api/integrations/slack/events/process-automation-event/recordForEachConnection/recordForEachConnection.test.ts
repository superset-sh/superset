import { describe, expect, test } from "bun:test";
import type { IngestOutcome } from "@/lib/automations/ingestAutomationEvent";
import { recordForEachConnection } from "./recordForEachConnection";

// No `mock.module` anywhere in this file, deliberately. Bun's registrations are
// process-wide, and stubbing the db client or the connector lookup here reached
// whichever suite loaded next and broke it.

const dispatched: IngestOutcome = {
	status: "dispatched",
	eventId: "e1",
	matched: 1,
	considered: 1,
};

/**
 * One Slack workspace can be connected by several people, and each is an
 * account a trigger may be pinned to. Resolving to a single connection bound
 * every delivery to whichever row was touched last, so a trigger pinned to any
 * other one silently stopped matching.
 */
describe("recordForEachConnection", () => {
	test("records once per connection, in order", async () => {
		const seen: string[] = [];

		const outcomes = await recordForEachConnection(
			[{ id: "conn-a" }, { id: "conn-b" }],
			async (connection) => {
				seen.push(connection.id);
				return dispatched;
			},
		);

		expect(seen).toEqual(["conn-a", "conn-b"]);
		expect(outcomes).toHaveLength(2);
	});

	test("one connection failing does not cost the others their delivery", async () => {
		const seen: string[] = [];

		const outcomes = await recordForEachConnection(
			[{ id: "conn-a" }, { id: "conn-b" }],
			async (connection) => {
				if (connection.id === "conn-a") throw new Error("boom");
				seen.push(connection.id);
				return dispatched;
			},
		);

		expect(seen).toEqual(["conn-b"]);
		expect(outcomes).toHaveLength(2);
		expect(outcomes[0]?.status).toBe("dispatch_failed");
		expect(outcomes[1]?.status).toBe("dispatched");
	});

	// Sequential, for the reason Linear's fan-out documents: neon-http opens a
	// connection per query, so asking for all of them at one instant starves the
	// proxy's pool.
	test("does not start a connection before the previous one finishes", async () => {
		let inFlight = 0;
		let maxInFlight = 0;

		await recordForEachConnection(
			[{ id: "a" }, { id: "b" }, { id: "c" }],
			async () => {
				inFlight += 1;
				maxInFlight = Math.max(maxInFlight, inFlight);
				await Promise.resolve();
				inFlight -= 1;
				return dispatched;
			},
		);

		expect(maxInFlight).toBe(1);
	});

	test("records nothing when no one has connected the workspace", async () => {
		const outcomes = await recordForEachConnection([], async () => dispatched);
		expect(outcomes).toEqual([]);
	});
});
