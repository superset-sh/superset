import { describe, expect, mock, test } from "bun:test";
import { nextOccurrenceAfter } from "@superset/shared/rrule";

const terminalOccurrence = new Date("2026-08-06T18:46:30.000Z");
const nonTerminalOccurrence = new Date("2026-08-05T18:46:30.000Z");
const terminalUpdatedAt = new Date("2026-08-01T00:00:00.000Z");
const nonTerminalUpdatedAt = new Date("2026-08-01T00:00:00.000Z");
const automationId = "75c82d06-77af-454c-9f0c-e6c617ea702b";
const terminalDispatchToken = new Date(terminalUpdatedAt.getTime() + 1);

let dueAutomations: Array<{
	id: string;
	nextRunAt: Date;
	rrule: string;
	dtstart: Date;
	timezone: string;
	updatedAt: Date;
}> = [];
const updateValues: unknown[] = [];
const updateWhereValues: unknown[] = [];
const batchJSON = mock(async (_messages: unknown[]) => undefined);

mock.module("@/env", () => ({
	env: {
		NEXT_PUBLIC_API_URL: "http://localhost:3001",
		QSTASH_TOKEN: "test-token",
		QSTASH_URL: "https://qstash.example.com",
		QSTASH_CURRENT_SIGNING_KEY: "current-key",
		QSTASH_NEXT_SIGNING_KEY: "next-key",
	},
}));

mock.module("@upstash/qstash", () => ({
	Client: class {
		batchJSON = batchJSON;
	},
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
	automationRuns: {
		automationId: "automationId",
		organizationId: "organizationId",
		scheduledFor: "scheduledFor",
	},
}));

mock.module("@superset/db/client", () => ({
	dbWs: {
		select: () => ({
			from: () => ({
				where: () => ({
					orderBy: () => ({
						limit: async () => dueAutomations,
					}),
				}),
			}),
		}),
		update: () => ({
			set: (values: unknown) => {
				updateValues.push(values);
				return {
					where: async (condition: unknown) => {
						updateWhereValues.push(condition);
						return undefined;
					},
				};
			},
		}),
	},
}));

mock.module("drizzle-orm", () => ({
	and: (...conditions: unknown[]) => ({ type: "and", conditions }),
	eq: (field: unknown, value: unknown) => ({ type: "eq", field, value }),
	lte: (field: unknown, value: unknown) => ({ type: "lte", field, value }),
}));

const { POST } = await import("./route");

type EnqueuedMessage = {
	body: {
		automationId: string;
		scheduledFor: string;
		terminal: boolean;
	};
};

function request(): Request {
	return new Request("http://localhost:3001/api/automations/evaluate", {
		method: "POST",
		headers: { "upstash-signature": "valid-signature" },
		body: "{}",
	});
}

describe("automations evaluate route", () => {
	test("marks a COUNT=1 occurrence as terminal in the queued payload", async () => {
		dueAutomations = [
			{
				id: automationId,
				nextRunAt: terminalOccurrence,
				rrule: "FREQ=DAILY;COUNT=1",
				dtstart: terminalOccurrence,
				timezone: "UTC",
				updatedAt: terminalUpdatedAt,
			},
		];
		updateValues.length = 0;
		updateWhereValues.length = 0;
		batchJSON.mockClear();

		const response = await POST(request());

		expect(response.status).toBe(200);
		expect(batchJSON).toHaveBeenCalledTimes(1);
		const messages = batchJSON.mock.calls[0]?.[0] as EnqueuedMessage[];
		expect(messages[0]?.body).toEqual({
			automationId,
			scheduledFor: new Date(
				Math.floor(terminalOccurrence.getTime() / 60_000) * 60_000,
			).toISOString(),
			terminal: true,
			terminalDispatchToken: terminalDispatchToken.toISOString(),
			terminalPreviousUpdatedAt: terminalUpdatedAt.toISOString(),
		});
		expect(updateValues).toEqual([
			{
				enabled: false,
				updatedAt: terminalDispatchToken,
			},
		]);
		expect(updateWhereValues[0]).toEqual({
			type: "and",
			conditions: [
				{ type: "eq", field: "id", value: automationId },
				{ type: "eq", field: "enabled", value: true },
				{ type: "eq", field: "nextRunAt", value: terminalOccurrence },
				{ type: "eq", field: "updatedAt", value: terminalUpdatedAt },
			],
		});
	});

	test("keeps the existing non-terminal advance path", async () => {
		dueAutomations = [
			{
				id: automationId,
				nextRunAt: nonTerminalOccurrence,
				rrule: "FREQ=DAILY",
				dtstart: nonTerminalOccurrence,
				timezone: "UTC",
				updatedAt: nonTerminalUpdatedAt,
			},
		];
		updateValues.length = 0;
		updateWhereValues.length = 0;
		batchJSON.mockClear();

		const response = await POST(request());

		expect(response.status).toBe(200);
		const messages = batchJSON.mock.calls[0]?.[0] as EnqueuedMessage[];
		expect(messages[0]?.body.terminal).toBe(false);
		expect(updateValues).toEqual([
			{
				nextRunAt: nextOccurrenceAfter({
					rrule: "FREQ=DAILY",
					dtstart: nonTerminalOccurrence,
					timezone: "UTC",
					after: nonTerminalOccurrence,
				}),
			},
		]);
	});
});
