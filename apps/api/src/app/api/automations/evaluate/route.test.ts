import { afterAll, afterEach, expect, mock, spyOn, test } from "bun:test";
import type { PublishOpts } from "@superset/shared/self-host-queue";

const secret = "owned-evaluate-queue-secret-0123456789";
const fixtureEnv = {
	NODE_ENV: "development",
	NEXT_PUBLIC_API_URL: "https://api.example.test",
	QSTASH_TOKEN: "owned-cloud-token",
	QSTASH_URL: "https://qstash.example.test",
};
const originalEnv = {
	SELF_HOST_QUEUE: process.env.SELF_HOST_QUEUE,
	SELF_HOST_QUEUE_URL: process.env.SELF_HOST_QUEUE_URL,
	SELF_HOST_QUEUE_SECRET: process.env.SELF_HOST_QUEUE_SECRET,
};
process.env.SELF_HOST_QUEUE = "1";
process.env.SELF_HOST_QUEUE_URL = "http://queue.example.test";
process.env.SELF_HOST_QUEUE_SECRET = secret;
mock.module("@/env", () => ({ env: fixtureEnv }));
let count = 2000,
	invalidLast = false,
	advanced = 0;
const scheduledFor = new Date("2026-10-04T00:00:00Z");
function dueRows() {
	return Array.from({ length: count }, (_, index) => ({
		automationId:
			invalidLast && index === count - 1 ? "invalid\0" : `automation_${index}`,
		organizationId: "owned-org",
		triggerId: `trigger_${index}`,
		nextRunAt: scheduledFor,
		config: {
			kind: "schedule",
			rrule: "FREQ=DAILY",
			dtstart: "2026-10-01T00:00:00Z",
			timezone: "UTC",
		},
	}));
}
mock.module("@superset/db/client", () => ({
	db: {
		select: (fields: Record<string, unknown>) => {
			if ("automationId" in fields) {
				const chain = {
					from: () => chain,
					innerJoin: () => chain,
					where: () => chain,
					orderBy: () => chain,
					limit: async () => dueRows(),
				};
				return chain;
			}
			const chain = {
				from: () => chain,
				where: () => chain,
				orderBy: async () => [
					{ organizationId: "owned-org", plan: "pro", status: "active" },
				],
			};
			return chain;
		},
		update: () => ({
			set: () => ({
				where: async () => {
					advanced++;
				},
			}),
		}),
	},
}));
mock.module("@/lib/singleFlight", () => ({
	singleFlight: async () => ({ ran: false }),
}));
mock.module("@/lib/automations/redispatchUndispatched", () => ({
	redispatchUndispatched: async () => ({}),
}));
const { POST } = await import("./route");
afterAll(() => {
	for (const [name, value] of Object.entries(originalEnv)) {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
});
const cleanups: (() => void)[] = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0).reverse()) cleanup();
	count = 2000;
	invalidLast = false;
	advanced = 0;
	process.env.SELF_HOST_QUEUE = "1";
});
function request() {
	return new Request(
		`${fixtureEnv.NEXT_PUBLIC_API_URL}/api/automations/evaluate`,
		{ method: "POST", headers: { "x-self-host-queue": secret }, body: "{}" },
	);
}
function network(
	handler: (
		input: Parameters<typeof fetch>[0],
		init?: Parameters<typeof fetch>[1],
	) => Promise<Response>,
) {
	const originalFetch = globalThis.fetch;
	const spy = spyOn(globalThis, "fetch").mockImplementation(
		Object.assign(handler, originalFetch),
	);
	cleanups.push(() => spy.mockRestore());
	return spy;
}

