import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const secret = "owned-durable-queue-secret-0123456789";
const cleanups: (() => void)[] = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});
async function fixture(busyTimeoutMs?: number) {
	const module = await import("./queue").catch(() => undefined);
	expect(module?.DurableQueue).toBeDefined();
	if (!module) throw Error("Missing durable queue foundation");
	const directory = mkdtempSync(join(tmpdir(), "superset-owned-queue-"));
	cleanups.push(() => rmSync(directory, { force: true, recursive: true }));
	const requests: { path: string; body: unknown; headers: Headers }[] = [];
	let clock = 1_000_000;
	let status = 200;
	let redirect = false;
	let block: Promise<void> | undefined;
	const api = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		async fetch(request) {
			const path = new URL(request.url).pathname;
			requests.push({
				path,
				body: await request.json(),
				headers: request.headers,
			});
			if (block) await block;
			if (redirect)
				return Response.redirect(new URL("/redirected", request.url).href);
			return new Response("private-destination-content", {
				status: path === "/api/failed" ? 200 : status,
			});
		},
	});
	cleanups.push(() => api.stop(true));
	const database = join(directory, "queue.sqlite");
	const options = {
		busyTimeoutMs,
		database,
		apiOrigin: "https://api.example.test:8443",
		deliveryOrigin: api.url.toString(),
		secret,
		now: () => clock,
	};
	const queues: InstanceType<typeof module.DurableQueue>[] = [];
	cleanups.push(() => {
		for (const queue of queues) queue.close();
	});
	const open = () => {
		const queue = new module.DurableQueue(options);
		queues.push(queue);
		return queue;
	};
	return {
		queue: open(),
		open,
		requests,
		options,
		database,
		advance: (ms: number) => {
			clock += ms;
		},
		setStatus: (value: number) => {
			status = value;
		},
		setRedirect: () => {
			redirect = true;
		},
		setBlock: (value?: Promise<void>) => {
			block = value;
		},
	};
}
const job = {
	url: "https://api.example.test:8443/api/jobs/run?owned=1",
	body: { id: "owned" },
};

test("draining workers refill a free slot while another delivery remains blocked", async () => {
	const state = await fixture();
	let release: () => void = () => {};
	const blocked = new Promise<void>((resolve) => {
		release = resolve;
	});
	let started = 0;
	let active = 0;
	let maximum = 0;
	const deliver = async () => {
		const index = ++started;
		maximum = Math.max(maximum, ++active);
		if (index === 1) await blocked;
		active--;
		return new Response(null, { status: 200 });
	};
	cleanups.push(release);
	const queue = new (await import("./queue")).DurableQueue({
		...state.options,
		fetch: deliver,
	});
	cleanups.push(() => queue.close());
	for (let index = 0; index < 5; index++)
		queue.publish({ ...job, body: { index } });
	const drain = queue.runDue();
	try {
		for (let turn = 0; turn < 30 && started < 5; turn++)
			await new Promise<void>((resolve) => setImmediate(resolve));
		expect(started).toBe(5);
		expect(maximum).toBeLessThanOrEqual(4);
	} finally {
		release();
		await drain;
	}
	expect(queue.stats()).toEqual({ pending: 0, running: 0, done: 5, failed: 0 });
});

function childCode(
	options: {
		database: string;
		apiOrigin: string;
		deliveryOrigin: string;
		secret: string;
	},
	action: string,
	beforeOpen = "",
) {
	return `import { DurableQueue } from ${JSON.stringify(new URL("./queue.ts", import.meta.url).href)}; ${beforeOpen}; const queue = new DurableQueue(${JSON.stringify({ ...options, now: undefined })}); ${action}`;
}
function child(code: string) {
	return Bun.spawn([process.execPath, "--no-env-file", "-e", code], {
		env: { PATH: process.env.PATH ?? "" },
		stdout: "pipe",
		stderr: "pipe",
	});
}
async function childResult(
	worker: ReturnType<typeof child>,
	output: ReadableStream<Uint8Array> = worker.stdout,
) {
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(output).text(),
		new Response(worker.stderr).text(),
		worker.exited,
	]);
	return { stdout, stderr, exitCode };
}

