import { beforeEach, describe, expect, mock, test } from "bun:test";

const scheduledFor = new Date("2026-08-06T18:46:00.000Z");
const previousUpdatedAt = new Date("2026-08-01T00:00:00.000Z");
const terminalDispatchToken = new Date(previousUpdatedAt.getTime() + 1);
const userPausedUpdatedAt = new Date("2026-08-02T00:00:00.000Z");
const automationId = "75c82d06-77af-454c-9f0c-e6c617ea702b";

type DispatchOutcome =
	| { status: "dispatched"; runId: string }
	| { status: "conflict" };

let dispatchOutcome: DispatchOutcome = {
	status: "dispatched",
	runId: "3166c37c-add6-4382-ad07-44c816edb03e",
};
const dispatchAutomation = mock(async () => dispatchOutcome);
const updateValues: unknown[] = [];
const updateWhereValues: unknown[] = [];
let claimSucceeds = true;

let automation = {
	id: automationId,
	enabled: true,
	nextRunAt: scheduledFor,
	updatedAt: previousUpdatedAt,
};

mock.module("@/env", () => ({
	env: {
		NEXT_PUBLIC_API_URL: "http://localhost:3001",
		RELAY_URL: "https://relay.example.com",
		QSTASH_CURRENT_SIGNING_KEY: "current-key",
		QSTASH_NEXT_SIGNING_KEY: "next-key",
	},
}));

mock.module("@upstash/qstash", () => ({
	Receiver: class {
		verify = mock(async () => true);
	},
}));

mock.module("@superset/db/schema", () => ({
	automations: {
		id: "id",
		enabled: "enabled",
		nextRunAt: "nextRunAt",
		updatedAt: "updatedAt",
	},
}));

mock.module("@superset/db/client", () => ({
	dbWs: {
		select: () => ({
			from: () => ({
				where: () => ({
					limit: async () => [automation],
				}),
			}),
		}),
		update: () => ({
			set: (values: unknown) => {
				updateValues.push(values);
				return {
					where: (condition: unknown) => {
						updateWhereValues.push(condition);
						return {
							returning: async () =>
								claimSucceeds ? [{ id: automationId }] : [],
						};
					},
				};
			},
		}),
	},
}));

mock.module("@superset/trpc/automation-dispatch", () => ({
	dispatchAutomation,
}));

mock.module("drizzle-orm", () => ({
	and: (...conditions: unknown[]) => ({ type: "and", conditions }),
	eq: (field: unknown, value: unknown) => ({ type: "eq", field, value }),
}));

const { POST } = await import("./route");

function request(payload: Record<string, unknown>): Request {
	return new Request(
		`http://localhost:3001/api/automations/dispatch/${automationId}`,
		{
			method: "POST",
			headers: { "upstash-signature": "valid-signature" },
			body: JSON.stringify(payload),
		},
	);
}

const params = Promise.resolve({ id: automationId });

