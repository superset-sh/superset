import { afterEach, expect, spyOn, test } from "bun:test";

const secret = "owned-queue-fixture-secret-0123456789";
const cleanups: (() => void)[] = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});
async function implementation() {
	const module = await import("./self-host-queue").catch(() => undefined);
	expect(module?.makeDirectQueue).toBeDefined();
	if (!module) throw Error("Missing native queue foundation");
	return module;
}
function configure(url?: string) {
	for (const [key, value] of Object.entries({
		SELF_HOST_QUEUE: "1",
		SELF_HOST_QUEUE_SECRET: secret,
		SELF_HOST_QUEUE_URL: url,
	})) {
		const original = process.env[key];
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
		cleanups.push(() => {
			if (original === undefined) delete process.env[key];
			else process.env[key] = original;
		});
	}
}

test("native enqueue uses a caller deadline shorter than Slack acknowledgement without waiting for a timeout", async () => {
	const module = await implementation();
	configure();
	const deadlines: number[] = [];
	const timeout = spyOn(AbortSignal, "timeout").mockImplementation(
		(milliseconds) => {
			deadlines.push(milliseconds);
			return AbortSignal.abort();
		},
	);
	cleanups.push(() => timeout.mockRestore());
	await expect(
		module
			.makeDirectQueue({ publicationTimeoutMs: 2000 })
			.publishJSON({ url: "https://api.example.test/api/jobs/run" }),
	).rejects.toThrow("acknowledgement failed");
	expect(deadlines).toEqual([2000]);
});

test("native delivery authentication fails closed outside explicit mode or with missing, short or forged credentials", async () => {
	const module = await implementation();
	configure();
	const headers = new Headers({ "x-self-host-queue": secret });
	expect(module.isSelfHostQueueRequest(headers)).toBe(true);
	for (const supplied of ["", "wrong", `${secret}x`])
		expect(
			module.isSelfHostQueueRequest(
				new Headers({ "x-self-host-queue": supplied }),
			),
		).toBe(false);
	process.env.SELF_HOST_QUEUE = "true";
	expect(module.isSelfHostQueueRequest(headers)).toBe(false);
	process.env.SELF_HOST_QUEUE = "1";
	process.env.SELF_HOST_QUEUE_SECRET = "short";
	expect(
		module.isSelfHostQueueRequest(
			new Headers({ "x-self-host-queue": "short" }),
		),
	).toBe(false);
	delete process.env.SELF_HOST_QUEUE_SECRET;
	expect(module.isSelfHostQueueRequest(headers)).toBe(false);
});

test("native publisher waits for persistence acknowledgement and sends the supported JSON options to an owned server", async () => {
	const module = await implementation();
	let release!: () => void;
	const waiting = new Promise<void>((resolve) => {
		release = resolve;
	});
	let started!: () => void;
	const observed = new Promise<void>((resolve) => {
		started = resolve;
	});
	let received: unknown;
	const captured: { authentication: string | null } = { authentication: null };
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		async fetch(request) {
			received = await request.json();
			captured.authentication = request.headers.get("x-self-host-queue");
			started();
			await waiting;
			return Response.json(
				{ messageId: "owned-persisted-id" },
				{ status: 202 },
			);
		},
	});
	cleanups.push(() => {
		release();
		server.stop(true);
	});
	configure(server.url.toString());
	const job = {
		url: "https://api.example.test/api/jobs/run",
		body: { id: "owned" },
		delay: "7d",
		retries: 2,
		notBefore: 123,
		deduplicationId: "once",
		failureCallback: "https://api.example.test/api/jobs/failed",
	};
	let acknowledged = false;
	const publishing = module
		.makeDirectQueue()
		.publishJSON(job)
		.then((result) => {
			acknowledged = true;
			return result;
		});
	await observed;
	expect(acknowledged).toBe(false);
	release();
	expect(await publishing).toEqual({ messageId: "owned-persisted-id" });
	expect(received).toEqual(job);
	expect(captured.authentication).toBe(secret);
});

test("native publisher refuses error, malformed or empty acknowledgements without exposing service content", async () => {
	const module = await implementation();
	let response = Response.json(
		{ error: "private-service-body" },
		{ status: 503 },
	);
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch: () => response.clone(),
	});
	cleanups.push(() => server.stop(true));
	configure(server.url.toString());
	for (const next of [
		response,
		Response.json({ messageId: "" }, { status: 202 }),
		Response.json({ messageId: "accepted-without-contract" }),
		new Response("private-service-body", { status: 202 }),
	]) {
		response = next;
		const error = await module
			.makeDirectQueue()
			.publishJSON({ url: "https://api.example.test/api/jobs/run" })
			.catch((error: Error) => error);
		expect(error).toBeInstanceOf(Error);
		expect(String(error)).not.toContain("private-service-body");
	}
});

