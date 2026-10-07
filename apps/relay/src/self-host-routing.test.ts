import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fixture = `import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

const forwarded: Array<{ method: string; pathWithQuery: string }> = [];
const streams: Array<{ path: string; query?: string }> = [];
const identities: string[] = [];
let authorized = true;
const stub = {
	async proxyHttp(
		_caller: unknown,
		input: { method: string; pathWithQuery: string },
	) {
		forwarded.push({
			method: input.method,
			pathWithQuery: input.pathWithQuery,
		});
		return {
			ok: true,
			status: 200,
			headers: {},
			body: new TextEncoder().encode("forwarded"),
		};
	},
	async prepareStream(
		_caller: unknown,
		_ticket: string,
		path: string,
		query?: string,
	) {
		streams.push({ path, query });
		return "ready";
	},
	async fetch() {
		return new Response("stream boundary");
	},
};
mock.module("@sentry/cloudflare", () => ({
	instrumentDurableObjectWithSentry: (_options: unknown, target: unknown) =>
		target,
	withSentry: (_options: unknown, target: unknown) => target,
}));
mock.module("partyserver", () => ({
	Server: class {},
	getServerByName: (_namespace: unknown, name: string) => {
		identities.push(name);
		return stub;
	},
}));
mock.module("@superset/shared/verify-jwt", () => ({
	verifyJWT: async () => authorized ? ({
		sub: "user",
		organizationIds: ["org", "org name"],
	}) : null,
}));
const { default: worker } = await import(__RELAY_ENTRY_URL__);
const originalFetch = globalThis.fetch;
globalThis.fetch = Object.assign(
	() => {
		throw new Error("Network refused");
	},
	{ preconnect: () => {} },
);
afterAll(() => {
	globalThis.fetch = originalFetch;
	mock.restore();
});
beforeEach(() => {
	authorized = true;
	forwarded.length = 0;
	streams.length = 0;
	identities.length = 0;
});
const env = {
	NEXT_PUBLIC_API_URL: "https://fixture.invalid",
	HostTunnel: {},
	PLACEMENT: {
		async get(key: string) {
			return {
				name: \`\${key.slice("placement:".length)}#1\`,
				generation: 1,
				continent: "unknown",
				colo: "unknown",
			};
		},
	},
};
async function request(path: string, websocket = false) {
	const fetch = worker.fetch;
	if (!fetch) throw new Error("Relay handler missing");
	return fetch(
		new Request(\`https://relay.invalid\${path}\`, {
			headers: {
				Authorization: "Bearer fixture",
				...(websocket ? { Upgrade: "websocket" } : {}),
			},
		}),
		env,
		{
			waitUntil() {
				throw new Error("Unexpected background task");
			},
			passThroughOnException() {
				throw new Error("Unexpected passthrough");
			},
		},
	);
}

describe("relay raw routing-key boundary", () => {
	test("encoded colon host preserves the exact tRPC path and query", async () => {
		const response = await request(
			"/hosts/org%3Ahost/trpc/probe?input=%7B%22a%22%3A1%7D&batch=1",
		);
		expect(response.status).toBe(200);
		expect(identities).toEqual(["org:host#1"]);
		expect(forwarded).toEqual([
			{
				method: "GET",
				pathWithQuery: "/trpc/probe?input=%7B%22a%22%3A1%7D&batch=1",
			},
		]);
	});
	test("encoded colon host preserves WebSocket path and query", async () => {
		const response = await request("/hosts/org%3Ahost/echo?value=a%2Fb", true);
		expect(response.status).toBe(200);
		expect(identities).toEqual(["org:host#1"]);
		expect(streams).toEqual([{ path: "/echo", query: "value=a%2Fb" }]);
	});
	test("encoded suffix bytes stay encoded while Hono decodes the host", async () => {
		await request("/hosts/org%20name%3Ahost/trpc/files%2Fread?name=a%20b");
		expect(identities).toEqual(["org name:host#1"]);
		expect(forwarded).toEqual([
			{ method: "GET", pathWithQuery: "/trpc/files%2Fread?name=a%20b" },
		]);
	});
	test("already unencoded colon hosts keep existing tRPC behavior", async () => {
		await request("/hosts/org:host/trpc/probe?input=x");
		expect(forwarded).toEqual([
			{ method: "GET", pathWithQuery: "/trpc/probe?input=x" },
		]);
	});
	test("trailing slash routes remain the local root", async () => {
		await request("/hosts/org%3Ahost/?token=fixture", true);
		expect(streams).toEqual([{ path: "/", query: "token=fixture" }]);
	});
	test("unencoded root keeps its existing behavior", async () => {
		await request("/hosts/org:host/", true);
		expect(streams).toEqual([{ path: "/", query: undefined }]);
	});
	test("double-slash forwarded paths remain refused", async () => {
		const response = await request("/hosts/org%3Ahost//elsewhere", true);
		expect(response.status).toBe(400);
		expect(streams).toEqual([]);
	});
	test("encoded tRPC authorization denial retains the exact RPC envelope", async () => {
		authorized = false;
		const response = await request("/hosts/org%3Ahost/trpc/probe?batch=1");
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: { json: { message: "Unauthorized", code: -32001, data: { code: "UNAUTHORIZED", httpStatus: 401 } } } });
		expect(forwarded).toEqual([]);
	});
});
`;

test("actual Hono relay routing remains isolated from other suites", () => {
	const root = mkdtempSync(join(tmpdir(), "relay-routing-"));
	try {
		const file = join(root, "fixture.test.ts");
		writeFileSync(
			file,
			fixture.replace(
				"__RELAY_ENTRY_URL__",
				JSON.stringify(new URL("./index.ts", import.meta.url).href),
			),
		);
		const child = spawnSync(process.execPath, ["--no-env-file", "test", file], {
			cwd: root,
			env: { HOME: process.env.HOME, PATH: "/usr/bin:/bin", TMPDIR: root },
			encoding: "utf8",
			timeout: 10_000,
			maxBuffer: 1024 * 1024,
		});
		process.stdout.write(child.stdout ?? "");
		process.stderr.write(child.stderr ?? "");
		if (child.error) throw child.error;
		expect(child.signal).toBeNull();
		expect(child.status).toBe(0);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
