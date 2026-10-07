import { describe, expect, test } from "bun:test";

import { matchesQueueSecret } from "../../packages/shared/src/self-host-queue";

const loaded = await import("./scheduler").catch(() => null);
const secret = "scheduler-fixture-secret-0000000000000000";
const evaluate = "/api/automations/evaluate";
const maintenance = "/api/ingest/jobs/maintain-partitions";
const flush = async () => {
	for (let i = 0; i < 12; i++) await Promise.resolve();
};

function fixture(options: Record<string, unknown> = {}) {
	expect(loaded?.NativeScheduler).toBeFunction();
	if (!loaded) throw new Error("Native scheduler missing");
	let now = Date.parse("2026-12-31T23:59:30Z");
	let elapsed = 0;
	const requests: Array<{ url: string; init: RequestInit }> = [];
	const scheduler = new loaded.NativeScheduler({
		apiOrigin: "http://127.0.0.1:3000",
		secret,
		analyticsEnabled: false,
		now: () => now,
		monotonicNow: () => elapsed,
		fetcher: async (url: string, init: RequestInit) => {
			requests.push({ url, init });
			return new Response(null, { status: 204 });
		},
		...options,
	});
	return {
		scheduler,
		requests,
		advance(ms: number) {
			now += ms;
			elapsed += ms;
		},
		wall(ms: number) {
			now += ms;
		},
	};
}