describe("automations dispatch route", () => {
	beforeEach(() => {
		dispatchAutomation.mockClear();
		dispatchOutcome = {
			status: "dispatched",
			runId: "3166c37c-add6-4382-ad07-44c816edb03e",
		};
		automation = {
			id: automationId,
			enabled: true,
			nextRunAt: scheduledFor,
			updatedAt: previousUpdatedAt,
		};
		updateValues.length = 0;
		updateWhereValues.length = 0;
		claimSucceeds = true;
	});

	test("claims an enabled terminal occurrence before dispatching it", async () => {
		const response = await POST(
			request({
				automationId,
				scheduledFor: scheduledFor.toISOString(),
				terminal: true,
				terminalDispatchToken: terminalDispatchToken.toISOString(),
				terminalPreviousUpdatedAt: previousUpdatedAt.toISOString(),
			}),
			{ params },
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			ok: true,
			outcome: {
				status: "dispatched",
				runId: "3166c37c-add6-4382-ad07-44c816edb03e",
			},
		});
		expect(dispatchAutomation).toHaveBeenCalledTimes(1);
		expect(updateValues).toEqual([
			{ enabled: false, updatedAt: terminalDispatchToken },
		]);
		expect(updateWhereValues[0]).toEqual({
			type: "and",
			conditions: [
				{ type: "eq", field: "id", value: automationId },
				{ type: "eq", field: "enabled", value: true },
				{ type: "eq", field: "nextRunAt", value: scheduledFor },
				{ type: "eq", field: "updatedAt", value: previousUpdatedAt },
			],
		});
	});

	test("returns non-2xx for a terminal dispatch conflict", async () => {
		automation.enabled = false;
		automation.updatedAt = terminalDispatchToken;
		dispatchOutcome = { status: "conflict" };

		const response = await POST(
			request({
				automationId,
				scheduledFor: scheduledFor.toISOString(),
				terminal: true,
				terminalDispatchToken: terminalDispatchToken.toISOString(),
				terminalPreviousUpdatedAt: previousUpdatedAt.toISOString(),
			}),
			{ params },
		);

		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({
			ok: false,
			error: "Terminal automation dispatch is already in progress",
		});
		expect(dispatchAutomation).toHaveBeenCalledTimes(1);
	});

	test("does not dispatch an automation intentionally disabled by the user", async () => {
		automation.enabled = false;
		automation.updatedAt = userPausedUpdatedAt;

		const response = await POST(
			request({
				automationId,
				scheduledFor: scheduledFor.toISOString(),
			}),
			{ params },
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			ok: true,
			skipped: "disabled",
		});
		expect(dispatchAutomation).not.toHaveBeenCalled();
		expect(updateValues).toEqual([]);
	});

	test("dispatches a terminal occurrence reserved by evaluate", async () => {
		automation.enabled = false;
		automation.updatedAt = terminalDispatchToken;

		const response = await POST(
			request({
				automationId,
				scheduledFor: scheduledFor.toISOString(),
				terminal: true,
				terminalDispatchToken: terminalDispatchToken.toISOString(),
				terminalPreviousUpdatedAt: previousUpdatedAt.toISOString(),
			}),
			{ params },
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			ok: true,
			outcome: {
				status: "dispatched",
				runId: "3166c37c-add6-4382-ad07-44c816edb03e",
			},
		});
		expect(dispatchAutomation).toHaveBeenCalledTimes(1);
		expect(updateValues).toEqual([{ updatedAt: terminalDispatchToken }]);
	});

	test("does not dispatch a terminal message after a user pause", async () => {
		automation.enabled = false;
		automation.updatedAt = userPausedUpdatedAt;

		const response = await POST(
			request({
				automationId,
				scheduledFor: scheduledFor.toISOString(),
				terminal: true,
				terminalDispatchToken: terminalDispatchToken.toISOString(),
				terminalPreviousUpdatedAt: previousUpdatedAt.toISOString(),
			}),
			{ params },
		);

		expect(await response.json()).toEqual({
			ok: true,
			skipped: "disabled",
		});
		expect(dispatchAutomation).not.toHaveBeenCalled();
		expect(updateValues).toEqual([]);
	});

	test("skips a stale terminal occurrence", async () => {
		const response = await POST(
			request({
				automationId,
				scheduledFor: new Date(scheduledFor.getTime() - 60_000).toISOString(),
				terminal: true,
				terminalDispatchToken: terminalDispatchToken.toISOString(),
				terminalPreviousUpdatedAt: previousUpdatedAt.toISOString(),
			}),
			{ params },
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			ok: true,
			skipped: "stale",
		});
		expect(dispatchAutomation).not.toHaveBeenCalled();
		expect(updateValues).toEqual([]);
	});

	test("does not dispatch when the terminal claim loses a concurrent update", async () => {
		claimSucceeds = false;

		const response = await POST(
			request({
				automationId,
				scheduledFor: scheduledFor.toISOString(),
				terminal: true,
				terminalDispatchToken: terminalDispatchToken.toISOString(),
				terminalPreviousUpdatedAt: previousUpdatedAt.toISOString(),
			}),
			{ params },
		);

		expect(await response.json()).toEqual({
			ok: true,
			skipped: "stale",
		});
		expect(dispatchAutomation).not.toHaveBeenCalled();
	});

	test("skips a terminal message for a different reservation", async () => {
		automation.enabled = false;
		automation.updatedAt = new Date("2026-08-03T00:00:00.000Z");

		const response = await POST(
			request({
				automationId,
				scheduledFor: scheduledFor.toISOString(),
				terminal: true,
				terminalDispatchToken: terminalDispatchToken.toISOString(),
				terminalPreviousUpdatedAt: previousUpdatedAt.toISOString(),
			}),
			{ params },
		);

		expect(await response.json()).toEqual({
			ok: true,
			skipped: "disabled",
		});
		expect(dispatchAutomation).not.toHaveBeenCalled();
	});

	test("keeps dispatching enabled non-terminal occurrences", async () => {
		const response = await POST(
			request({
				automationId,
				scheduledFor: scheduledFor.toISOString(),
			}),
			{ params },
		);

		expect(response.status).toBe(200);
		expect(dispatchAutomation).toHaveBeenCalledTimes(1);
		expect(updateValues).toEqual([]);
	});
});
