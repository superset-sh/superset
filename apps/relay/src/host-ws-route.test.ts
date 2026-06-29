import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { parseHostWsRequest } from "./host-ws-route";

// Keep the heavyweight relay deps out of this unit test: the real `./env`
// validates Upstash/API env vars at import, `./directory` constructs a Redis
// client, and `./api-client` builds a tRPC client. Stub all three so we can
// exercise `TunnelManager` in isolation.
mock.module("./env", () => ({
	env: { FLY_REGION: "local", FLY_MACHINE_ID: "local" },
}));
mock.module("./directory", () => ({
	register: async () => {},
	unregister: async () => {},
	heartbeat: async () => {},
	lookup: async () => null,
}));
mock.module("./api-client", () => ({
	createApiClient: () => ({
		host: { setOnline: { mutate: async () => {} } },
	}),
}));

const { TunnelManager } = await import("./tunnel");

function fakeWs() {
	return {
		send: () => {},
		readyState: 1,
		close: () => {},
	};
}

describe("relay WS proxy hostId routing (issue #5270 / #5243)", () => {
	// The routing key embeds a colon (`<org>:<machine>`); WebSocket clients
	// percent-encode it to `%3A` in the URL path. The tunnel is registered
	// under the decoded key, mirroring how the host's TunnelClient connects
	// (`/tunnel?hostId=<org>:<machine>`, which Hono decodes).
	const decodedHostId = "org-123:machine-abc";
	const encodedPathname = `/hosts/${encodeURIComponent(decodedHostId)}/terminal/abc-def`;

	let manager: InstanceType<typeof TunnelManager>;

	beforeAll(async () => {
		manager = new TunnelManager();
		await manager.register(decodedHostId, "jwt-token", fakeWs());
	});

	afterAll(() => {
		manager.unregister(decodedHostId);
	});

	test("the WS path's hostId segment decodes to the registered tunnel key", () => {
		const { hostId, path } = parseHostWsRequest(encodedPathname);
		// Before the fix this is the still-encoded "org-123%3Amachine-abc",
		// which no longer matches the registered tunnel key.
		expect(hostId).toBe(decodedHostId);
		expect(path).toBe("/terminal/abc-def");
	});

	test("opening a WS channel for an encoded-hostId path reaches the tunnel", () => {
		const { hostId, path } = parseHostWsRequest(encodedPathname);
		// This is the exact relay call site: a mismatch here throws
		// "Host not connected", which the route handler reports to the client
		// as `1011 Failed to open channel` (#5243) / a failed upgrade (#5270).
		expect(() =>
			manager.openWsChannel(hostId, path, "token=redacted", fakeWs()),
		).not.toThrow();
	});

	test("tRPC/HTTP requests already resolve the tunnel (control: works today)", async () => {
		// Sanity check that the tunnel really is registered under the decoded
		// key — the HTTP path uses the decoded hostId, which is why tRPC works
		// over the same tunnel while the terminal WebSocket fails.
		expect(manager.hasTunnel(decodedHostId)).toBe(true);
		expect(manager.hasTunnel(encodeURIComponent(decodedHostId))).toBe(false);
	});
});
