import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("@/env", () => ({
	env: {
		QSTASH_TOKEN: "test-token",
		QSTASH_URL: "http://qstash.localhost",
		QSTASH_CURRENT_SIGNING_KEY: "sk-current",
		QSTASH_NEXT_SIGNING_KEY: "sk-next",
		NEXT_PUBLIC_API_URL: "http://localhost",
	},
}));

type BatchMessage = {
	body: { automationId: string; scheduledFor: string; terminal: boolean };
	deduplicationId: string;
};

const batches: BatchMessage[][] = [];
mock.module("@upstash/qstash", () => ({
	Client: class {
		batchJSON = async (messages: BatchMessage[]) => {
			batches.push(messages);
		};
	},
	Receiver: class {
		verify = mock(async () => true);
	},
}));

let dueRows: Record<string, unknown>[] = [];
const updates: Record<string, unknown>[] = [];
mock.module("@superset/db/client", () => ({
	dbWs: {
		select: () => ({
			from: () => ({
				where: () => ({
					orderBy: () => ({
						limit: async () => dueRows,
					}),
				}),
			}),
		}),
		update: () => ({
			set: (patch: Record<string, unknown>) => ({
				where: async () => {
					updates.push(patch);
				},
			}),
		}),
	},
}));

const { POST } = await import("./route");

const SLOT = new Date("2026-08-02T18:46:00.000Z");

function makeAutomation(rrule: string, id: string) {
	return {
		id,
		rrule,
		dtstart: SLOT,
		timezone: "UTC",
		nextRunAt: SLOT,
	};
}

function callRoute() {
	const request = new Request("http://localhost/api/automations/evaluate", {
		method: "POST",
		headers: { "upstash-signature": "sig" },
		body: "{}",
	});
	return POST(request);
}

describe("automations evaluate route", () => {
	beforeEach(() => {
		batches.length = 0;
		updates.length = 0;
		dueRows = [];
	});

	test("marks the terminal occurrence of a bounded rule and disables it", async () => {
		dueRows = [makeAutomation("FREQ=DAILY;COUNT=1", "a-count-1")];

		const response = await callRoute();

		expect(response.status).toBe(200);
		expect(batches).toHaveLength(1);
		expect(batches[0]?.[0]?.body).toMatchObject({
			automationId: "a-count-1",
			scheduledFor: SLOT.toISOString(),
			terminal: true,
		});
		expect(updates).toEqual([{ enabled: false }]);
	});

	test("non-terminal occurrences enqueue with terminal=false and advance next_run_at", async () => {
		dueRows = [
			makeAutomation("FREQ=DAILY", "a-unbounded"),
			makeAutomation("FREQ=MINUTELY;COUNT=2", "a-count-2"),
		];

		const response = await callRoute();

		expect(response.status).toBe(200);
		expect(batches[0]?.map((m) => m.body.terminal)).toEqual([false, false]);
		expect(updates).toHaveLength(2);
		for (const patch of updates) {
			expect(patch.enabled).toBeUndefined();
			expect(patch.nextRunAt).toBeInstanceOf(Date);
			expect((patch.nextRunAt as Date).getTime()).toBeGreaterThan(
				SLOT.getTime(),
			);
		}
	});

	test("an unparseable rrule still enqueues without terminal and reports an advance failure", async () => {
		dueRows = [makeAutomation("NOT-A-RULE", "a-broken")];

		const response = await callRoute();

		expect(response.status).toBe(200);
		const json = (await response.json()) as {
			enqueued: number;
			advanceFailed: number;
		};
		expect(json).toMatchObject({ enqueued: 1, advanceFailed: 1 });
		expect(batches[0]?.[0]?.body.terminal).toBe(false);
		expect(updates).toHaveLength(0);
	});
});