test("an HTTP-acknowledged job survives actual worker SIGKILL without graceful SQLite close", async () => {
	const state = await fixture();
	state.queue.close();
	const worker = child(
		childCode(
			state.options,
			`const server = Bun.serve({hostname:"127.0.0.1",port:0,fetch:request=>queue.handle(request)}); console.log(server.url.href);`,
		),
	);
	cleanups.push(() => worker.kill("SIGKILL"));
	const reader = worker.stdout.getReader();
	const startup = await reader.read();
	const endpoint = new TextDecoder().decode(startup.value).trim();
	expect(endpoint.startsWith("http://127.0.0.1:")).toBe(true);
	const ack = await fetch(new URL("/jobs", endpoint), {
		method: "POST",
		headers: { "x-self-host-queue": secret },
		body: JSON.stringify(job),
	});
	expect(ack.status).toBe(202);
	expect(await ack.json()).toHaveProperty("messageId", expect.any(String));
	worker.kill("SIGKILL");
	await worker.exited;
	reader.releaseLock();
	const reopened = state.open();
	state.advance(Date.now());
	await reopened.runDue();
	expect(state.requests).toHaveLength(1);
	expect(reopened.stats().done).toBe(1);
});

test("independent worker processes atomically deduplicate and claim SQLite jobs", async () => {
	const state = await fixture();
	state.queue.close();
	const publishCode = childCode(
		state.options,
		`console.log(queue.publish(${JSON.stringify({ ...job, deduplicationId: "cross-process" })}).messageId);queue.close();`,
	);
	const publishers = [child(publishCode), child(publishCode)];
	for (const worker of publishers) cleanups.push(() => worker.kill("SIGKILL"));
	const results = await Promise.all(
		publishers.map((worker) => childResult(worker)),
	);
	for (const result of results)
		expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
			exitCode: 0,
			stderr: "",
		});
	const ids = results.map((result) => result.stdout.trim());
	expect(ids[0]).toBeTruthy();
	expect(ids[0]).toBe(ids[1]);
	const workers = [
		child(childCode(state.options, "await queue.runDue();queue.close();")),
		child(childCode(state.options, "await queue.runDue();queue.close();")),
	];
	for (const worker of workers) cleanups.push(() => worker.kill("SIGKILL"));
	const claims = await Promise.all(
		workers.map((worker) => childResult(worker)),
	);
	for (const result of claims)
		expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
			exitCode: 0,
			stderr: "",
		});
	expect(state.requests).toHaveLength(1);
	expect(state.open().stats().done).toBe(1);
});

test("worker startup waits for a competing SQLite lock before initializing durable journal settings", async () => {
	const state = await fixture();
	state.queue.close();
	const locker = new Database(state.database, { strict: true });
	cleanups.push(() => locker.close());
	locker.exec("PRAGMA journal_mode=DELETE; BEGIN EXCLUSIVE");
	const worker = child(
		childCode(
			state.options,
			`console.log(queue.publish(${JSON.stringify(job)}).messageId); queue.close();`,
			'console.log("opening")',
		),
	);
	cleanups.push(() => worker.kill("SIGKILL"));
	const [startupStream, outputStream] = worker.stdout.tee();
	const reader = startupStream.getReader();
	let exitBeforeRelease: number | null;
	try {
		const startup = await reader.read();
		expect(new TextDecoder().decode(startup.value).trim()).toBe("opening");
		await new Promise((resolve) => setTimeout(resolve, 100));
		exitBeforeRelease = worker.exitCode;
	} finally {
		void reader.cancel();
		reader.releaseLock();
		locker.exec("ROLLBACK");
	}
	const result = await childResult(worker, outputStream);
	expect({
		exitBeforeRelease,
		exitCode: result.exitCode,
		stderr: result.stderr,
	}).toEqual({
		exitBeforeRelease: null,
		exitCode: 0,
		stderr: "",
	});
	expect(result.stdout.trim().split("\n")[1]).toBeTruthy();
	expect(state.open().stats().pending).toBe(1);
});

