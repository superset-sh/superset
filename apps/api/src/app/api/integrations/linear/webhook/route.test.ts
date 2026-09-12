import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("@/env", () => ({
	env: { LINEAR_WEBHOOK_SECRET: "test-secret" },
}));

mock.module("@linear/sdk/webhooks", () => ({
	LINEAR_WEBHOOK_SIGNATURE_HEADER: "linear-signature",
	LinearWebhookClient: class {
		parseData(body: Buffer) {
			return JSON.parse(body.toString());
		}
	},
}));

// Verified as a Hookdeck delivery, which is the path that skips Linear's own
// signature. What this file is about is what happens after verification.
mock.module("@/lib/webhooks/hookdeck", () => ({
	verifyHookdeckDelivery: () => "verified",
}));

let recorded: {
	id: string;
	status: string;
	retryCount: number;
	receivedAt: Date;
} | null = null;
let recordCalls = 0;
let recordThrows: Error | null = null;
mock.module("@/lib/ingest/recordWebhookDelivery", () => ({
	recordWebhookDelivery: mock(async () => {
		recordCalls += 1;
		if (recordThrows) throw recordThrows;
		return recorded;
	}),
}));

let subscribed = true;
mock.module("./processDelivery", () => ({
	hasActiveSubscriber: mock(async () => subscribed),
}));

let enqueued: unknown[] = [];
let enqueueThrows: Error | null = null;
mock.module("./queue", () => ({
	enqueueLinearDelivery: mock(async (work: unknown) => {
		if (enqueueThrows) throw enqueueThrows;
		enqueued.push(work);
	}),
}));

const { POST } = await import("./route");

const PAYLOAD = {
	organizationId: "org-1",
	type: "Issue",
	action: "update",
	webhookTimestamp: 1_757_000_000_000,
	data: { id: "issue-1" },
};

const RECEIVED_AT = new Date("2026-09-07T10:00:00.123Z");

function request(headers: Record<string, string> = {}): Request {
	return new Request("http://localhost/api/integrations/linear/webhook", {
		method: "POST",
		headers: { "x-hookdeck-signature": "sig", ...headers },
		body: JSON.stringify(PAYLOAD),
	});
}

beforeEach(() => {
	recorded = {
		id: "9f1c0a3e-0000-4000-8000-000000000000",
		status: "pending",
		retryCount: 0,
		receivedAt: RECEIVED_AT,
	};
	recordCalls = 0;
	recordThrows = null;
	subscribed = true;
	enqueued = [];
	enqueueThrows = null;
});

describe("linear webhook acceptance", () => {
	test("does not acknowledge a delivery it could not record", async () => {
		recorded = null;

		const response = await POST(request());

		expect(response.status).toBe(500);
		expect(enqueued).toHaveLength(0);
	});

	test("does not acknowledge a delivery it could not queue", async () => {
		enqueueThrows = new Error("qstash unavailable");

		const response = await POST(request());

		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toMatchObject({
			error: "Failed to queue delivery",
		});
	});

	test("records before queueing, and queues a pointer to the recorded row", async () => {
		const response = await POST(request({ "linear-delivery": "delivery-1" }));

		expect(response.status).toBe(200);
		expect(recordCalls).toBe(1);
		expect(enqueued).toEqual([
			{
				webhookEventId: "9f1c0a3e-0000-4000-8000-000000000000",
				receivedAt: RECEIVED_AT,
				deliveryId: "delivery-1",
			},
		]);
	});

	test("a delivery already carried through is not queued again", async () => {
		recorded = {
			id: "9f1c0a3e-0000-4000-8000-000000000000",
			status: "processed",
			retryCount: 0,
			receivedAt: RECEIVED_AT,
		};

		const response = await POST(request({ "linear-delivery": "delivery-1" }));

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			status: "processed",
		});
		expect(enqueued).toHaveLength(0);
	});

	test("acknowledges without the delivery header, keyed on the payload", async () => {
		const response = await POST(request());

		expect(response.status).toBe(200);
		expect(enqueued).toHaveLength(1);
		expect(enqueued[0]).toMatchObject({ deliveryId: null });
	});

	test("a delivery nobody subscribes to is neither recorded nor queued", async () => {
		subscribed = false;

		const response = await POST(request({ "linear-delivery": "delivery-1" }));

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			status: "no_subscribers",
		});
		expect(recordCalls).toBe(0);
		expect(enqueued).toHaveLength(0);
	});

	test("a malformed body is rejected before anything is recorded", async () => {
		const response = await POST(
			new Request("http://localhost/api/integrations/linear/webhook", {
				method: "POST",
				headers: { "x-hookdeck-signature": "sig" },
				body: "{not json",
			}),
		);

		expect(response.status).toBe(400);
		expect(recordCalls).toBe(0);
		expect(enqueued).toHaveLength(0);
	});
});