describe("native scheduler", () => {
	test("startup sends authenticated empty POSTs to every retained enabled periodic route", async () => {
		const f = fixture();
		for (let i = 0; i < 6; i++) {
			f.scheduler.tick();
			await flush();
		}
		expect(f.requests.map((r) => new URL(r.url).pathname).sort()).toEqual([
			"/api/account/jobs/purge-expired-deletions",
			"/api/automations/evaluate",
			"/api/files/jobs/sweep",
			"/api/ingest/jobs/enforce-retention",
			"/api/ingest/jobs/maintain-partitions",
			"/api/integrations/google/jobs/renew-watches",
			"/api/integrations/jobs/suspend",
			"/api/integrations/linear/jobs/refresh-tokens",
			"/api/integrations/linear/jobs/sweep-abandoned",
			"/api/integrations/microsoft-teams/jobs/renew-subscriptions",
		]);
		expect(new URL(f.requests[0]?.url ?? "").pathname).toBe(maintenance);
		for (const { init } of f.requests) {
			expect(init.method).toBe("POST");
			expect(init.body).toBe("{}");
			expect(new Headers(init.headers).get("x-self-host-queue")).toBe(secret);
			expect(new Headers(init.headers).get("content-type")).toBe(
				"application/json",
			);
			expect(init.redirect).toBe("error");
		}
		f.scheduler.tick();
		await flush();
		expect(f.requests).toHaveLength(10);
		await f.scheduler.stop();
	});

	test("Stripe-enabled startup also refreshes analytics", async () => {
		const f = fixture({
			analyticsEnabled: true,
			jobs: ["/api/analytics/jobs/refresh-mrr"],
		});
		f.scheduler.tick();
		await flush();
		expect(f.requests.map((r) => new URL(r.url).pathname)).toEqual([
			"/api/analytics/jobs/refresh-mrr",
		]);
		await f.scheduler.stop();
	});

	test("exact UTC boundaries include year, month, leap day, hourly and minute rollover", () => {
		expect(loaded?.nextScheduledAt).toBeFunction();
		if (!loaded) return;
		const cases: Array<[string, string, string]> = [
			[evaluate, "2026-12-31T23:59:59.999Z", "2027-01-01T00:00:00Z"],
			[evaluate, "2027-01-01T00:00:00Z", "2027-01-01T00:01:00Z"],
			[
				"/api/ingest/jobs/enforce-retention",
				"2026-10-04T12:04:59Z",
				"2026-10-04T12:05:00Z",
			],
			[
				"/api/integrations/linear/jobs/refresh-tokens",
				"2026-10-04T12:15:00Z",
				"2026-10-04T12:30:00Z",
			],
			[
				"/api/integrations/linear/jobs/refresh-tokens",
				"2026-10-04T12:59:00Z",
				"2026-10-04T13:00:00Z",
			],
			[
				"/api/integrations/linear/jobs/sweep-abandoned",
				"2026-10-04T12:55:00Z",
				"2026-10-04T13:00:00Z",
			],
			[maintenance, "2028-02-28T02:10:00Z", "2028-02-29T02:10:00Z"],
			[maintenance, "2028-02-29T02:10:00Z", "2028-03-01T02:10:00Z"],
			["/api/files/jobs/sweep", "2026-10-31T02:19:59Z", "2026-10-31T02:20:00Z"],
			[
				"/api/account/jobs/purge-expired-deletions",
				"2026-12-31T02:30:00Z",
				"2027-01-01T02:30:00Z",
			],
			[
				"/api/integrations/google/jobs/renew-watches",
				"2026-10-04T02:39:59Z",
				"2026-10-04T02:40:00Z",
			],
			[
				"/api/integrations/microsoft-teams/jobs/renew-subscriptions",
				"2026-10-04T12:15:00Z",
				"2026-10-04T13:15:00Z",
			],
			[
				"/api/integrations/jobs/suspend",
				"2026-10-04T12:24:59Z",
				"2026-10-04T12:25:00Z",
			],
			[
				"/api/analytics/jobs/refresh-mrr",
				"2026-10-04T23:35:00Z",
				"2026-10-05T00:35:00Z",
			],
		];
		for (const [path, from, want] of cases) {
			expect(
				new Date(loaded.nextScheduledAt(path, Date.parse(from))).toISOString(),
			).toBe(new Date(want).toISOString());
		}
	});

	test("missed weeks coalesce into one catch-up and resume the next regular minute", async () => {
		const f = fixture({ jobs: [evaluate] });
		f.scheduler.tick();
		await flush();
		f.advance(21 * 86_400_000);
		f.scheduler.tick();
		await flush();
		f.scheduler.tick();
		await flush();
		expect(f.requests).toHaveLength(2);
		f.advance(30_000);
		f.scheduler.tick();
		await flush();
		expect(f.requests).toHaveLength(3);
		await f.scheduler.stop();
	});

	test("four global slots and one per route bound an unresolved startup wave", async () => {
		const pending: Array<() => void> = [];
		const paths: string[] = [];
		const f = fixture({
			fetcher: async (url: string) => {
				paths.push(new URL(url).pathname);
				return new Promise<Response>((resolve) =>
					pending.push(() => resolve(new Response(null, { status: 204 }))),
				);
			},
		});
		f.scheduler.tick();
		f.advance(7 * 86_400_000);
		for (let i = 0; i < 20; i++) f.scheduler.tick();
		expect(paths).toHaveLength(4);
		expect(new Set(paths).size).toBe(4);
		for (const resolve of pending.splice(0)) resolve();
		await flush();
		f.scheduler.tick();
		expect(paths).toHaveLength(8);
		expect(paths.filter((path) => path === evaluate)).toHaveLength(2);
		for (const resolve of pending.splice(0)) resolve();
		await flush();
		await f.scheduler.stop();
	});

	test("HTTP and transport failures retry three times with monotonic backoff, then wait for cadence", async () => {
		let calls = 0;
		const f = fixture({
			jobs: [evaluate],
			fetcher: async () => {
				calls++;
				if (calls === 2) throw new Error(`credential ${secret}`);
				return new Response("private provider error", { status: 503 });
			},
		});
		f.scheduler.tick();
		await flush();
		f.advance(4_999);
		f.scheduler.tick();
		expect(calls).toBe(1);
		f.wall(-86_400_000);
		f.advance(1);
		f.scheduler.tick();
		await flush();
		expect(calls).toBe(2);
		f.advance(9_999);
		f.scheduler.tick();
		expect(calls).toBe(2);
		f.advance(1);
		f.scheduler.tick();
		await flush();
		expect(calls).toBe(3);
		f.advance(20_000);
		f.scheduler.tick();
		expect(calls).toBe(3);
		f.wall(86_400_000);
		f.scheduler.tick();
		await flush();
		expect(calls).toBe(4);
		await f.scheduler.stop();
	});

	test("success resets retries and releases response streams", async () => {
		let calls = 0;
		let cancelled = 0;
		const f = fixture({
			jobs: [evaluate],
			fetcher: async () => {
				calls++;
				return new Response(
					new ReadableStream({
						cancel() {
							cancelled++;
						},
					}),
					{ status: calls === 1 ? 500 : 200 },
				);
			},
		});
		f.scheduler.tick();
		await flush();
		f.advance(5_000);
		f.scheduler.tick();
		await flush();
		expect(calls).toBe(2);
		expect(cancelled).toBe(2);
		f.advance(25_000);
		f.scheduler.tick();
		await flush();
		expect(calls).toBe(3);
		await f.scheduler.stop();
	});

	test("stop aborts in-flight requests and prevents retries or later ticks", async () => {
		let signal: AbortSignal | undefined;
		let calls = 0;
		const f = fixture({
			jobs: [evaluate],
			fetcher: async (_url: string, init: RequestInit) => {
				calls++;
				signal = init.signal as AbortSignal;
				return new Promise<Response>((_resolve, reject) =>
					signal?.addEventListener(
						"abort",
						() => reject(new Error("aborted")),
						{ once: true },
					),
				);
			},
		});
		f.scheduler.tick();
		expect(signal?.aborted).toBe(false);
		await f.scheduler.stop();
		expect(signal?.aborted).toBe(true);
		f.advance(60_000);
		f.scheduler.tick();
		await flush();
		expect(calls).toBe(1);
	});

	test("restart catches up daily maintenance without replaying days", async () => {
		for (let restart = 0; restart < 2; restart++) {
			const f = fixture({ jobs: [maintenance] });
			f.scheduler.tick();
			await flush();
			f.scheduler.tick();
			await flush();
			expect(f.requests).toHaveLength(1);
			await f.scheduler.stop();
		}
	});

	test("cloud mode is inactive and native config reuses only existing runtime variables", () => {
		expect(loaded?.schedulerOptionsFromEnvironment).toBeFunction();
		if (!loaded) return;
		expect(loaded.schedulerOptionsFromEnvironment({})).toBeNull();
		expect(
			loaded.schedulerOptionsFromEnvironment({
				SELF_HOST_QUEUE: "0",
				SELF_HOST_QUEUE_SECRET: secret,
			}),
		).toBeNull();
		expect(
			loaded.schedulerOptionsFromEnvironment({
				SELF_HOST_QUEUE: "1",
				SELF_HOST_QUEUE_SECRET: secret,
				NEXT_PUBLIC_API_URL: "https://superset.test",
				QUEUE_API_URL: "http://api:3000",
			}),
		).toEqual({
			apiOrigin: "http://api:3000",
			secret,
			analyticsEnabled: false,
		});
		expect(
			loaded.schedulerOptionsFromEnvironment({
				SELF_HOST_QUEUE: "1",
				SELF_HOST_QUEUE_SECRET: secret,
				NEXT_PUBLIC_API_URL: "https://superset.test",
				STRIPE_SECRET_KEY: "fixture",
			})?.analyticsEnabled,
		).toBe(true);
	});

	test("unsafe origins, secrets, unsupported routes and invalid resource bounds fail before network", () => {
		for (const options of [
			{ apiOrigin: "ftp://api.test" },
			{ apiOrigin: "https://user:pass@api.test" },
			{ apiOrigin: "https://api.test/prefix" },
			{ apiOrigin: "https://api.test?token=secret" },
			{ apiOrigin: "https://api.test#fragment" },
			{ secret: "short" },
			{ secret: `${secret}\n` },
			{ secret: ` ${secret}` },
			{ secret: `${secret} ` },
			{ jobs: ["/api/cloud-workspaces/reap"] },
			{ jobs: [evaluate, evaluate] },
			{ maxConcurrent: 5 },
			{ maxConcurrent: 0 },
			{ timeoutMs: 900_001 },
			{ timeoutMs: Number.NaN },
			{ pollMs: 0 },
			{ retryDelayMs: -1 },
		])
			expect(() => fixture(options)).toThrow();
	});
});