test("native publisher rejects redirects before any redirected request receives credentials", async () => {
	const module = await implementation();
	let redirected = 0;
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch(request) {
			if (new URL(request.url).pathname !== "/jobs") {
				redirected++;
				return Response.json({ messageId: "wrong" }, { status: 202 });
			}
			return Response.redirect(new URL("/elsewhere", request.url));
		},
	});
	cleanups.push(() => server.stop(true));
	configure(server.url.toString());
	await expect(
		module
			.makeDirectQueue()
			.publishJSON({ url: "https://api.example.test/api/jobs/run" }),
	).rejects.toThrow("Self-host queue");
	expect(redirected).toBe(0);
});

test("native batch prevalidates unsupported options and non-JSON payloads before publication", async () => {
	const module = await implementation();
	let requests = 0;
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch() {
			requests++;
			return Response.json({ messageId: "stored" }, { status: 202 });
		},
	});
	cleanups.push(() => server.stop(true));
	configure(server.url.toString());
	const valid = {
		url: "https://api.example.test/api/jobs/run",
		body: { id: "a" },
	};
	const unsupported = { ...valid, method: "DELETE" };
	await expect(
		module.makeDirectQueue().batchJSON([valid, unsupported]),
	).rejects.toThrow();
	await expect(
		module
			.makeDirectQueue()
			.publishJSON({ ...valid, body: { lost: undefined } }),
	).rejects.toThrow();
	expect(requests).toBe(0);
});

test("native publisher times out an owned stalled acknowledgement", async () => {
	const module = await implementation();
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch: () => new Promise<Response>(() => {}),
	});
	cleanups.push(() => server.stop(true));
	configure(server.url.toString());
	await expect(
		module
			.makeDirectQueue({ publicationTimeoutMs: 1 })
			.publishJSON({ url: "https://api.example.test/api/jobs/run" }),
	).rejects.toThrow("Self-host queue");
});

test("native publisher bounds a success-shaped service acknowledgement before accepting it", async () => {
	const module = await implementation();
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch: () =>
			Response.json(
				{ messageId: "stored", privateBody: "x".repeat(65_536) },
				{ status: 202 },
			),
	});
	cleanups.push(() => server.stop(true));
	configure(server.url.toString());
	await expect(
		module
			.makeDirectQueue()
			.publishJSON({ url: "https://api.example.test/api/jobs/run" }),
	).rejects.toThrow("Self-host queue");
});

test("native publisher rejects balanced sparse payloads rather than losing enumerable metadata", async () => {
	const module = await implementation();
	let requests = 0;
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch() {
			requests++;
			return Response.json({ messageId: "stored" }, { status: 202 });
		},
	});
	cleanups.push(() => server.stop(true));
	configure(server.url.href);
	const body: unknown[] = [];
	body.length = 1;
	Object.defineProperty(body, "metadata", {
		value: "must persist",
		enumerable: true,
	});
	await expect(
		module
			.makeDirectQueue()
			.publishJSON({ url: "https://api.example.test/api/run", body }),
	).rejects.toThrow();
	expect(requests).toBe(0);
});

test("native publisher rejects sparse batch entries rather than acknowledging undefined jobs", async () => {
	const module = await implementation();
	let requests = 0;
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch() {
			requests++;
			return Response.json({ messageId: "stored" }, { status: 202 });
		},
	});
	cleanups.push(() => server.stop(true));
	configure(server.url.href);
	const batch: Parameters<
		ReturnType<typeof module.makeDirectQueue>["batchJSON"]
	>[0] = [];
	batch.length = 1;
	await expect(module.makeDirectQueue().batchJSON(batch)).rejects.toThrow();
	expect(requests).toBe(0);
});

test.each([
	{ url: "not a URL" },
	{ headers: { "x-owned": "\u0100" } },
])("native publisher preflights invalid later destinations and HTTP header values before the first request: %j", async (invalid) => {
	const module = await implementation();
	let requests = 0;
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch() {
			requests++;
			return Response.json({ messageId: "stored" }, { status: 202 });
		},
	});
	cleanups.push(() => server.stop(true));
	configure(server.url.href);
	const valid = { url: "https://api.example.test/api/run" };
	await expect(
		module.makeDirectQueue().batchJSON([valid, { ...valid, ...invalid }]),
	).rejects.toThrow();
	expect(requests).toBe(0);
});

