import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { TunnelClient } from "./tunnel-client";

const LOCAL_PORT = 38017;
const SECRET = "host-service-secret";
const LOCAL_ORIGIN = `http://127.0.0.1:${LOCAL_PORT}`;

const realFetch = globalThis.fetch;
let calls: { url: string; authorization: string | undefined }[] = [];

beforeEach(() => {
	calls = [];
	globalThis.fetch = mock(
		async (input: string | URL | Request, init?: RequestInit) => {
			const headers = new Headers(init?.headers);
			calls.push({
				url: input instanceof URL ? input.toString() : String(input),
				authorization: headers.get("authorization") ?? undefined,
			});
			return new Response("ok", { status: 200 });
		},
	) as unknown as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = realFetch;
	mock.restore();
});

function client() {
	return new TunnelClient({
		relayUrl: "https://relay.example",
		hostId: "org:host",
		getAuthToken: async () => null,
		localPort: LOCAL_PORT,
		hostServiceSecret: SECRET,
	});
}

/** A relay dial-back socket, recording what the host sends back on it. */
function fakeRelaySocket() {
	const sent: string[] = [];
	return {
		sent,
		socket: {
			send: (data: string | ArrayBuffer) => {
				if (typeof data === "string") sent.push(data);
			},
			close: mock(() => {}),
		} as unknown as WebSocket,
	};
}

function forward(path: string) {
	const relay = fakeRelaySocket();
	// biome-ignore lint/complexity/useLiteralKeys: exercises the private forward without a live relay.
	const done = client()["forwardHttp"](
		relay.socket,
		{ method: "GET", path, headers: {} },
		[],
	);
	return { relay, done };
}

test("forwards an ordinary path to the local host-service with the secret", async () => {
	const { relay, done } = forward("/trpc/health.check?foo=bar");
	await done;

	expect(calls).toEqual([
		{
			url: `${LOCAL_ORIGIN}/trpc/health.check?foo=bar`,
			authorization: `Bearer ${SECRET}`,
		},
	]);
	expect(relay.sent[0]).toContain('"status":200');
});

// GHSA-h894-rmgp-jv6m: the local URL was built by string-concatenating a path
// the relay chose onto the loopback origin, so a path that moves the host took
// HOST_SERVICE_SECRET to the relay's origin of choice.
test.each([
	["userinfo", "@evil.example/x"],
	["userinfo after a colon", ":pw@evil.example/x"],
	["absolute URL", "http://evil.example/x"],
	["protocol-relative", "//evil.example/x"],
	["backslash protocol-relative", "/\\evil.example/x"],
	["tab-smuggled protocol-relative", "/\t/evil.example/x"],
])("never sends the secret off-origin for a %s path", async (_name, path) => {
	const { relay, done } = forward(path);
	await done;

	for (const call of calls) {
		expect(new URL(call.url).origin).toBe(LOCAL_ORIGIN);
	}
	expect(relay.sent.join("")).not.toContain(SECRET);
});

test("refuses an origin-moving path outright rather than rewriting it", async () => {
	const { relay, done } = forward("@evil.example/x");
	await done;

	expect(calls).toEqual([]);
	expect(relay.sent[0]).toContain('"status":400');
	expect(relay.sent.at(-1)).toContain("http:end");
});