test("a worker killed during delivery leaves a recoverable durable claim", async () => {
	const state = await fixture();
	state.queue.close();
	let release!: () => void;
	state.setBlock(
		new Promise<void>((resolve) => {
			release = resolve;
		}),
	);
	cleanups.push(() => release());
	const worker = child(
		childCode(
			state.options,
			`queue.publish(${JSON.stringify(job)});await queue.runDue();`,
		),
	);
	cleanups.push(() => worker.kill("SIGKILL"));
	for (let index = 0; index < 1000 && state.requests.length === 0; index++)
		await Bun.sleep(1);
	expect(state.requests).toHaveLength(1);
	worker.kill("SIGKILL");
	await worker.exited;
	state.setBlock();
	state.advance(Date.now() + 960_001);
	const recovered = state.open();
	await recovered.runDue();
	expect(state.requests).toHaveLength(2);
	expect(recovered.stats()).toMatchObject({ done: 1, running: 0, pending: 0 });
	release();
});

test("existing old-fork SQLite jobs survive adding fenced leases", async () => {
	const state = await fixture();
	state.queue.publish(job);
	state.queue.close();
	const legacy = new Database(state.database);
	legacy.exec("ALTER TABLE jobs DROP COLUMN lease_token");
	legacy.close();
	const reopened = state.open();
	await reopened.runDue();
	expect(state.requests).toHaveLength(1);
	expect(reopened.stats().done).toBe(1);
});

test("concurrent worker startup adopts legacy leases once while preserving acknowledged jobs", async () => {
	const state = await fixture();
	state.queue.publish(job);
	state.queue.close();
	const legacy = new Database(state.database);
	legacy.exec("ALTER TABLE jobs DROP COLUMN lease_token");
	legacy.close();
	const releasePath = join(dirname(state.database), "release-schema-read");
	const pauseSchemaRead = `
		import { Database } from "bun:sqlite";
		import { existsSync } from "node:fs";
		const query = Database.prototype.query;
		Database.prototype.query = function(sql, ...args) {
			const statement = query.call(this, sql, ...args);
			if (sql === "PRAGMA table_info(jobs)") {
				const all = statement.all;
				statement.all = function(...bindings) {
					const columns = all.apply(this, bindings);
					console.log("schema-read");
					const pause = new Int32Array(new SharedArrayBuffer(4));
					while (!existsSync(${JSON.stringify(releasePath)})) Atomics.wait(pause, 0, 0, 10);
					return columns;
				};
			}
			return statement;
		};`;
	const first = child(
		childCode(state.options, "queue.close();", pauseSchemaRead),
	);
	cleanups.push(() => first.kill("SIGKILL"));
	const [ready, output] = first.stdout.tee();
	const reader = ready.getReader();
	let second: ReturnType<typeof child> | undefined;
	try {
		const startup = await reader.read();
		expect(new TextDecoder().decode(startup.value).trim()).toBe("schema-read");
		second = child(childCode(state.options, "queue.close();", pauseSchemaRead));
		cleanups.push(() => second?.kill("SIGKILL"));
		await new Promise((resolve) => setTimeout(resolve, 100));
	} finally {
		writeFileSync(releasePath, "owned fixture release");
		void reader.cancel();
		reader.releaseLock();
	}
	if (!second) throw Error("second worker did not start");
	const results = await Promise.all([
		childResult(first, output),
		childResult(second),
	]);
	for (const result of results)
		expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
			exitCode: 0,
			stderr: "",
		});
	await state.open().runDue();
	expect(state.requests).toHaveLength(1);
	expect(state.open().stats()).toMatchObject({
		done: 1,
		pending: 0,
		running: 0,
	});
});

test("publication rejects payload and header values that JSON would silently discard", async () => {
	const state = await fixture();
	const body = ["owned"];
	Reflect.set(body, Symbol("discarded"), "lost");
	expect(() => state.queue.publish({ ...job, body })).toThrow();
	expect(() => state.queue.publish({ ...job, headers: new Date() })).toThrow();
	expect(state.queue.stats().pending).toBe(0);
});

