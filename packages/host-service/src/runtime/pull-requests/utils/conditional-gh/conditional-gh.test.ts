import { describe, expect, test } from "bun:test";
import type { ExecGh } from "../../../../trpc/router/workspace-creation/utils/exec-gh";
import { ConditionalGh } from "./conditional-gh";

const GET = ["api", "--method", "GET", "repos/owner/repo/pulls"];

function response(body: unknown, etag?: string, newline = "\r\n") {
	return [
		"HTTP/2.0 200 OK",
		...(etag ? [`Etag: ${etag}`] : []),
		"",
		JSON.stringify(body),
	].join(newline);
}

function notModified() {
	return Object.assign(new Error("gh: HTTP 304"), {
		code: 1,
		stdout: "HTTP/2.0 304 Not Modified\r\n\r\n",
	});
}

function createRunner(responses: unknown[]) {
	const calls: { args: string[]; options: Parameters<ExecGh>[1] }[] = [];
	const run: ExecGh = async (args, options) => {
		calls.push({ args, options });
		const result = responses.shift();
		if (result instanceof Error) throw result;
		return result;
	};
	return { run, calls };
}

describe("conditional GitHub REST requests", () => {
	test.each([
		200, 304,
	])("keeps a newer response when an older %i revalidation finishes last", async (status) => {
		const pending = Promise.withResolvers<unknown>();
		const { run, calls } = createRunner([
			response([], '"first"'),
			pending.promise,
			response([{ number: 42 }], '"second"'),
			notModified(),
		]);
		const gh = new ConditionalGh(run);
		await gh.exec(GET);
		const older = gh.exec(GET);
		await gh.exec(GET);
		if (status === 304) pending.reject(notModified());
		else pending.resolve(response([], '"older"'));
		await older;
		expect(await gh.exec(GET)).toEqual([{ number: 42 }]);
		expect(calls[3]?.args).toContain('If-None-Match: "second"');
	});

	test.each([
		200, 304,
	])("does not restore responses cleared during a pending %i request", async (status) => {
		const pending = Promise.withResolvers<unknown>();
		const { run, calls } = createRunner([
			response([], '"first"'),
			pending.promise,
			response([]),
		]);
		const gh = new ConditionalGh(run);
		await gh.exec(GET);
		const request = gh.exec(GET);
		gh.clear();
		if (status === 304) pending.reject(notModified());
		else pending.resolve(response([], '"second"'));
		await request;
		await gh.exec(GET);
		expect(calls[2]?.args).not.toContain("--header");
	});

	test("revalidates with weak ETags and handles gh's nonzero 304 exit", async () => {
		const body = [{ number: 42 }];
		const { run, calls } = createRunner([
			response(body, 'W/"first"'),
			notModified(),
		]);
		const gh = new ConditionalGh(run);
		expect(await gh.exec(GET)).toEqual(body);
		expect(await gh.exec(GET)).toEqual(body);
		expect(calls[0]?.args).toEqual([...GET, "--include"]);
		expect(calls[1]?.args).toEqual([
			...GET,
			"--include",
			"--header",
			'If-None-Match: W/"first"',
		]);
	});

	test("replaces both the validator and body when the resource changes", async () => {
		const { run, calls } = createRunner([
			response([], '"first"', "\n"),
			response([{ number: 42 }], '"second"', "\n"),
			notModified(),
		]);
		const gh = new ConditionalGh(run);
		await gh.exec(GET);
		expect(await gh.exec(GET)).toEqual([{ number: 42 }]);
		expect(await gh.exec(GET)).toEqual([{ number: 42 }]);
		expect(calls[2]?.args).toContain('If-None-Match: "second"');
	});

	test("removes an old validator when the server stops sending ETags", async () => {
		const { run, calls } = createRunner([
			response([], '"first"'),
			response([{ number: 42 }]),
			response([]),
		]);
		const gh = new ConditionalGh(run);
		await gh.exec(GET);
		expect(await gh.exec(GET)).toEqual([{ number: 42 }]);
		await gh.exec(GET);
		expect(calls[2]?.args).not.toContain("--header");
	});

	test("keeps query fields, projections and working directories isolated", async () => {
		const { run, calls } = createRunner(
			Array.from({ length: 5 }, () => response([], '"etag"')),
		);
		const gh = new ConditionalGh(run);
		await gh.exec([...GET, "-f", "head=owner:Feature"]);
		await gh.exec([...GET, "-f", "head=owner:feature"]);
		await gh.exec([...GET, "--jq", "[.[] | {number}]"]);
		await gh.exec(GET, { cwd: "/first", timeout: 123, maxBuffer: 456 });
		await gh.exec(GET, { cwd: "/second" });
		expect(calls.every(({ args }) => !args.includes("--header"))).toBe(true);
		expect(calls[3]?.options).toEqual({
			cwd: "/first",
			timeout: 123,
			maxBuffer: 456,
		});
	});

	test("leaves GraphQL and mutations unchanged", async () => {
		const { run, calls } = createRunner([{ data: {} }, { number: 42 }]);
		const gh = new ConditionalGh(run);
		const graphql = [
			"api",
			"graphql",
			"-f",
			"query=query { viewer { login } }",
		];
		const mutation = ["api", "--method", "PATCH", "repos/owner/repo/pulls/42"];
		expect(await gh.exec(graphql)).toEqual({ data: {} });
		expect(await gh.exec(mutation)).toEqual({ number: 42 });
		expect(calls.map(({ args }) => args)).toEqual([graphql, mutation]);
	});

	test("propagates rate limits and discards cached data after a failed read", async () => {
		const failure = Object.assign(new Error("gh: HTTP 403"), {
			code: 1,
			stdout: "HTTP/2.0 403 Forbidden\r\n\r\n{}",
		});
		const { run, calls } = createRunner([
			response([], '"first"'),
			failure,
			response([]),
		]);
		const gh = new ConditionalGh(run);
		await gh.exec(GET);
		await expect(gh.exec(GET)).rejects.toBe(failure);
		await gh.exec(GET);
		expect(calls[2]?.args).not.toContain("--header");
	});

	test("does not swallow an incomplete process failure containing 304 headers", async () => {
		const failure = Object.assign(notModified(), { code: "ETIMEDOUT" });
		const { run } = createRunner([response([], '"first"'), failure]);
		const gh = new ConditionalGh(run);
		await gh.exec(GET);
		await expect(gh.exec(GET)).rejects.toBe(failure);
	});

	test("does not accept 304 without a cached response", async () => {
		const failure = notModified();
		const { run } = createRunner([failure]);
		await expect(new ConditionalGh(run).exec(GET)).rejects.toBe(failure);
	});

	test("evicts the least recently used response at the entry limit", async () => {
		const { run, calls } = createRunner([
			response([], '"first"'),
			response([], '"second"'),
			notModified(),
			response([], '"third"'),
			response([], '"second"'),
		]);
		const gh = new ConditionalGh(run, { maxEntries: 2, maxBytes: 4096 });
		await gh.exec([...GET, "-f", "head=owner:first"]);
		await gh.exec([...GET, "-f", "head=owner:second"]);
		await gh.exec([...GET, "-f", "head=owner:first"]);
		await gh.exec([...GET, "-f", "head=owner:third"]);
		await gh.exec([...GET, "-f", "head=owner:second"]);
		expect(calls[2]?.args).toContain('If-None-Match: "first"');
		expect(calls[4]?.args).not.toContain("--header");
	});

	test("bounds cached response bytes as well as entry count", async () => {
		const { run, calls } = createRunner([
			response("a".repeat(100), '"first"'),
			response("b".repeat(100), '"second"'),
			response([], '"first"'),
		]);
		const gh = new ConditionalGh(run, { maxEntries: 100, maxBytes: 300 });
		await gh.exec([...GET, "-f", "head=owner:first"]);
		await gh.exec([...GET, "-f", "head=owner:second"]);
		await gh.exec([...GET, "-f", "head=owner:first"]);
		expect(calls[2]?.args).not.toContain("--header");
	});

	test("returns oversized responses without retaining them", async () => {
		const { run, calls } = createRunner([
			response("a".repeat(200), '"big"'),
			response([]),
		]);
		const gh = new ConditionalGh(run, { maxEntries: 100, maxBytes: 100 });
		expect(await gh.exec(GET)).toBe("a".repeat(200));
		await gh.exec(GET);
		expect(calls[1]?.args).not.toContain("--header");
	});

	test("cached bodies cannot be mutated by a caller", async () => {
		const { run } = createRunner([
			response([{ number: 42 }], '"first"'),
			notModified(),
		]);
		const gh = new ConditionalGh(run);
		const first = (await gh.exec(GET)) as { number: number }[];
		first.push({ number: 43 });
		expect(await gh.exec(GET)).toEqual([{ number: 42 }]);
	});

	test("clears stored responses when the runtime stops", async () => {
		const { run, calls } = createRunner([
			response([], '"first"'),
			response([]),
		]);
		const gh = new ConditionalGh(run);
		await gh.exec(GET);
		gh.clear();
		await gh.exec(GET);
		expect(calls[1]?.args).not.toContain("--header");
	});
});

