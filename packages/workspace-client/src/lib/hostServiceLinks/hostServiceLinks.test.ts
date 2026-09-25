import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createTRPCClient, TRPCClientError, type TRPCLink } from "@trpc/client";
import { initTRPC } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import superjson from "superjson";
import {
	createHostServiceLinks,
	isMethodOverrideRejection,
} from "./hostServiceLinks";

const t = initTRPC.create({ transformer: superjson });
const router = t.router({
	settings: t.router({
		agentConfigs: t.router({
			list: t.procedure.query(() => [{ id: "claude" }]),
			echo: t.procedure
				.input((value: unknown) => value as { n: number })
				.query(({ input }) => input),
			boom: t.procedure.query(() => {
				throw new Error("host exploded");
			}),
			reorder: t.procedure.mutation(() => "reordered"),
		}),
	}),
});
type TestRouter = typeof router;

/**
 * A host-service at a given version: pre-1.24.0 hosts run tRPC without
 * `allowMethodOverride`, so a POSTed query is rejected per call with
 * METHOD_NOT_SUPPORTED while mutations work as usual.
 */
function fakeHost(hostUrl: string, opts: { allowMethodOverride: boolean }) {
	const methods: string[] = [];
	hosts.set(hostUrl, (req) => {
		methods.push(req.method);
		return fetchRequestHandler({
			endpoint: "/trpc",
			req,
			router,
			allowMethodOverride: opts.allowMethodOverride,
		});
	});
	const client = createTRPCClient<TestRouter>({
		// The links are typed against host-service's AppRouter; the test
		// router only needs to match the wire protocol.
		links: createHostServiceLinks({
			url: `${hostUrl}/trpc`,
		}) as unknown as TRPCLink<TestRouter>[],
	});
	return { client, methods };
}

const hosts = new Map<string, (req: Request) => Promise<Response>>();
const realFetch = globalThis.fetch;

beforeAll(() => {
	globalThis.fetch = (async (
		input: string | URL | Request,
		init?: RequestInit,
	) => {
		const req =
			input instanceof Request ? input : new Request(String(input), init);
		const host = hosts.get(new URL(req.url).origin);
		if (!host) throw new Error(`no fake host for ${req.url}`);
		return host(req);
	}) as unknown as typeof fetch;
});

afterAll(() => {
	globalThis.fetch = realFetch;
});

describe("createHostServiceLinks", () => {
	test("queries a current host with POST", async () => {
		const { client, methods } = fakeHost("http://modern.test", {
			allowMethodOverride: true,
		});

		expect(await client.settings.agentConfigs.list.query()).toEqual([
			{ id: "claude" },
		]);
		expect(methods).toEqual(["POST"]);
	});

	test("replays a query over GET when a pre-1.24 host rejects the POST", async () => {
		const { client, methods } = fakeHost("http://legacy.test", {
			allowMethodOverride: false,
		});

		expect(await client.settings.agentConfigs.list.query()).toEqual([
			{ id: "claude" },
		]);
		expect(methods).toEqual(["POST", "GET"]);
	});

	test("remembers a legacy host so later queries skip the failing POST", async () => {
		const first = fakeHost("http://remembered.test", {
			allowMethodOverride: false,
		});
		await first.client.settings.agentConfigs.list.query();
		expect(first.methods).toEqual(["POST", "GET"]);

		await first.client.settings.agentConfigs.list.query();
		expect(first.methods).toEqual(["POST", "GET", "GET"]);

		// A fresh client for the same endpoint (another provider, a cache miss)
		// inherits the fallback instead of paying the rejection again.
		const second = fakeHost("http://remembered.test", {
			allowMethodOverride: false,
		});
		expect(await second.client.settings.agentConfigs.list.query()).toEqual([
			{ id: "claude" },
		]);
		expect(second.methods).toEqual(["GET"]);
	});

	test("replays every query in a rejected batch, with inputs intact", async () => {
		const { client, methods } = fakeHost("http://batch.test", {
			allowMethodOverride: false,
		});

		const [list, echoed] = await Promise.all([
			client.settings.agentConfigs.list.query(),
			client.settings.agentConfigs.echo.query({ n: 42 }),
		]);

		expect(list).toEqual([{ id: "claude" }]);
		expect(echoed).toEqual({ n: 42 });
		expect(methods).toEqual(["POST", "GET"]);
	});

	test("still sends mutations to a legacy host as POST", async () => {
		const { client, methods } = fakeHost("http://legacy-mutation.test", {
			allowMethodOverride: false,
		});

		expect(await client.settings.agentConfigs.reorder.mutate()).toBe(
			"reordered",
		);
		expect(methods).toEqual(["POST"]);
	});

	test("does not retry a query that failed for any other reason", async () => {
		const { client, methods } = fakeHost("http://faulty.test", {
			allowMethodOverride: true,
		});

		await expect(client.settings.agentConfigs.boom.query()).rejects.toThrow(
			"host exploded",
		);
		expect(methods).toEqual(["POST"]);
	});

	test("re-probes POST after the host restarts on the same endpoint", async () => {
		const legacy = fakeHost("http://restarted.test", {
			allowMethodOverride: false,
		});
		await legacy.client.settings.agentConfigs.list.query();
		expect(legacy.methods).toEqual(["POST", "GET"]);

		// The old process dies: the next request never reaches a server.
		hosts.set("http://restarted.test", async () => {
			throw new TypeError("Failed to fetch");
		});
		await expect(
			legacy.client.settings.agentConfigs.list.query(),
		).rejects.toThrow("Failed to fetch");

		// The desktop respawns a current host-service on the same port; the
		// client that fell back must not stay on GET for it.
		const modern = fakeHost("http://restarted.test", {
			allowMethodOverride: true,
		});
		expect(await legacy.client.settings.agentConfigs.list.query()).toEqual([
			{ id: "claude" },
		]);
		expect(modern.methods).toEqual(["POST"]);
	});
});

describe("isMethodOverrideRejection", () => {
	test("matches tRPC's method-check rejection", () => {
		const rejection = TRPCClientError.from({
			error: {
				message:
					'Unsupported POST-request to query procedure at path "settings.agentConfigs.list"',
				code: -32005,
				data: {
					code: "METHOD_NOT_SUPPORTED",
					httpStatus: 405,
					path: "settings.agentConfigs.list",
				},
			},
		});
		expect(isMethodOverrideRejection(rejection)).toBe(true);
	});

	test("ignores errors without the tRPC method-check code", () => {
		expect(isMethodOverrideRejection(new Error("Failed to fetch"))).toBe(false);
		expect(
			isMethodOverrideRejection(TRPCClientError.from(new Error("boom"))),
		).toBe(false);
	});
});