test("a caller-controlled failure dedupe ID cannot suppress an atomic exhaustion callback across restart", async () => {
	const state = await fixture();
	state.setStatus(503);
	const source = state.queue.publish({
		...job,
		retries: 0,
		failureCallback: "https://api.example.test:8443/api/failed",
	});
	state.queue.publish({
		...job,
		delay: "1h",
		deduplicationId: `failure:${source.messageId}`,
	});
	await state.queue.runDue();
	state.queue.close();
	const reopened = state.open();
	await reopened.runDue();
	await reopened.runDue();
	expect(state.requests.map((request) => request.path)).toEqual([
		"/api/jobs/run",
		"/api/failed",
	]);
	expect(reopened.stats()).toMatchObject({ done: 1, failed: 1, pending: 1 });
});

test("a failed completion holds the drain until every claimed delivery settles and sanitizes the error", async () => {
	const state = await fixture();
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	cleanups.push(() => release());
	let initial!: () => void;
	const firstResponded = new Promise<void>((resolve) => {
		initial = resolve;
	});
	let active = 0,
		maximum = 0,
		received = 0;
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		async fetch(request) {
			active++;
			received++;
			maximum = Math.max(maximum, active);
			try {
				if (new URL(request.url).pathname === "/api/first") {
					for (let index = 0; index < 1000 && received < 4; index++)
						await Bun.sleep(1);
					initial();
				} else await held;
				return new Response("owned");
			} finally {
				active--;
			}
		},
	});
	cleanups.push(() => server.stop(true));
	const module = await import("./queue");
	const queue = new module.DurableQueue({
		...state.options,
		deliveryOrigin: server.url.href,
	});
	cleanups.push(() => queue.close());
	const first = queue.publish({
		...job,
		url: "https://api.example.test:8443/api/first",
	});
	state.advance(1);
	for (let index = 0; index < 7; index++) {
		queue.publish({ ...job, url: "https://api.example.test:8443/api/held" });
		state.advance(1);
	}
	const trigger = new Database(state.database);
	trigger.exec(
		`CREATE TRIGGER owned_completion_failure BEFORE UPDATE ON jobs WHEN NEW.state='done' AND NEW.id='${first.messageId}' BEGIN SELECT RAISE(FAIL,'owned-private-completion-error'); END;`,
	);
	trigger.close();
	let settled = false;
	const drain = queue
		.runDue()
		.catch((error: Error) => error)
		.finally(() => {
			settled = true;
		});
	await firstResponded;
	await Bun.sleep(30);
	const prematurelySettled = settled;
	let next: Promise<void> | undefined;
	if (settled) {
		next = queue.runDue();
		for (let index = 0; index < 1000 && received < 8; index++)
			await Bun.sleep(1);
	}
	release();
	const error = await drain;
	await next;
	expect(prematurelySettled).toBe(false);
	expect(maximum).toBeLessThanOrEqual(4);
	expect(String(error)).toContain("Self-host queue");
	expect(String(error)).not.toContain("owned-private-completion-error");
	expect(queue.stats()).toMatchObject({ running: 1, done: 3 });
});

test("a maximum supported body produces a durable failure callback without rollback", async () => {
	const state = await fixture();
	state.setStatus(503);
	const body = { data: "x".repeat(1_048_576 - 11) };
	state.queue.publish({
		...job,
		body,
		retries: 0,
		failureCallback: "https://api.example.test:8443/api/failed",
	});
	await state.queue.runDue();
	state.queue.close();
	const reopened = state.open();
	await reopened.runDue();
	expect(state.requests).toHaveLength(2);
	expect(reopened.stats()).toMatchObject({ done: 1, failed: 1 });
	expect(state.requests[1]?.body).toHaveProperty(
		"sourceBody",
		Buffer.from(JSON.stringify(body)).toString("base64"),
	);
});

