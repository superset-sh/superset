import { afterAll, afterEach, expect, mock, spyOn, test } from "bun:test";
import type { PublishOpts } from "@superset/shared/self-host-queue";

const fixtureEnv = {
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
process.env.SELF_HOST_QUEUE_SECRET = "owned-dispatch-queue-secret-0123456789";
mock.module("@/env", () => ({ env: fixtureEnv }));
let count = 2001,
	invalidLast = false,
	marked = 0;
mock.module("@superset/db/client", () => ({
	db: {
		select: () => {
			const chain = {
				from: () => chain,
				innerJoin: () => chain,
				where: async () =>
					Array.from({ length: count }, (_, index) => ({
						automationId:
							invalidLast && index === count - 1
								? "invalid\0"
								: `automation_${index}`,
						triggerId: `trigger_${index}`,
						ownerUserId: "owned-user",
						config: { kind: "webhook" },
					})),
			};
			return chain;
		},
		update: () => ({
			set: () => ({
				where: async () => {
					marked++;
				},
			}),
		}),
	},
}));
mock.module("@superset/db/utils", () => ({
	findProviderIdentity: async () => null,
}));
mock.module("@superset/trpc/billing", () => ({
	organizationPlan: async () => "pro",
}));
const { dispatchMatchingTriggers } = await import("./dispatchMatchingTriggers");
const params: Parameters<typeof dispatchMatchingTriggers>[0] = {
	organizationId: "owned-org",
	eventId: "owned-event",
	event: {
		provider: "webhook",
		eventType: "incoming",
		actorId: null,
		actorLogin: null,
		body: null,
	},
};
const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const fn of cleanup.splice(0).reverse()) fn();
	count = 2001;
	invalidLast = false;
	marked = 0;
	process.env.SELF_HOST_QUEUE = "1";
});
afterAll(() => {
	for (const [name, value] of Object.entries(originalEnv)) {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
});
function network(
	handler: (
		input: Parameters<typeof fetch>[0],
		init?: Parameters<typeof fetch>[1],
	) => Promise<Response>,
) {
	const original = globalThis.fetch;
	const spy = spyOn(globalThis, "fetch").mockImplementation(
		Object.assign(handler, original),
	);
	cleanup.push(() => spy.mockRestore());
	return spy;
}

test("native event dispatch publishes more than two bounded groups and only then marks the handoff", async () => {
	const published: PublishOpts[] = [];
	network(async (_input, init) => {
		published.push(JSON.parse(String(init?.body)));
		if (marked !== 0)
			throw Error("handoff marked before final acknowledgement");
		return Response.json(
			{ messageId: `stored_${published.length}` },
			{ status: 202 },
		);
	});
	expect(await dispatchMatchingTriggers(params)).toEqual({
		matched: 2001,
		considered: 2001,
	});
	expect(published).toHaveLength(2001);
	expect(marked).toBe(1);
	expect(published.at(-1)).toEqual({
		url: "https://api.example.test/api/automations/dispatch/automation_2000",
		body: {
			automationId: "automation_2000",
			triggerId: "trigger_2000",
			eventId: "owned-event",
		},
		deduplicationId: "trigger_2000_owned-event",
		retries: 2,
		failureCallback: "https://api.example.test/api/automations/run-failed",
	});
});

test("native event dispatch validates its final match before any earlier handoff", async () => {
	invalidLast = true;
	const spy = network(async () =>
		Response.json({ messageId: "stored" }, { status: 202 }),
	);
	await expect(dispatchMatchingTriggers(params)).rejects.toThrow();
	expect(spy).not.toHaveBeenCalled();
	expect(marked).toBe(0);
});

test("native event dispatch stops later groups on acknowledgement failure and replay keeps the same dedupe keys", async () => {
	const keys: string[] = [];
	let failure = true;
	network(async (_input, init) => {
		const publication: PublishOpts = JSON.parse(String(init?.body));
		keys.push(publication.deduplicationId ?? "missing");
		if (failure && keys.length === 1001)
			return new Response(null, { status: 503 });
		return Response.json(
			{ messageId: publication.deduplicationId },
			{ status: 202 },
		);
	});
	await expect(dispatchMatchingTriggers(params)).rejects.toThrow(
		"persistence acknowledgement failed",
	);
	expect(keys).toHaveLength(2000);
	expect(marked).toBe(0);
	failure = false;
	expect(await dispatchMatchingTriggers(params)).toEqual({
		matched: 2001,
		considered: 2001,
	});
	expect(keys.slice(2000, 4000)).toEqual(keys.slice(0, 2000));
	expect(keys.at(-1)).toBe("trigger_2000_owned-event");
	expect(marked).toBe(1);
});

test("cloud event dispatch preserves its genuine single unbounded batch and publication options", async () => {
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
	const modulePath = `${import.meta.dir}/dispatchMatchingTriggers.ts?cloud-batch-control`;
	const cloud: typeof import("./dispatchMatchingTriggers") = await import(
		modulePath
	);
	expect(await cloud.dispatchMatchingTriggers(params)).toEqual({
		matched: 2001,
		considered: 2001,
	});
	expect(requests).toHaveLength(1);
	expect(requests[0]?.url).toBe("https://qstash.example.test/v2/batch");
	expect(requests[0]?.headers.get("authorization")).toBe(
		"Bearer owned-cloud-token",
	);
	expect(requests[0]?.body).toHaveLength(2001);
	expect(requests[0]?.body[0]).toMatchObject({
		destination:
			"https://api.example.test/api/automations/dispatch/automation_0",
		body: JSON.stringify({
			automationId: "automation_0",
			triggerId: "trigger_0",
			eventId: "owned-event",
		}),
		headers: {
			"upstash-retries": "2",
			"upstash-deduplication-id": "trigger_0_owned-event",
			"upstash-failure-callback":
				"https://api.example.test/api/automations/run-failed",
		},
	});
	expect(marked).toBe(1);
});
