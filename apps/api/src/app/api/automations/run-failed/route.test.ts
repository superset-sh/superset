import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { DurableQueue } from "../../../../../../../docker/self-host/queue";

const secret = "owned-run-failed-native-queue-secret-0123456789";
mock.module("@/env", () => ({
	env: {
		NODE_ENV: "production",
		NEXT_PUBLIC_API_URL: "https://api.example.test",
	},
}));
const select = mock(() => ({
	from: () => ({ where: () => ({ limit: async () => [] }) }),
}));
mock.module("@superset/db/client", () => ({ db: { select } }));
mock.module("@sentry/nextjs", () => ({ captureException: () => {} }));
mock.module("@superset/trpc/realtime", () => ({ nudge: () => {} }));
const { POST } = await import("./route");
const originals = {
	flag: process.env.SELF_HOST_QUEUE,
	secret: process.env.SELF_HOST_QUEUE_SECRET,
};
afterEach(() => {
	select.mockClear();
	for (const [name, value] of Object.entries({
		SELF_HOST_QUEUE: originals.flag,
		SELF_HOST_QUEUE_SECRET: originals.secret,
	})) {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
});
const source = {
	automationId: "11111111-1111-4111-8111-111111111111",
	scheduledFor: "2026-10-04T00:00:00.000Z",
};
function request(status: number | null) {
	process.env.SELF_HOST_QUEUE = "1";
	process.env.SELF_HOST_QUEUE_SECRET = secret;
	return new Request("http://internal/api/automations/run-failed", {
		method: "POST",
		headers: { "x-self-host-queue": secret },
		body: JSON.stringify({
			sourceMessageId: "owned-source",
			sourceBody: Buffer.from(JSON.stringify(source)).toString("base64"),
			status,
			error: "Delivery failed or timed out",
			retried: 0,
		}),
	});
}
test("run-failed consumes the native no-response status0 callback without changing its payload schema", async () => {
	const response = await POST(request(0));
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({ ok: true, skipped: "deleted" });
	expect(select).toHaveBeenCalledTimes(1);
});
test("run-failed continues to reject a null callback status before database work", async () => {
	const logging = spyOn(console, "error").mockImplementation(() => {});
	try {
		expect((await POST(request(null))).status).toBe(400);
		expect(select).not.toHaveBeenCalled();
	} finally {
		logging.mockRestore();
	}
});
test("native worker transport exhaustion produces a callback the actual run-failed handler consumes", async () => {
	process.env.SELF_HOST_QUEUE = "1";
	process.env.SELF_HOST_QUEUE_SECRET = secret;
	const callbacks: { body: unknown; status: number }[] = [];
	const network = spyOn(globalThis, "fetch").mockImplementation(
		async (input, init) => {
			if (new URL(String(input)).pathname !== "/api/automations/run-failed")
				throw Error("owned-private-transport-error");
			const body = JSON.parse(String(init?.body));
			const response = await POST(new Request(String(input), init));
			callbacks.push({ body, status: response.status });
			return response;
		},
	);
	const queue = new DurableQueue({
		database: ":memory:",
		apiOrigin: "https://api.example.test",
		deliveryOrigin: "http://127.0.0.1:9999",
		secret,
	});
	const logging = spyOn(console, "error").mockImplementation(() => {});
	try {
		queue.publish({
			url: `https://api.example.test/api/automations/dispatch/${source.automationId}`,
			body: source,
			retries: 0,
			failureCallback: "https://api.example.test/api/automations/run-failed",
		});
		await queue.runDue();
		await queue.runDue();
		expect(callbacks).toHaveLength(1);
		expect(callbacks[0]?.status).toBe(200);
		expect(callbacks[0]?.body).toMatchObject({ status: 0, retried: 0 });
		expect(JSON.stringify(callbacks[0]?.body)).not.toContain(
			"owned-private-transport-error",
		);
		expect(queue.stats()).toMatchObject({ done: 1, failed: 1, pending: 0 });
	} finally {
		network.mockRestore();
		logging.mockRestore();
		queue.close();
	}
});