test("durable queue persists an acknowledged job across reopening and rewrites only its exact API origin", async () => {
	const fixtureState = await fixture();
	const acknowledgement = fixtureState.queue.publish(job);
	expect(acknowledgement.messageId).toBeTruthy();
	fixtureState.queue.close();
	const reopened = fixtureState.open();
	await reopened.runDue();
	expect(fixtureState.requests).toHaveLength(1);
	expect(fixtureState.requests[0]?.body).toEqual({ id: "owned" });
	expect(fixtureState.requests[0]?.path).toBe("/api/jobs/run");
	expect(fixtureState.requests[0]?.headers.get("x-self-host-queue")).toBe(
		secret,
	);
	expect(reopened.stats()).toMatchObject({ done: 1, pending: 0, running: 0 });
});

test("durable queue strips forged queue, signature, forwarding and framing headers but preserves application headers", async () => {
	const state = await fixture();
	state.queue.publish({
		...job,
		headers: {
			"x-self-host-queue": "forged",
			"upstash-signature": "forged",
			"upstash-message-id": "forged",
			"upstash-retried": "100",
			host: "foreign.invalid",
			"content-length": "1",
			"transfer-encoding": "chunked",
			"content-encoding": "gzip",
			connection: "x-forged-hop",
			"x-forged-hop": "forged",
			"x-forwarded-host": "foreign.invalid",
			"x-trace": "kept",
		},
	});
	await state.queue.runDue();
	const headers = state.requests[0]?.headers;
	expect(headers?.get("x-self-host-queue")).toBe(secret);
	expect(headers?.get("upstash-message-id")).not.toBe("forged");
	for (const name of [
		"upstash-signature",
		"x-forged-hop",
		"x-forwarded-host",
		"content-encoding",
	])
		expect(headers?.get(name)).toBeNull();
	expect(headers?.get("content-length")).toBe(
		String(Buffer.byteLength('{"id":"owned"}')),
	);
	expect(headers?.get("x-trace")).toBe("kept");
});

test("durable queue rejects unsupported options, non-JSON payloads and foreign or unsafe destinations without persistence", async () => {
	const state = await fixture();
	for (const url of [
		"https://api.example.test/api/jobs/run",
		"https://foreign.invalid/api/jobs/run",
		"https://api.example.test:8443/elsewhere",
		"https://api.example.test:8443/api/../elsewhere",
		"https://api.example.test:8443/api/%2f..%2felsewhere",
		"https://api.example.test:8443/api/jobs/run#fragment",
		"https://credentials@api.example.test:8443/api/jobs/run",
	])
		expect(() => state.queue.publish({ ...job, url })).toThrow();
	for (const extra of [
		{ method: "DELETE" },
		{ retryDelay: "1s" },
		{ delay: "invalid" },
		{ retries: -1 },
		{ notBefore: Infinity },
		{ deduplicationId: "" },
		{ body: { lost: undefined } },
		{ failureCallback: "https://foreign.invalid/api/failed" },
	])
		expect(() => state.queue.publish({ ...job, ...extra })).toThrow();
	expect(state.queue.stats().pending).toBe(0);
});

test("durable queue retains long delays across restart and notBefore takes precedence", async () => {
	const state = await fixture();
	state.queue.publish({ ...job, delay: "7d" });
	state.queue.publish({ ...job, delay: "1h", notBefore: 1005 });
	state.queue.close();
	const queue = state.open();
	await queue.runDue();
	expect(state.requests).toHaveLength(0);
	state.advance(5000);
	await queue.runDue();
	expect(state.requests).toHaveLength(1);
	state.advance(604800_000);
	await queue.runDue();
	expect(state.requests).toHaveLength(2);
});

test("durable queue retries after a delay and atomically persists one exhaustion callback across restart", async () => {
	const state = await fixture();
	state.setStatus(503);
	const published = state.queue.publish({
		...job,
		retries: 1,
		failureCallback: "https://api.example.test:8443/api/failed",
	});
	await state.queue.runDue();
	await state.queue.runDue();
	expect(state.requests).toHaveLength(1);
	state.queue.close();
	const queue = state.open();
	state.advance(5000);
	await queue.runDue();
	expect(state.requests).toHaveLength(3);
	queue.close();
	const final = state.open();
	await final.runDue();
	await final.runDue();
	expect(state.requests).toHaveLength(3);
	expect(state.requests[2]?.body).toMatchObject({
		sourceMessageId: published.messageId,
		sourceBody: "eyJpZCI6Im93bmVkIn0=",
		status: 503,
		retried: 1,
	});
	expect(JSON.stringify(state.requests[2]?.body)).not.toContain(
		"private-destination-content",
	);
	expect(final.stats()).toMatchObject({
		failed: 1,
		done: 1,
		running: 0,
		pending: 0,
	});
});