async function waitUntil(predicate: () => boolean, timeoutMs = 3_000) {
	const deadline = performance.now() + timeoutMs;
	while (!predicate()) {
		if (performance.now() >= deadline)
			throw new Error("Scheduler fixture timed out");
		await Bun.sleep(5);
	}
}

describe("native scheduler timer and HTTP proof", () => {
	test("real requests authenticate, retry HTTP failure and stop cleanly", async () => {
		expect(loaded?.NativeScheduler).toBeFunction();
		if (!loaded) return;
		let requests = 0;
		let badRequest = false;
		const server = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			async fetch(request) {
				const body = await request.text();
				if (
					!matchesQueueSecret(
						secret,
						request.headers.get("x-self-host-queue"),
					) ||
					request.method !== "POST" ||
					body !== "{}" ||
					new URL(request.url).pathname !== evaluate
				)
					badRequest = true;
				requests++;
				return new Response("fixture", { status: requests === 1 ? 503 : 200 });
			},
		});
		const scheduler = new loaded.NativeScheduler({
			apiOrigin: server.url.origin,
			secret,
			analyticsEnabled: false,
			jobs: [evaluate],
			pollMs: 5,
			retryDelayMs: 10,
			timeoutMs: 1_000,
		});
		try {
			scheduler.start();
			scheduler.start();
			await waitUntil(() => requests === 2);
			expect(badRequest).toBe(false);
			await scheduler.stop();
			const count = requests;
			await Bun.sleep(30);
			expect(requests).toBe(count);
		} finally {
			await scheduler.stop();
			await server.stop(true);
		}
	});

	test("real request timeout frees its slot, retries only three times and stop cancels a pending request", async () => {
		if (!loaded) throw new Error("Native scheduler missing");
		let requests = 0;
		const server = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			async fetch() {
				requests++;
				await Bun.sleep(150);
				return new Response(null, { status: 204 });
			},
		});
		const scheduler = new loaded.NativeScheduler({
			apiOrigin: server.url.origin,
			secret,
			analyticsEnabled: false,
			jobs: [maintenance],
			pollMs: 5,
			retryDelayMs: 10,
			timeoutMs: 20,
		});
		try {
			scheduler.start();
			await waitUntil(() => requests === 3);
			await Bun.sleep(90);
			expect(requests).toBe(3);
			await scheduler.stop();
			const pending = new loaded.NativeScheduler({
				apiOrigin: server.url.origin,
				secret,
				analyticsEnabled: false,
				jobs: [maintenance],
				pollMs: 5,
				timeoutMs: 1_000,
			});
			try {
				pending.start();
				await waitUntil(() => requests === 4);
				const started = performance.now();
				await pending.stop();
				expect(performance.now() - started).toBeLessThan(100);
			} finally {
				await pending.stop();
			}
		} finally {
			await scheduler.stop();
			await server.stop(true);
		}
	});

	test("redirecting HTTP endpoint cannot forward the scheduler secret", async () => {
		if (!loaded) throw new Error("Native scheduler missing");
		let redirected = 0;
		let attempts = 0;
		const sink = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			fetch() {
				redirected++;
				return new Response(null, { status: 204 });
			},
		});
		const origin = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			fetch() {
				attempts++;
				return Response.redirect(`${sink.url.origin}/sink`, 307);
			},
		});
		const scheduler = new loaded.NativeScheduler({
			apiOrigin: origin.url.origin,
			secret,
			analyticsEnabled: false,
			jobs: [maintenance],
			pollMs: 5,
			retryDelayMs: 10,
			timeoutMs: 1_000,
		});
		try {
			scheduler.start();
			await waitUntil(() => attempts === 3);
			await Bun.sleep(30);
			expect(attempts).toBe(3);
			expect(redirected).toBe(0);
		} finally {
			await scheduler.stop();
			await origin.stop(true);
			await sink.stop(true);
		}
	});

	test("real timer coalesces a stalled clock and waits for the next UTC minute", async () => {
		if (!loaded) throw new Error("Native scheduler missing");
		let requests = 0;
		let now = Date.parse("2026-10-04T12:00:30Z");
		const server = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			fetch() {
				requests++;
				return new Response(null, { status: 204 });
			},
		});
		const scheduler = new loaded.NativeScheduler({
			apiOrigin: server.url.origin,
			secret,
			analyticsEnabled: false,
			jobs: [evaluate],
			now: () => now,
			pollMs: 5,
		});
		try {
			scheduler.start();
			await waitUntil(() => requests === 1);
			now = Date.parse("2026-10-25T12:00:30Z");
			await waitUntil(() => requests === 2);
			await Bun.sleep(25);
			expect(requests).toBe(2);
			now = Date.parse("2026-10-25T12:01:00Z");
			await waitUntil(() => requests === 3);
		} finally {
			await scheduler.stop();
			await server.stop(true);
		}
	});

	test("cleared-env entrypoint is inactive in cloud and native SIGTERM restart catches up once", async () => {
		const executable = new URL("./scheduler.ts", import.meta.url).pathname;
		const baseEnvironment = { PATH: process.env.PATH ?? "" };
		const cloud = Bun.spawn([process.execPath, "--no-env-file", executable], {
			env: baseEnvironment,
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(await cloud.exited).toBe(0);
		expect(await new Response(cloud.stdout).text()).toBe("");
		expect(await new Response(cloud.stderr).text()).toBe("");
		const paths: string[] = [];
		let valid = true;
		const server = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			async fetch(request) {
				if (
					!matchesQueueSecret(
						secret,
						request.headers.get("x-self-host-queue"),
					) ||
					request.method !== "POST" ||
					(await request.text()) !== "{}"
				)
					valid = false;
				paths.push(new URL(request.url).pathname);
				return new Response(null, { status: 204 });
			},
		});
		try {
			for (let restart = 0; restart < 2; restart++) {
				const start = paths.length;
				const child = Bun.spawn(
					[process.execPath, "--no-env-file", executable],
					{
						env: {
							...baseEnvironment,
							SELF_HOST_QUEUE: "1",
							SELF_HOST_QUEUE_SECRET: secret,
							NEXT_PUBLIC_API_URL: "https://public.invalid",
							QUEUE_API_URL: server.url.origin,
						},
						stdout: "pipe",
						stderr: "pipe",
					},
				);
				try {
					await waitUntil(
						() => paths.slice(start).includes("/api/integrations/jobs/suspend"),
						5_000,
					);
					child.kill("SIGTERM");
					expect(await child.exited).toBe(0);
					const received = paths.slice(start);
					expect(received.filter((path) => path === maintenance)).toHaveLength(
						1,
					);
					expect(new Set(received).size).toBe(10);
					expect(received).not.toContain("/api/analytics/jobs/refresh-mrr");
					expect(await new Response(child.stdout).text()).not.toContain(secret);
					expect(await new Response(child.stderr).text()).not.toContain(secret);
				} finally {
					if (child.exitCode === null) child.kill("SIGKILL");
					await child.exited;
				}
			}
			expect(valid).toBe(true);
		} finally {
			await server.stop(true);
		}
	}, 15_000);
});

