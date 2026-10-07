import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import IORedis from "ioredis";
import { createKv, type KvClient } from "./kv";

const originalFetch = globalThis.fetch;
const originalFlag = process.env.SELF_HOST_KV;
const originalUrl = process.env.REDIS_URL;

afterEach(() => {
	globalThis.fetch = originalFetch;
});
afterAll(() => {
	if (originalFlag === undefined) delete process.env.SELF_HOST_KV;
	else process.env.SELF_HOST_KV = originalFlag;
	if (originalUrl === undefined) delete process.env.REDIS_URL;
	else process.env.REDIS_URL = originalUrl;
});

test("the KV surface excludes unsupported operations", () => {
	expect<"pipeline" extends keyof KvClient ? true : false>(false).toBe(false);
	expect<"publish" extends keyof KvClient ? true : false>(false).toBe(false);
});

test("unset and zero flags preserve the real Upstash HTTP client and credentials", async () => {
	for (const flag of [undefined, "0"]) {
		if (flag === undefined) delete process.env.SELF_HOST_KV;
		else process.env.SELF_HOST_KV = flag;
		let requests = 0;
		globalThis.fetch = Object.assign(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				requests++;
				expect(String(input)).toStartWith("https://owned-http.invalid");
				expect(new Headers(init?.headers).get("authorization")).toBe(
					"Bearer fake-kv-token",
				);
				const body = JSON.parse(String(init?.body));
				const reply = {
					result: Buffer.from('{"source":"cloud"}').toString("base64"),
				};
				return Response.json(Array.isArray(body[0]) ? [reply] : reply);
			},
			{ preconnect: originalFetch.preconnect },
		);
		const client = createKv({
			url: "https://owned-http.invalid",
			token: "fake-kv-token",
		});
		expect(client).toBeInstanceOf(Redis);
		expect(await client.get<unknown>("cloud-proof")).toEqual({
			source: "cloud",
		});
		expect(requests).toBe(1);
	}
});