test("durable queue rejects redirects without leaking its secret to the redirect target", async () => {
	const state = await fixture();
	state.setRedirect();
	state.queue.publish({ ...job, retries: 0 });
	await state.queue.runDue();
	expect(state.requests).toHaveLength(1);
	expect(state.queue.stats().failed).toBe(1);
});

test("two durable workers deduplicate repeated publication and claim each due job once", async () => {
	const state = await fixture();
	const second = state.open();
	const firstId = state.queue.publish({
		...job,
		deduplicationId: "once",
	}).messageId;
	expect(second.publish({ ...job, deduplicationId: "once" }).messageId).toBe(
		firstId,
	);
	await Promise.all([state.queue.runDue(), second.runDue()]);
	expect(state.requests).toHaveLength(1);
	state.advance(600_001);
	second.publish({ ...job, deduplicationId: "once" });
	await Promise.all([state.queue.runDue(), second.runDue()]);
	expect(state.requests).toHaveLength(2);
});

test("durable queue recovers an expired crashed claim and prevents a stale worker from overwriting completion", async () => {
	const state = await fixture();
	const second = state.open();
	let release!: () => void;
	const block = new Promise<void>((resolve) => {
		release = resolve;
	});
	state.setBlock(block);
	state.queue.publish(job);
	const original = state.queue.runDue();
	for (let i = 0; i < 100 && !state.requests.length; i++) await Bun.sleep(1);
	expect(state.requests).toHaveLength(1);
	state.advance(3600_000);
	state.setBlock();
	await second.runDue();
	expect(second.stats().done).toBe(1);
	state.setStatus(503);
	release();
	await original;
	expect(second.stats()).toMatchObject({
		done: 1,
		pending: 0,
		failed: 0,
		running: 0,
	});
});

test("durable queue prunes finished jobs after seven days while retaining delayed pending jobs", async () => {
	const state = await fixture();
	state.queue.publish(job);
	state.queue.publish({ ...job, delay: "30d" });
	await state.queue.runDue();
	expect(state.queue.stats()).toMatchObject({ done: 1, pending: 1 });
	state.advance(7 * 86400_000 + 1);
	await state.queue.runDue();
	expect(state.queue.stats()).toMatchObject({ done: 0, pending: 1 });
});

test("durable HTTP publication authenticates before parsing and acknowledges only a committed SQLite write", async () => {
	const state = await fixture(1);
	const service = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch: (request) => state.queue.handle(request),
	});
	cleanups.push(() => service.stop(true));
	for (const supplied of ["", "wrong"])
		expect(
			(
				await fetch(new URL("/jobs", service.url), {
					method: "POST",
					headers: { "x-self-host-queue": supplied },
					body: "not-json",
				})
			).status,
		).toBe(401);
	expect(state.queue.stats().pending).toBe(0);
	const response = await fetch(new URL("/jobs", service.url), {
		method: "POST",
		headers: { "x-self-host-queue": secret },
		body: JSON.stringify(job),
	});
	expect(response.status).toBe(202);
	expect(await response.json()).toHaveProperty("messageId", expect.any(String));
	const lock = new Database(state.database);
	lock.exec("BEGIN IMMEDIATE");
	try {
		const rejected = await state.queue.handle(
			new Request("http://localhost/jobs", {
				method: "POST",
				headers: { "x-self-host-queue": secret },
				body: JSON.stringify(job),
			}),
		);
		expect(rejected.status).toBe(503);
		expect(await rejected.text()).not.toContain("owned");
	} finally {
		lock.exec("ROLLBACK");
		lock.close();
	}
	state.queue.close();
	expect(state.open().stats().pending).toBe(1);
});