function ghOutput(status: string, headers: Record<string, string>, body = "") {
	const lines = Object.entries(headers).map(
		([name, value]) => `${name}: ${value}\r\n`,
	);
	return `${status}\n${lines.join("")}\r\n${body}`;
}

const EXPOSE = "ETag, Link, Location, Retry-After, X-RateLimit-Used";

function ghNotModified(etag: string, proto = "HTTP/2.0") {
	return Object.assign(new Error("Command failed: gh api"), {
		code: 1,
		stdout: ghOutput(`${proto} 304 Not Modified`, {
			"Access-Control-Expose-Headers": EXPOSE,
			Etag: etag,
		}),
		stderr: "unexpected end of JSON input\n",
	});
}

describe("gh api --include output shapes", () => {
	test("reads gh's LF status line, CRLF headers and an ETag named in another header", async () => {
		const { run, calls } = createRunner([
			ghOutput(
				"HTTP/2.0 200 OK",
				{ "Access-Control-Expose-Headers": EXPOSE, Etag: 'W/"abc"' },
				'[{"number":1}]',
			),
			ghNotModified('"abc"'),
		]);
		const gh = new ConditionalGh(run);
		expect(await gh.exec(GET)).toEqual([{ number: 1 }]);
		expect(await gh.exec(GET)).toEqual([{ number: 1 }]);
		expect(calls[1]?.args).toContain('If-None-Match: W/"abc"');
	});

	test("reads HTTP/1.1 responses with a lowercase etag header", async () => {
		const { run, calls } = createRunner([
			ghOutput("HTTP/1.1 200 OK", { etag: '"ghe"' }, "[]"),
			ghNotModified('"ghe"', "HTTP/1.1"),
		]);
		const gh = new ConditionalGh(run);
		await gh.exec(GET);
		expect(await gh.exec(GET)).toEqual([]);
		expect(calls[1]?.args).toContain('If-None-Match: "ghe"');
	});

	test("keeps the stored weak validator when a 304 echoes its strong form", async () => {
		const { run, calls } = createRunner([
			ghOutput("HTTP/2.0 200 OK", { Etag: 'W/"abc"' }, "[]"),
			ghNotModified('"abc"'),
			ghNotModified('"abc"'),
		]);
		const gh = new ConditionalGh(run);
		await gh.exec(GET);
		await gh.exec(GET);
		await gh.exec(GET);
		expect(calls[2]?.args).toContain('If-None-Match: W/"abc"');
	});

	test("accepts a 304 from a gh that exits 0", async () => {
		const { run } = createRunner([
			ghOutput("HTTP/2.0 200 OK", { Etag: '"abc"' }, '{"a":1}'),
			ghOutput("HTTP/2.0 304 Not Modified", { Etag: '"abc"' }),
		]);
		const gh = new ConditionalGh(run);
		await gh.exec(GET);
		expect(await gh.exec(GET)).toEqual({ a: 1 });
	});

	test("sends back the joined value when gh merges several etag headers", async () => {
		const { run, calls } = createRunner([
			ghOutput("HTTP/2.0 200 OK", { Etag: 'W/"a", W/"b"' }, "[]"),
			ghNotModified('"a"'),
		]);
		const gh = new ConditionalGh(run);
		await gh.exec(GET);
		expect(await gh.exec(GET)).toEqual([]);
		expect(calls[1]?.args).toContain('If-None-Match: W/"a", W/"b"');
	});

	test("round-trips a null body through a 304", async () => {
		const { run } = createRunner([
			ghOutput("HTTP/2.0 200 OK", { Etag: '"n"' }, "null"),
			ghNotModified('"n"'),
		]);
		const gh = new ConditionalGh(run);
		expect(await gh.exec(GET)).toBeNull();
		expect(await gh.exec(GET)).toBeNull();
	});

	test("serves a 304 whose entry was evicted while the request was in flight", async () => {
		const pending = Promise.withResolvers<unknown>();
		const { run } = createRunner([
			ghOutput("HTTP/2.0 200 OK", { Etag: '"a"' }, "[1]"),
			pending.promise,
			ghOutput("HTTP/2.0 200 OK", { Etag: '"b"' }, "[2]"),
		]);
		const gh = new ConditionalGh(run, { maxEntries: 1, maxBytes: 4096 });
		await gh.exec(GET);
		const revalidation = gh.exec(GET);
		await gh.exec([...GET, "-f", "head=owner:other"]);
		pending.reject(ghNotModified('"a"'));
		expect(await revalidation).toEqual([1]);
	});

	test("serves concurrent identical revalidations from one entry", async () => {
		const { run, calls } = createRunner([
			ghOutput("HTTP/2.0 200 OK", { Etag: '"a"' }, "[1]"),
			ghNotModified('"a"'),
			ghNotModified('"a"'),
		]);
		const gh = new ConditionalGh(run);
		await gh.exec(GET);
		expect(await Promise.all([gh.exec(GET), gh.exec(GET)])).toEqual([[1], [1]]);
		expect(
			calls.slice(1).every(({ args }) => args.includes('If-None-Match: "a"')),
		).toBe(true);
	});

	test("does not serve a cached body when revalidation hits a server error", async () => {
		const failure = Object.assign(new Error("Command failed: gh api"), {
			code: 1,
			stdout: ghOutput(
				"HTTP/2.0 502 Bad Gateway",
				{ "Content-Type": "application/json" },
				'{"message":"Server Error"}',
			),
		});
		const { run } = createRunner([
			ghOutput("HTTP/2.0 200 OK", { Etag: '"a"' }, "[1]"),
			failure,
		]);
		const gh = new ConditionalGh(run);
		await gh.exec(GET);
		await expect(gh.exec(GET)).rejects.toBe(failure);
	});
});