test("real HTTP startup cannot exceed four active requests or overlap a route", async () => {
	if (!loaded) throw new Error("Native scheduler missing");
	let active = 0;
	let maximum = 0;
	let overlap = false;
	const running = new Set<string>();
	const paths: string[] = [];
	const releases: Array<() => void> = [];
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		async fetch(request) {
			const path = new URL(request.url).pathname;
			if (running.has(path)) overlap = true;
			running.add(path);
			paths.push(path);
			active++;
			maximum = Math.max(maximum, active);
			await new Promise<void>((resolve) => releases.push(resolve));
			active--;
			running.delete(path);
			return new Response(null, { status: 204 });
		},
	});
	const scheduler = new loaded.NativeScheduler({
		apiOrigin: server.url.origin,
		secret,
		analyticsEnabled: false,
		now: () => Date.parse("2026-10-04T12:00:30Z"),
		pollMs: 5,
		timeoutMs: 2_000,
	});
	try {
		scheduler.start();
		await waitUntil(() => active === 4);
		await Bun.sleep(25);
		expect(paths).toHaveLength(4);
		for (const resolve of releases.splice(0)) resolve();
		await waitUntil(() => paths.length === 8);
		for (const resolve of releases.splice(0)) resolve();
		await waitUntil(() => paths.length === 10);
		for (const resolve of releases.splice(0)) resolve();
		expect(maximum).toBe(4);
		expect(overlap).toBe(false);
		expect(new Set(paths).size).toBe(10);
	} finally {
		for (const resolve of releases.splice(0)) resolve();
		await scheduler.stop();
		await server.stop(true);
	}
});

test("malformed origins return a generic configuration error without URL credentials", () => {
	expect(() => fixture({ apiOrigin: `http://${secret}@` })).toThrow(
		"Invalid scheduler API origin",
	);
});