const nativeUrl = process.env.KV_TEST_REDIS_URL;
(nativeUrl ? describe : describe.skip)(
	"native KV against disposable loopback Valkey",
	() => {
		let observer: IORedis;
		let client: KvClient;
		const prefix = `kv-proof:${crypto.randomUUID()}`;
		const key = (name: string) => `${prefix}:${name}`;
		beforeAll(() => {
			if (
				!nativeUrl ||
				!["127.0.0.1", "localhost", "[::1]"].includes(
					new URL(nativeUrl).hostname,
				)
			) {
				throw Error("A disposable loopback Valkey URL is required");
			}
			process.env.SELF_HOST_KV = "1";
			process.env.REDIS_URL = nativeUrl;
			observer = new IORedis(nativeUrl, { lazyConnect: true });
			client = createKv({
				url: "https://owned-http.invalid",
				token: "fake-kv-token",
			});
		});
		beforeEach(() => {
			globalThis.fetch = Object.assign(
				async () =>
					Response.json(
						{ error: "unexpected cloud transport" },
						{ status: 400 },
					),
				{ preconnect: originalFetch.preconnect },
			);
		});
		afterAll(async () => {
			if (observer) {
				const keys = await observer.keys(`${prefix}:*`);
				if (keys.length) await observer.del(...keys);
				await observer.quit();
			}
		});

		test("native selection stores JSON and null without calling HTTP", async () => {
			let requests = 0;
			globalThis.fetch = Object.assign(
				async () => {
					requests++;
					return Response.json(
						{ error: "unexpected cloud transport" },
						{ status: 400 },
					);
				},
				{ preconnect: originalFetch.preconnect },
			);
			expect(
				await client.set(key("json"), { n: 1, values: [true, null] }),
			).toBe("OK");
			expect(await observer.get(key("json"))).toBe(
				'{"n":1,"values":[true,null]}',
			);
			expect(await client.get<unknown>(key("json"))).toEqual({
				n: 1,
				values: [true, null],
			});
			expect(await client.set(key("null"), null)).toBe("OK");
			expect(await observer.get(key("null"))).toBe("null");
			expect(await client.get<unknown>(key("null"))).toBeNull();
			expect(await client.get<unknown>(key("missing"))).toBeNull();
			expect(requests).toBe(0);
		});

		test("matches actual Upstash HTTP serialization for values, hashes, and sorted sets", async () => {
			globalThis.fetch = Object.assign(
				async (_input: RequestInfo | URL, init?: RequestInit) => {
					const [command, ...args] = JSON.parse(String(init?.body));
					return Response.json({
						result: await observer.call(command, ...args),
					});
				},
				{ preconnect: originalFetch.preconnect },
			);
			const baseline = new Redis({
				url: "https://owned-http.invalid",
				token: "fake",
				responseEncoding: false,
				enableAutoPipelining: false,
			});
			for (const [index, value] of [
				"hello",
				"5",
				"true",
				"null",
				"9007199254740993",
				7,
				true,
				null,
				{ nested: [1, false] },
			].entries()) {
				await client.set(key(`native:${index}`), value);
				await baseline.set(key(`baseline:${index}`), value);
				expect(await observer.get(key(`native:${index}`))).toEqual(
					await observer.get(key(`baseline:${index}`)),
				);
				expect(await client.get<unknown>(key(`native:${index}`))).toEqual(
					await baseline.get<unknown>(key(`baseline:${index}`)),
				);
			}
			const fields = {
				raw: "plain",
				number: 9,
				null: null,
				object: { ok: true },
			};
			expect(await client.hset(key("hash-native"), fields)).toBe(
				await baseline.hset(key("hash-http"), fields),
			);
			for (const field of [...Object.keys(fields), "missing"]) {
				expect(await client.hget(key("hash-native"), field)).toEqual(
					await baseline.hget(key("hash-http"), field),
				);
				expect(await client.hexists(key("hash-native"), field)).toBe(
					await baseline.hexists(key("hash-http"), field),
				);
			}
			const members = [
				{ score: 1, member: "alpha" },
				{ score: 2, member: { id: 2 } },
				{ score: 3, member: "99" },
			] as const;
			await client.zadd<string | { id: number }>(key("z-native"), ...members);
			await baseline.zadd<string | { id: number }>(key("z-http"), ...members);
			expect(await client.zrange<unknown[]>(key("z-native"), 0, -1)).toEqual(
				await baseline.zrange<unknown[]>(key("z-http"), 0, -1),
			);
			expect(
				await client.zrange<unknown[]>(key("z-native"), "+inf", 0, {
					byScore: true,
					rev: true,
					offset: 0,
					count: 2,
					withScores: true,
				}),
			).toEqual(
				await baseline.zrange<unknown[]>(key("z-http"), "+inf", 0, {
					byScore: true,
					rev: true,
					offset: 0,
					count: 2,
					withScores: true,
				}),
			);
		});

		test("preserves conditional writes, expiry, old-value SET GET, and delete results", async () => {
			const target = key("options");
			expect(await client.set(target, { owner: 1 }, { nx: true, ex: 60 })).toBe(
				"OK",
			);
			expect(await client.set(target, { owner: 2 }, { nx: true })).toBeNull();
			expect(await observer.ttl(target)).toBeGreaterThan(0);
			expect(
				await client.set(
					target,
					{ owner: 3 },
					{ xx: true, keepTtl: true, get: true },
				),
			).toEqual({ owner: 1 });
			expect(await observer.ttl(target)).toBeGreaterThan(0);
			expect(await client.set(key("absent"), "value", { xx: true })).toBeNull();
			for (const opts of [
				{ px: 60000 },
				{ exat: Math.floor(Date.now() / 1000) + 60 },
				{ pxat: Date.now() + 60000 },
			]) {
				await client.set(target, "expires", opts);
				expect(await observer.pttl(target)).toBeGreaterThan(0);
			}
			expect(await client.del(target)).toBe(1);
			expect(await client.del(target)).toBe(0);
		});

		test("concurrent native reads and writes remain individual TCP commands", async () => {
			const values = Array.from({ length: 16 }, (_, index) => ({ index }));
			await Promise.all(
				values.map((value) =>
					client.set(key(`concurrent:${value.index}`), value),
				),
			);
			const reads = await Promise.all(
				values.map((value) =>
					client.get<unknown>(key(`concurrent:${value.index}`)),
				),
			);
			expect(reads).toEqual(values);
		});

		test("NOSCRIPT fallback and concurrent Upstash sliding-window limits are atomic", async () => {
			await expect(
				client.evalsha("0000000000000000000000000000000000000000", [], []),
			).rejects.toThrow("NOSCRIPT");
			expect(
				await client.eval<Array<string | number>>(
					"return {ARGV[1], ARGV[2]}",
					[],
					["json", 42],
				),
			).toEqual(["json", 42]);
			const limiter = new Ratelimit({
				redis: client,
				limiter: Ratelimit.slidingWindow(3, "1 h"),
				prefix: key("ratelimit"),
				ephemeralCache: false,
			});
			await observer.script("FLUSH");
			const results = await Promise.all(
				Array.from({ length: 12 }, () => limiter.limit("same-user")),
			);
			await Promise.all(results.map((result) => result.pending));
			expect(results.filter((result) => result.success)).toHaveLength(3);
			expect(results.every((result) => result.limit === 3)).toBe(true);
			expect(results.every((result) => Number.isFinite(result.reset))).toBe(
				true,
			);
			const next = await limiter.limit("same-user");
			expect(next.success).toBe(false);
			await next.pending;
		});
	},
);
