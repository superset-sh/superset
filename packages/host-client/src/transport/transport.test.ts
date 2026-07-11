import { describe, expect, test } from "bun:test";
import SuperJSON from "superjson";
import { createHostTransport, type HostClientConfig } from "./transport";

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function trpcResult(data: unknown): unknown {
	return { result: { data: SuperJSON.serialize(data) } };
}

function makeTransport(
	handler: (url: string, init: RequestInit | undefined) => Response,
	overrides?: Partial<HostClientConfig>,
) {
	const requests: { url: string; init: RequestInit | undefined }[] = [];
	const tokens: ({ forceRefresh?: boolean } | undefined)[] = [];
	// Realistic provider: a forced refresh updates the cache, so a later
	// plain getToken() also sees "fresh".
	let cachedToken = "cached";
	const transport = createHostTransport({
		getRelayUrl: () => "https://relay.test/",
		getToken: (options) => {
			tokens.push(options);
			if (options?.forceRefresh) cachedToken = "fresh";
			return Promise.resolve(cachedToken);
		},
		fetch: ((url: string, init?: RequestInit) => {
			requests.push({ url, init });
			return Promise.resolve(handler(url, init));
		}) as typeof fetch,
		...overrides,
	});
	return { transport, requests, tokens };
}

describe("createHostTransport", () => {
	test("GET calls encode SuperJSON input as a query param", async () => {
		const { transport, requests } = makeTransport(() =>
			jsonResponse(trpcResult({ ok: true })),
		);
		const result = await transport.call<{ ok: boolean }>({
			routingKey: "rk",
			procedure: "acpSessions.list",
			input: { workspaceId: "ws" },
			method: "GET",
		});
		expect(result).toEqual({ ok: true });
		const url = new URL(requests[0]?.url ?? "");
		// Trailing slash on the relay URL must not double up in the path.
		expect(url.pathname).toBe("/hosts/rk/trpc/acpSessions.list");
		expect(JSON.parse(url.searchParams.get("input") ?? "")).toEqual(
			SuperJSON.serialize({ workspaceId: "ws" }),
		);
		expect(requests[0]?.init?.body).toBeUndefined();
	});

	test("POST calls send the SuperJSON envelope as the body", async () => {
		const { transport, requests } = makeTransport(() =>
			jsonResponse(trpcResult(null)),
		);
		await transport.call({
			routingKey: "rk",
			procedure: "acpSessions.prompt",
			input: { sessionId: "s1" },
			method: "POST",
		});
		expect(JSON.parse(String(requests[0]?.init?.body))).toEqual(
			SuperJSON.serialize({ sessionId: "s1" }),
		);
		expect(new Headers(requests[0]?.init?.headers).get("authorization")).toBe(
			"Bearer cached",
		);
	});

	test("401 refreshes the token once and retries", async () => {
		let calls = 0;
		const { transport, tokens, requests } = makeTransport(() => {
			calls += 1;
			return calls === 1
				? jsonResponse({}, 401)
				: jsonResponse(trpcResult("ok"));
		});
		const result = await transport.call({
			routingKey: "rk",
			procedure: "p.q",
			method: "GET",
		});
		expect(result).toBe("ok");
		// The refreshed token is used directly (no third getToken) and the
		// retry actually carries it — not the rejected one.
		expect(tokens).toEqual([undefined, { forceRefresh: true }]);
		expect(requests).toHaveLength(2);
		expect(new Headers(requests[0]?.init?.headers).get("authorization")).toBe(
			"Bearer cached",
		);
		expect(new Headers(requests[1]?.init?.headers).get("authorization")).toBe(
			"Bearer fresh",
		);
	});

	test("a second 401 surfaces as an error instead of looping", async () => {
		const { transport } = makeTransport(() =>
			jsonResponse({ error: { json: { message: "UNAUTHORIZED" } } }, 401),
		);
		expect(
			transport.call({ routingKey: "rk", procedure: "p.q", method: "GET" }),
		).rejects.toThrow("UNAUTHORIZED");
	});

	test("tRPC error bodies surface their real message", async () => {
		const { transport } = makeTransport(() =>
			jsonResponse({ error: { json: { message: "session not found" } } }, 404),
		);
		expect(
			transport.call({ routingKey: "rk", procedure: "p.q", method: "GET" }),
		).rejects.toThrow("session not found");
	});

	test("non-JSON error bodies fall back to the status message", async () => {
		const { transport } = makeTransport(
			() => new Response("<html>bad gateway</html>", { status: 502 }),
		);
		expect(
			transport.call({ routingKey: "rk", procedure: "p.q", method: "GET" }),
		).rejects.toThrow("host p.q failed (502)");
	});

	test("void procedures resolve to undefined", async () => {
		const { transport } = makeTransport(() => jsonResponse({ result: {} }));
		expect(
			await transport.call({
				routingKey: "rk",
				procedure: "acpSessions.cancel",
				input: { sessionId: "s1" },
				method: "POST",
			}),
		).toBeUndefined();
	});

	test("streamUrl swaps to ws and mints a fresh token per invocation", async () => {
		const { transport, tokens } = makeTransport(() => jsonResponse({}));
		const factory = transport.streamUrl({
			routingKey: "rk",
			path: "acp-sessions/s%201/stream",
		});
		expect(await factory()).toBe(
			"wss://relay.test/hosts/rk/acp-sessions/s%201/stream?token=cached",
		);
		await factory();
		// One getToken per call — reconnects never replay an expired token.
		expect(tokens).toHaveLength(2);
	});
});
