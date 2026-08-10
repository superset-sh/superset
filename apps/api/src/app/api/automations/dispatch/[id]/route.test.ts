import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("@/env", () => ({
	env: {
		QSTASH_CURRENT_SIGNING_KEY: "sk-current",
		QSTASH_NEXT_SIGNING_KEY: "sk-next",
		NEXT_PUBLIC_API_URL: "http://localhost",
		RELAY_URL: "http://relay.localhost",
	},
}));

mock.module("@upstash/qstash", () => ({
	Receiver: class {
		verify = mock(async () => true);
	},
}));

const dispatchAutomation = mock(async () => ({
	status: "dispatched",
	runId: "run-1",
}));
mock.module("@superset/trpc/automation-dispatch", () => ({
	dispatchAutomation,
}));

let automationRow: Record<string, unknown> | null = null;
const insertedRuns: Record<string, unknown>[] = [];
mock.module("@superset/db/client", () => ({
	dbWs: {
		select: () => ({
			from: () => ({
				where: () => ({
					limit: async () => (automationRow ? [automationRow] : []),
				}),
			}),
		}),
		insert: () => ({
			values: (values: Record<string, unknown>) => ({
				onConflictDoNothing: async () => {
					insertedRuns.push(values);
				},
			}),
		}),
	},
}));

const { POST } = await import("./route");

const AUTOMATION_ID = "6b1f0f5e-8c2a-4f9f-9a3e-1c2d3e4f5a6b";
// evaluate enqueues scheduledFor floored to the minute; next_run_at keeps
// its seconds.
const SLOT = "2026-08-02T18:46:00.000Z";
const NEXT_RUN_AT = new Date("2026-08-02T18:46:16.613Z");

function makeAutomation(overrides: Record<string, unknown> = {}) {
	return {
		id: AUTOMATION_ID,
		organizationId: "0d9f6a2b-1c3d-4e5f-8a7b-9c0d1e2f3a4b",
		name: "daily report",
		enabled: true,
		nextRunAt: NEXT_RUN_AT,
		...overrides,
	};
}

function callRoute(body: Record<string, unknown>) {
	const request = new Request(
		`http://localhost/api/automations/dispatch/${AUTOMATION_ID}`,
		{
			method: "POST",
			headers: { "upstash-signature": "sig" },
			body: JSON.stringify(body),
		},
	);
	return POST(request, { params: Promise.resolve({ id: AUTOMATION_ID }) });
}

describe("automations dispatch route", () => {
	beforeEach(() => {
		dispatchAutomation.mockClear();
		insertedRuns.length = 0;
		automationRow = null;
	});

	test("dispatches an enabled automation", async () => {
		automationRow = makeAutomation();

		const response = await callRoute({
			automationId: AUTOMATION_ID,
			scheduledFor: SLOT,
		});

		expect(response.status).toBe(200);
		expect(dispatchAutomation).toHaveBeenCalledTimes(1);
		expect(insertedRuns).toHaveLength(0);
	});

	test("dispatches the terminal slot of a bounded rule after evaluate disabled it", async () => {
		automationRow = makeAutomation({ enabled: false });

		const response = await callRoute({
			automationId: AUTOMATION_ID,
			scheduledFor: SLOT,
			terminal: true,
		});

		expect(response.status).toBe(200);
		const json = (await response.json()) as { outcome?: { status: string } };
		expect(json.outcome?.status).toBe("dispatched");
		expect(dispatchAutomation).toHaveBeenCalledTimes(1);
		expect(insertedRuns).toHaveLength(0);
	});

	test("skips a disabled automation and records the dropped slot", async () => {
		automationRow = makeAutomation({ enabled: false });

		const response = await callRoute({
			automationId: AUTOMATION_ID,
			scheduledFor: SLOT,
		});

		expect(response.status).toBe(200);
		const json = (await response.json()) as { skipped?: string };
		expect(json.skipped).toBe("disabled");
		expect(dispatchAutomation).not.toHaveBeenCalled();
		expect(insertedRuns).toHaveLength(1);
		expect(insertedRuns[0]).toMatchObject({
			automationId: AUTOMATION_ID,
			status: "dispatch_failed",
			scheduledFor: new Date(SLOT),
		});
	});

	test("skips a stale terminal replay whose slot no longer matches next_run_at", async () => {
		automationRow = makeAutomation({
			enabled: false,
			nextRunAt: new Date("2026-08-03T18:46:00.000Z"),
		});

		const response = await callRoute({
			automationId: AUTOMATION_ID,
			scheduledFor: SLOT,
			terminal: true,
		});

		expect(response.status).toBe(200);
		const json = (await response.json()) as { skipped?: string };
		expect(json.skipped).toBe("disabled");
		expect(dispatchAutomation).not.toHaveBeenCalled();
		expect(insertedRuns).toHaveLength(1);
	});
});
