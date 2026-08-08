import { beforeEach, expect, mock, test } from "bun:test";

const automationId = "75c82d06-77af-454c-9f0c-e6c617ea702b";
const organizationId = "3ee200f3-c54c-46b1-b8b8-24a7f27348f3";
const terminalOccurrence = new Date("2026-08-06T18:46:30.000Z");
const scheduledFor = new Date("2026-08-06T18:46:00.000Z");
const previousUpdatedAt = new Date("2026-08-01T00:00:00.000Z");
const terminalDispatchToken = new Date(previousUpdatedAt.getTime() + 1);
const userPausedUpdatedAt = new Date("2026-08-02T00:00:00.000Z");
const insertValues: unknown[] = [];
const updateValues: unknown[] = [];
const updateWhereValues: unknown[] = [];

let automation = {
	organizationId,
	name: "Nightly automation",
	enabled: true,
	nextRunAt: terminalOccurrence,
	updatedAt: previousUpdatedAt,
};

beforeEach(() => {
	automation = {
		organizationId,
		name: "Nightly automation",
		enabled: true,
		nextRunAt: terminalOccurrence,
		updatedAt: previousUpdatedAt,
	};
	insertValues.length = 0;
	updateValues.length = 0;
	updateWhereValues.length = 0;
});

mock.module("@/env", () => ({
	env: {
		NEXT_PUBLIC_API_URL: "http://localhost:3001",
		QSTASH_CURRENT_SIGNING_KEY: "current-key",
		QSTASH_NEXT_SIGNING_KEY: "next-key",
	},
}));

mock.module("@sentry/nextjs", () => ({
	captureException: mock(() => undefined),
}));

mock.module("@upstash/qstash", () => ({
	Receiver: class {
		verify = mock(async () => true);
	},
}));

mock.module("@superset/db/schema", () => ({
	automations: {
		id: "id",
		organizationId: "organizationId",
		name: "name",
		enabled: "enabled",
		nextRunAt: "nextRunAt",
		updatedAt: "updatedAt",
	},
	automationRuns: {
		automationId: "automationId",
		organizationId: "organizationId",
		scheduledFor: "scheduledFor",
		status: "status",
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
		insert: () => ({
			values: (values: unknown) => {
				insertValues.push(values);
				return {
					onConflictDoUpdate: async () => undefined,
				};
			},
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
}));

const { POST } = await import("./route");

function requestFor({
	scheduledFor: sourceScheduledFor = scheduledFor,
	terminal = true,
}: {
	scheduledFor?: Date;
	terminal?: boolean;
} = {}): Request {
	const sourceBody = Buffer.from(
		JSON.stringify({
			automationId,
			scheduledFor: sourceScheduledFor.toISOString(),
			terminal,
			terminalDispatchToken: terminalDispatchToken.toISOString(),
			terminalPreviousUpdatedAt: previousUpdatedAt.toISOString(),
		}),
	).toString("base64");

	return new Request("http://localhost:3001/api/automations/run-failed", {
		method: "POST",
		headers: { "upstash-signature": "valid-signature" },
		body: JSON.stringify({
			sourceMessageId: "qstash-message-id",
			sourceBody,
			status: 500,
			error: "delivery failed",
		}),
	});
}

test("records a terminal delivery failure and closes the recurrence", async () => {
	const response = await POST(requestFor());

	expect(response.status).toBe(200);
	expect(insertValues).toEqual([
		expect.objectContaining({
			automationId,
			status: "dispatch_failed",
			scheduledFor,
		}),
	]);
	expect(updateValues).toEqual([
		{ enabled: false, updatedAt: terminalDispatchToken },
	]);
	expect(updateWhereValues[0]).toEqual({
		type: "and",
		conditions: [
			{ type: "eq", field: "id", value: automationId },
			{ type: "eq", field: "enabled", value: true },
			{ type: "eq", field: "nextRunAt", value: terminalOccurrence },
			{ type: "eq", field: "updatedAt", value: previousUpdatedAt },
		],
	});
});

test("does not close a changed terminal occurrence", async () => {
	const response = await POST(
		requestFor({
			scheduledFor: new Date(scheduledFor.getTime() - 60_000),
		}),
	);

	expect(response.status).toBe(200);
	expect(insertValues).toHaveLength(1);
	expect(updateValues).toEqual([]);
	expect(updateWhereValues).toEqual([]);
});

test("does not close a user-paused automation", async () => {
	automation.enabled = false;
	automation.updatedAt = userPausedUpdatedAt;

	const response = await POST(requestFor());

	expect(response.status).toBe(200);
	expect(insertValues).toHaveLength(1);
	expect(updateValues).toEqual([]);
	expect(updateWhereValues).toEqual([]);
});