test("queue factory preserves the supplied cloud client and never constructs it for native publication", async () => {
	const module = await implementation();
	configure();
	let constructions = 0;
	const cloudClient = {
		publishJSON: async (_opts: unknown) => ({ messageId: "cloud" }),
		batchJSON: async (_items: unknown) => [],
		cloudOnly: true,
	};
	const cloudFactory = () => {
		constructions++;
		return cloudClient;
	};
	process.env.SELF_HOST_QUEUE = "0";
	expect(module.createJobQueue(cloudFactory)).toBe(cloudClient);
	expect(constructions).toBe(1);
	process.env.SELF_HOST_QUEUE = "1";
	const requests: { url: string; body: unknown; headers: Headers }[] = [];
	const originalFetch = globalThis.fetch;
	const fetchMock = spyOn(globalThis, "fetch").mockImplementation(
		Object.assign(
			async (
				input: Parameters<typeof fetch>[0],
				init?: Parameters<typeof fetch>[1],
			) => {
				requests.push({
					url: String(input),
					body: JSON.parse(String(init?.body)),
					headers: new Headers(init?.headers),
				});
				return Response.json({ messageId: "native-stored" }, { status: 202 });
			},
			originalFetch,
		),
	);
	cleanups.push(() => fetchMock.mockRestore());
	const queue = module.createJobQueue(cloudFactory);
	const job = {
		url: "https://api.example.test/api/automations/dispatch/owned",
		body: { id: "owned" },
		delay: "7d",
		notBefore: 123,
		retries: 2,
		deduplicationId: "owned-once",
		failureCallback: "https://api.example.test/api/automations/run-failed",
	};
	expect(await queue.publishJSON(job)).toEqual({ messageId: "native-stored" });
	expect(constructions).toBe(1);
	expect(requests).toHaveLength(1);
	expect(requests[0]?.url).toBe("http://127.0.0.1:8789/jobs");
	expect(requests[0]?.body).toEqual(job);
	expect(requests[0]?.headers.get("x-self-host-queue")).toBe(secret);
});

test("native logical batch snapshots every payload and bounds publication until earlier groups acknowledge", async () => {
	const module = await implementation();
	configure();
	const items = Array.from({ length: 1001 }, (_, index) => ({
		url: "https://api.example.test/api/run",
		body: { index },
	}));
	const requests: unknown[] = [];
	let release!: () => void;
	const waiting = new Promise<void>((resolve) => {
		release = resolve;
	});
	const originalFetch = globalThis.fetch;
	const network = spyOn(globalThis, "fetch").mockImplementation(
		Object.assign(
			async (
				_input: Parameters<typeof fetch>[0],
				init?: Parameters<typeof fetch>[1],
			) => {
				requests.push(JSON.parse(String(init?.body)));
				if (requests.length <= 1000) await waiting;
				return Response.json({ messageId: "stored" }, { status: 202 });
			},
			originalFetch,
		),
	);
	cleanups.push(() => network.mockRestore());
	const publication = module.makeDirectQueue().batchJSON(items);
	const settled = publication.then(
		(value) => ({ value }),
		(error: unknown) => ({ error }),
	);
	try {
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(requests).toHaveLength(1000);
		const last = items.at(-1);
		if (!last) throw Error("missing final payload");
		last.body.index = 9999;
		release();
		expect(await publication).toHaveLength(1001);
		expect(requests.at(-1)).toEqual({
			url: "https://api.example.test/api/run",
			body: { index: 1000 },
		});
	} finally {
		release();
		await settled;
	}
});

test("native logical batch waits for started publications to settle after failure and stops later groups", async () => {
	const module = await implementation();
	configure();
	let requests = 0,
		finished = false;
	let release!: () => void;
	const waiting = new Promise<void>((resolve) => {
		release = resolve;
	});
	const originalFetch = globalThis.fetch;
	const network = spyOn(globalThis, "fetch").mockImplementation(
		Object.assign(async () => {
			requests++;
			if (requests === 1) return new Response(null, { status: 503 });
			await waiting;
			return Response.json({ messageId: "stored" }, { status: 202 });
		}, originalFetch),
	);
	cleanups.push(() => network.mockRestore());
	const publication = module.makeDirectQueue().batchJSON(
		Array.from({ length: 1001 }, () => ({
			url: "https://api.example.test/api/run",
		})),
	);
	const settled = publication.then(
		() => {
			finished = true;
		},
		() => {
			finished = true;
		},
	);
	try {
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(requests).toBe(1000);
		expect(finished).toBe(false);
		release();
		await expect(publication).rejects.toThrow(
			"persistence acknowledgement failed",
		);
		expect(requests).toBe(1000);
	} finally {
		release();
		await settled;
	}
});