test.each([
	1001, 2000,
])("native evaluate publishes all %i due schedules before advancing", async (size) => {
	count = size;
	const published: PublishOpts[] = [];
	network(async (input, init) => {
		if (String(input) !== "http://queue.example.test/jobs")
			throw Error("unexpected actual network");
		const publication: PublishOpts = JSON.parse(String(init?.body));
		published.push(publication);
		return Response.json(
			{ messageId: `stored_${published.length}` },
			{ status: 202 },
		);
	});
	const response = await POST(request());
	expect(response.status).toBe(200);
	expect((await response.json()).enqueued).toBe(size);
	expect(published).toHaveLength(size);
	expect(advanced).toBe(size);
	expect(published.at(-1)).toEqual({
		url: `https://api.example.test/api/automations/dispatch/automation_${size - 1}`,
		body: {
			automationId: `automation_${size - 1}`,
			triggerId: `trigger_${size - 1}`,
			scheduledFor: scheduledFor.toISOString(),
		},
		deduplicationId: `automation_${size - 1}_${scheduledFor.getTime()}`,
		retries: 2,
		failureCallback: "https://api.example.test/api/automations/run-failed",
	});
});

test("native evaluate preflights its final schedule before sending any earlier publication", async () => {
	invalidLast = true;
	const spy = network(async () =>
		Response.json({ messageId: "stored" }, { status: 202 }),
	);
	await expect(POST(request())).rejects.toThrow();
	expect(spy).not.toHaveBeenCalled();
	expect(advanced).toBe(0);
});

test("native evaluate leaves schedules due after a later group fails and retries with the same dedupe keys", async () => {
	const persisted = new Map<string, string>();
	let attempts = 0;
	network(async (_input, init) => {
		attempts++;
		if (attempts === 1001) return new Response(null, { status: 503 });
		const publication: PublishOpts = JSON.parse(String(init?.body));
		const key = publication.deduplicationId;
		if (!key) throw Error("actual schedule omitted dedupe");
		if (!persisted.has(key)) persisted.set(key, `stored_${persisted.size}`);
		return Response.json({ messageId: persisted.get(key) }, { status: 202 });
	});
	await expect(POST(request())).rejects.toThrow(
		"persistence acknowledgement failed",
	);
	expect(attempts).toBe(2000);
	expect(advanced).toBe(0);
	const firstId = persisted.get(`automation_0_${scheduledFor.getTime()}`);
	const response = await POST(request());
	expect(response.status).toBe(200);
	expect(attempts).toBe(4000);
	expect(advanced).toBe(2000);
	expect(persisted.size).toBe(2000);
	expect(persisted.get(`automation_0_${scheduledFor.getTime()}`)).toBe(firstId);
});

test("cloud evaluate keeps its genuine single 2000-item SDK batch, token, URL and options", async () => {
	process.env.SELF_HOST_QUEUE = "0";
	const requests: { url: string; headers: Headers; body: unknown[] }[] = [];
	network(async (input, init) => {
		const body: unknown[] = JSON.parse(String(init?.body));
		requests.push({
			url: String(input),
			headers: new Headers(init?.headers),
			body,
		});
		return Response.json(
			body.map((_, index) => ({ messageId: `cloud_${index}` })),
		);
	});
	const modulePath = `${import.meta.dir}/route.ts?cloud-batch-control`;
	const cloud: typeof import("./route") = await import(modulePath);
	const response = await cloud.POST(request());
	expect(response.status).toBe(200);
	expect(requests).toHaveLength(1);
	expect(requests[0]?.url).toBe("https://qstash.example.test/v2/batch");
	expect(requests[0]?.headers.get("authorization")).toBe(
		"Bearer owned-cloud-token",
	);
	expect(requests[0]?.body).toHaveLength(2000);
	expect(requests[0]?.body[0]).toMatchObject({
		destination:
			"https://api.example.test/api/automations/dispatch/automation_0",
		body: JSON.stringify({
			automationId: "automation_0",
			triggerId: "trigger_0",
			scheduledFor: scheduledFor.toISOString(),
		}),
		headers: {
			"upstash-retries": "2",
			"upstash-deduplication-id": `automation_0_${scheduledFor.getTime()}`,
			"upstash-failure-callback":
				"https://api.example.test/api/automations/run-failed",
		},
	});
	expect(advanced).toBe(2000);
});
